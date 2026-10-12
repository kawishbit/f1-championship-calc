// Thin OpenF1 client: sequential requests, one retry on 429, a shared deadline.
// All decisions about the data live in snapshot.ts; this file only moves bytes.
import {
  finishedRaceSessions,
  latestStartedSession,
  type ChampionshipDriver,
  type ChampionshipTeam,
  type DriverRow,
  isGrandPrix,
  type Meeting,
  type RaceWinner,
  type RawSeason,
  type Session,
} from "./snapshot.ts";

const BASE = "https://api.openf1.org/v1";
const REQUEST_TIMEOUT_MS = 5000;
const MAX_RETRY_WAIT_MS = 3000;

export class OpenF1Error extends Error {
  status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "OpenF1Error";
    this.status = status;
  }
}

export type FetchOptions = {
  /** Aborts the whole refresh; each request also has its own timeout. */
  signal?: AbortSignal;
};

/** GET one OpenF1 collection. OpenF1 answers 404 when a filter matches nothing: that is an empty list. */
export async function getRows<T>(path: string, opts: FetchOptions = {}): Promise<T[]> {
  const { signal } = opts;
  for (let attempt = 1; ; attempt++) {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const res = await fetch(`${BASE}/${path}`, {
      headers: { "User-Agent": "f1-championship-calc" },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (res.status === 404) return [];
    if (res.status === 429 && attempt === 1) {
      // OpenF1 rate-limits hard (Retry-After is typically 60 s): only a short wait is worth
      // holding the render for, otherwise fail now and let the caller fall back.
      const wait = Number(res.headers.get("Retry-After")) * 1000;
      if (wait > 0 && wait <= MAX_RETRY_WAIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }
    }
    if (!res.ok) throw new OpenF1Error(`GET ${path} -> ${res.status}`, res.status);
    return (await res.json()) as T[];
  }
}

/** Everything the snapshot needs for one season, read as of `now`. */
export async function fetchSeason(year: number, now: Date, opts: FetchOptions = {}): Promise<RawSeason> {
  const meetings = await getRows<Meeting>(`meetings?year=${year}`, opts);
  const sessions = await getRows<Session>(`sessions?year=${year}`, opts);

  // Standings come from the newest finished Grand Prix that already has championship rows.
  // `session_key=latest` is not used: during a practice session it points at a session with none.
  let championshipSessionKey: number | null = null;
  let championshipDrivers: ChampionshipDriver[] = [];
  for (const candidate of finishedRaceSessions(sessions, now).slice(0, 2)) {
    championshipDrivers = await getRows<ChampionshipDriver>(`championship_drivers?session_key=${candidate.session_key}`, opts);
    if (championshipDrivers.length) {
      championshipSessionKey = candidate.session_key;
      break;
    }
  }
  const finished = finishedRaceSessions(sessions, now);
  if (finished.length > 0 && championshipSessionKey === null) {
    // Races have been run but their standings are not readable: a zero-point table would be
    // wrong, so let the caller fall back instead.
    throw new OpenF1Error("no championship rows for the finished Grand Prix sessions");
  }
  const championshipTeams = championshipSessionKey
    ? await getRows<ChampionshipTeam>(`championship_teams?session_key=${championshipSessionKey}`, opts)
    : [];

  const gridSessionKey = championshipSessionKey ?? latestStartedSession(sessions, now)?.session_key;
  const drivers = gridSessionKey ? await getRows<DriverRow>(`drivers?session_key=${gridSessionKey}`, opts) : [];

  const firstRace = sessions
    .filter(isGrandPrix)
    .sort((a, b) => a.date_start.localeCompare(b.date_start))[0];

  const onGrid = new Set(drivers.map((d) => d.driver_number));
  const departedDrivers: DriverRow[] = [];
  for (const row of championshipDrivers) {
    if (onGrid.has(row.driver_number) || !firstRace) continue;
    const history = await getRows<DriverRow & { session_key: number }>(
      `drivers?driver_number=${row.driver_number}&session_key>=${firstRace.session_key}`,
      opts,
    );
    const last = history.sort((a, b) => a.session_key - b.session_key).at(-1);
    if (last) departedDrivers.push(last);
  }

  const raceWinners =
    championshipSessionKey && firstRace
      ? await getRows<RaceWinner>(
          `session_result?position=1&session_key>=${firstRace.session_key}`,
          opts,
        )
      : [];

  return {
    year,
    meetings,
    sessions,
    championshipSessionKey,
    championshipDrivers,
    championshipTeams,
    drivers,
    departedDrivers,
    raceWinners,
  };
}
