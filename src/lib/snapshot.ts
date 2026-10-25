// Pure transform from raw OpenF1 responses to the snapshot the calculator renders.
// No I/O here: src/lib/openf1.ts fetches, src/lib/load-snapshot.ts decides caching.

export type Meeting = {
  meeting_key: number;
  meeting_name: string;
  date_start: string;
  is_cancelled: boolean;
  year: number;
};
export type Session = {
  session_key: number;
  session_name: string;
  meeting_key: number;
  date_start: string;
  date_end: string;
  is_cancelled: boolean;
};
export type ChampionshipDriver = { driver_number: number; position_current: number; points_current: number };
export type ChampionshipTeam = { team_name: string; position_current: number; points_current: number };
export type DriverRow = {
  driver_number: number;
  name_acronym: string;
  first_name: string;
  last_name: string;
  team_name: string;
  team_colour: string | null;
  headshot_url: string | null;
};

export type RaceWinner = { session_key: number; driver_number: number };

/** Everything OpenF1 is asked for in one refresh of one season. */
export type RawSeason = {
  year: number;
  meetings: Meeting[];
  sessions: Session[];
  /** Race session whose championship rows were read, or null when no race has been scored yet. */
  championshipSessionKey: number | null;
  championshipDrivers: ChampionshipDriver[];
  championshipTeams: ChampionshipTeam[];
  /** The grid as of the standings session (or the latest started session before round 1). */
  drivers: DriverRow[];
  /** Last known rows for drivers who are in the championship but no longer on the grid. */
  departedDrivers: DriverRow[];
  /** Position-1 results across the season; only Race sessions count as wins. */
  raceWinners: RaceWinner[];
};

export type SnapshotDriver = {
  driverId: string;
  code: string;
  number: number;
  name: string;
  teamId: string;
  teamName: string;
  colour: string | null;
  photo: string | null;
  points: number;
  wins: number;
  position: number;
  departed: boolean;
};

export type SnapshotTeam = {
  teamId: string;
  name: string;
  colour: string | null;
  points: number;
  wins: number;
  position: number;
};

export type SnapshotRound = {
  raceId: string;
  name: string;
  round: number;
  /** Race day (UTC), YYYY-MM-DD. */
  date: string;
  /** End of the Grand Prix session, ISO. Drives the cache lifetime. */
  raceEnd: string;
  sprint: boolean;
  played: boolean;
};

export type Snapshot = {
  season: number;
  generatedAt: string;
  sources: string[];
  drivers: SnapshotDriver[];
  teams: SnapshotTeam[];
  rounds: SnapshotRound[];
  points: { race: number[]; sprint: number[]; fastestLap: number };
};

// No API publishes the points system (OpenF1 does not): it lives here
// as data, so a rule change (e.g. a fastest-lap point returning) flows to the available-points
// boxes and the solver without touching UI or engine code.
const POINTS = {
  race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  sprint: [8, 7, 6, 5, 4, 3, 2, 1],
  fastestLap: 0, // per Grand Prix, sprints excluded; 1 extra pt/round if reintroduced
};

const slug = (text: string, sep = "_") =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, sep)
    .replace(new RegExp(`^${sep}|${sep}$`, "g"), "");

// Headshots live on F1's CDN under a fixed pattern. The snapshot keeps only the variable
// part as the same-origin route `/drivers/<path>`, so serving a photo needs no OpenF1 call
// (OpenF1 rate-limits hard) and the route can only ever fetch from this one CDN path.
const CDN = "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/";
const CDN_SUFFIX = ".transform/1col/image.png";
const PHOTO_PATH = /^[A-Z]\/[A-Za-z0-9_]+\/[a-z0-9]+\.png$/;

function photoRoute(headshotUrl: string | null): string | null {
  if (!headshotUrl?.startsWith(CDN) || !headshotUrl.endsWith(CDN_SUFFIX)) return null;
  const path = headshotUrl.slice(CDN.length, -CDN_SUFFIX.length);
  return PHOTO_PATH.test(path) ? `/drivers/${path}` : null;
}

/** The F1 CDN URL behind a `/drivers/<path>` photo route, or null for anything else. */
export function headshotUrlFor(path: string): string | null {
  return PHOTO_PATH.test(path) ? `${CDN}${path}${CDN_SUFFIX}` : null;
}

/** A Grand Prix session (not a sprint) that is still on the calendar. */
export const isGrandPrix = (s: Session) => s.session_name === "Race" && !s.is_cancelled;

function buildRounds(raw: RawSeason): SnapshotRound[] {
  const sessionsByMeeting = new Map<number, Session[]>();
  for (const s of raw.sessions) sessionsByMeeting.set(s.meeting_key, [...(sessionsByMeeting.get(s.meeting_key) ?? []), s]);
  // Testing weekends and cancelled weekends are not rounds and take no round number.
  const weekends = raw.meetings
    .filter((m) => /Grand Prix/.test(m.meeting_name) && !m.is_cancelled)
    .sort((a, b) => a.date_start.localeCompare(b.date_start));
  const scored = raw.sessions.find((s) => s.session_key === raw.championshipSessionKey);

  // A weekend OpenF1 lists without a Race session yet cannot be a round, so it takes no number.
  const withRace = weekends.flatMap((m) => {
    const sessions = sessionsByMeeting.get(m.meeting_key) ?? [];
    const race = sessions.find(isGrandPrix);
    return race ? [{ m, sessions, race }] : [];
  });

  return withRace.map(({ m, sessions, race }, i): SnapshotRound => ({
    raceId: `${slug(m.meeting_name, "-")}-${m.year}`,
    name: m.meeting_name,
    round: i + 1,
    date: race.date_start.slice(0, 10),
    raceEnd: race.date_end,
    sprint: sessions.some((s) => s.session_name === "Sprint" && !s.is_cancelled),
    // Played means the race is in the standings, not that the clock has passed it.
    played: scored !== undefined && race.date_start <= scored.date_start,
  }));
}

export function buildSnapshot(raw: RawSeason, now: Date): Snapshot | null {
  const gridByNumber = new Map(raw.drivers.map((d) => [d.driver_number, d]));
  const departedByNumber = new Map(raw.departedDrivers.map((d) => [d.driver_number, d]));
  const rounds = buildRounds(raw);
  if (rounds.length === 0 || raw.drivers.length === 0) return null; // season not published yet

  // Before the first race there are no championship rows: everyone starts on zero, in grid order.
  const standings = raw.championshipDrivers.length
    ? [...raw.championshipDrivers].sort((a, b) => a.position_current - b.position_current)
    : raw.drivers.map((d, i) => ({ driver_number: d.driver_number, position_current: i + 1, points_current: 0 }));

  // Wins are Grand Prix victories only: OpenF1 returns the position-1 result of every
  // session (practice, qualifying, sprint), so keep just the Race sessions.
  const raceKeys = new Set(raw.sessions.filter(isGrandPrix).map((s) => s.session_key));
  const winsByNumber = new Map<number, number>();
  for (const w of raw.raceWinners) {
    if (raceKeys.has(w.session_key)) winsByNumber.set(w.driver_number, (winsByNumber.get(w.driver_number) ?? 0) + 1);
  }

  const drivers = standings.map((row): SnapshotDriver => {
    const onGrid = gridByNumber.get(row.driver_number);
    const info = onGrid ?? departedByNumber.get(row.driver_number);
    if (!info) throw new Error(`OpenF1 has standings for driver #${row.driver_number} but no driver details`);
    return {
      driverId: info.name_acronym.toLowerCase(),
      code: info.name_acronym,
      number: row.driver_number,
      name: `${info.first_name} ${info.last_name}`,
      teamId: slug(info.team_name),
      teamName: info.team_name,
      colour: info.team_colour ? `#${info.team_colour}` : null,
      photo: photoRoute(info.headshot_url),
      points: row.points_current,
      wins: winsByNumber.get(row.driver_number) ?? 0,
      position: row.position_current,
      departed: !onGrid,
    };
  });

  // Constructor wins and colours follow each driver's team as of the standings session; a
  // driver who won and later switched teams credits the new team (display tie-break only).
  const winsByTeam = new Map<string, number>();
  const colourByTeam = new Map<string, string>();
  for (const d of drivers) {
    winsByTeam.set(d.teamName, (winsByTeam.get(d.teamName) ?? 0) + d.wins);
    if (d.colour && !colourByTeam.has(d.teamName)) colourByTeam.set(d.teamName, d.colour);
  }
  const teamStandings = raw.championshipTeams.length
    ? raw.championshipTeams
    : [...new Set(raw.drivers.map((d) => d.team_name))].map((team_name, i) => ({
        team_name,
        position_current: i + 1,
        points_current: 0,
      }));
  const teams = [...teamStandings]
    .sort((a, b) => a.position_current - b.position_current)
    .map((row): SnapshotTeam => ({
      teamId: slug(row.team_name),
      name: row.team_name,
      colour: colourByTeam.get(row.team_name) ?? null,
      points: row.points_current,
      wins: winsByTeam.get(row.team_name) ?? 0,
      position: row.position_current,
    }));

  return {
    season: raw.year,
    generatedAt: now.toISOString(),
    sources: ["https://api.openf1.org"],
    drivers,
    teams,
    rounds,
    points: POINTS,
  };
}

const HOUR = 3600;
const MAX_CACHE_SECONDS = 3 * 24 * HOUR;
// OpenF1 publishes results "a few minutes" after the flag, and the scheduled end is already
// past the real finish. Anything later is caught by the 10-minute retry below.
const RESULTS_DELAY_SECONDS = 30 * 60;
const RETRY_SECONDS = 10 * 60;
const GIVE_UP_MS = 24 * HOUR * 1000;

/**
 * How long a rendered page may be served from Vercel's cache. Standings only move when a
 * Grand Prix is scored, so the page stays cached until 30 minutes after the next one ends
 * (never more than 3 days). A race that has just finished but is not in the standings yet is
 * retried every 10 minutes for a day.
 */
export function cacheSeconds(snapshot: Snapshot, now: Date): number {
  // Still showing last season's final table: look for the new calendar every hour.
  if (snapshot.season < now.getUTCFullYear()) return HOUR;

  const t = now.getTime();
  const unplayedEnds = snapshot.rounds.filter((r) => !r.played).map((r) => Date.parse(r.raceEnd));
  if (unplayedEnds.some((end) => end <= t && t - end < GIVE_UP_MS)) return RETRY_SECONDS;

  const next = Math.min(...unplayedEnds.filter((end) => end > t));
  if (!Number.isFinite(next)) return MAX_CACHE_SECONDS;
  return Math.min(MAX_CACHE_SECONDS, Math.ceil((next - t) / 1000) + RESULTS_DELAY_SECONDS);
}

/** Grand Prix sessions that have ended, newest first: the candidates for "latest standings". */
export function finishedRaceSessions(sessions: Session[], now: Date): Session[] {
  const t = now.getTime();
  return sessions
    .filter((s) => isGrandPrix(s) && Date.parse(s.date_end) <= t)
    .sort((a, b) => b.date_start.localeCompare(a.date_start));
}

/** Newest session of any kind that has started; before round 1 this is a testing day. */
export function latestStartedSession(sessions: Session[], now: Date): Session | undefined {
  const t = now.getTime();
  return sessions
    .filter((s) => !s.is_cancelled && Date.parse(s.date_start) <= t)
    .sort((a, b) => b.date_start.localeCompare(a.date_start))[0];
}
