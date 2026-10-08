 // Build-time data snapshot: f1api.dev (standings + schedule) + OpenF1 (headshots + team colours) + Jolpica (sprint flags) + hardcoded points system (no API publishes it).
 // Output: src/data/snapshot.json (checked in, offline fallback) + public/drivers/*.png.
 // Usage: pnpm run snapshot
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const UA = { "User-Agent": "f1-championship-calc snapshot script" };

class HttpError extends Error {
  constructor(url, status) {
    super(`GET ${url} -> ${status}`);
    this.status = status;
  }
}

// The upstream APIs are free and occasionally flaky: retry transient failures, but
// never a 404 (that is an answer, e.g. a season that has no data yet).
async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new HttpError(url, res.status);
      return await res.json();
    } catch (err) {
      if (err.status === 404 || attempt === 3) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}

const getOptionalJson = (url) =>
  getJson(url).catch((err) => {
    if (err.status === 404) return null;
    throw err;
  });

async function getBytes(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// (name mapping table removed: the join key is the three-letter driver code.)
// Team colours come from OpenF1 per driver and are attributed to the f1api.dev teamId
// of that driver's row; the two APIs disagree on car numbers, so the join key is the
// three-letter driver code (f1api `shortName` == OpenF1 `name_acronym`).

const current = await getJson("https://f1api.dev/api/current");
const season = current.season;
console.log(`season: ${season}`);

// A new season is published before any race has run, so its standings endpoints may
// 404 or be empty while the drivers/teams lists already exist. Never fetch these as
// required: preseason falls back to zero-point rows below.
const [driversChamp, teamsChamp, teams, drivers, openf1, jolpica] = await Promise.all([
  getOptionalJson(`https://f1api.dev/api/${season}/drivers-championship`),
  getOptionalJson(`https://f1api.dev/api/${season}/constructors-championship`),
  getOptionalJson(`https://f1api.dev/api/${season}/teams`),
  getOptionalJson(`https://f1api.dev/api/${season}/drivers`),
  getJson("https://api.openf1.org/v1/drivers?session_key=latest"),
  getJson(`https://api.jolpi.ca/ergast/f1/${season}.json?limit=100`).catch((err) => {
    console.log(`jolpica failed, falling back to f1api sprint flags: ${err.message}`);
    return null;
  }),
]);

if (!teams || !drivers) {
  // The season has rolled over but the grid is not published yet. Keep the committed
  // snapshot (last season's final standings) and let the next scheduled run retry.
  console.log(`season ${season}: f1api.dev has no drivers/teams yet; keeping existing snapshot`);
  process.exit(0);
}

const existing = await readFile(path.join(root, "src/data/snapshot.json"), "utf8")
  .then(JSON.parse)
  .catch(() => null);
if (existing && existing.season > season) {
  throw new Error(`upstream season ${season} is older than snapshot season ${existing.season}; refusing to downgrade`);
}

// Preseason (or a not-yet-published standings table): everyone on zero, in grid order.
const driverRows =
  driversChamp?.drivers_championship?.length
    ? driversChamp.drivers_championship
    : drivers.drivers.map((d, i) => ({ driverId: d.driverId, teamId: d.teamId, points: 0, wins: 0, position: i + 1 }));
const teamRows =
  teamsChamp?.constructors_championship?.length
    ? teamsChamp.constructors_championship
    : teams.teams.map((t, i) => ({ teamId: t.teamId, points: 0, wins: 0, position: i + 1 }));
if (!driversChamp?.drivers_championship?.length) console.log("standings: none published yet, using zero-point grid");

const byCode = new Map();
for (const d of openf1) byCode.set(d.name_acronym, d);

const teamNames = new Map(teams.teams.map((t) => [t.teamId, t.teamName]));
const teamColour = new Map(); // teamId -> hex from OpenF1
const f1Drivers = new Map(drivers.drivers.map((d) => [d.driverId, d]));

const outDrivers = [];
for (const row of driverRows) {
  const info = f1Drivers.get(row.driverId) ?? {};
  const code = info.shortName ?? row.driverId.slice(0, 3).toUpperCase();
  const o1 = byCode.get(code);
  const colour = o1?.team_colour ? `#${o1.team_colour}` : null;
  if (colour && !teamColour.has(row.teamId)) teamColour.set(row.teamId, colour);
  outDrivers.push({
    driverId: row.driverId,
    code,
    number: info.number ?? o1?.driver_number ?? null,
    name: `${info.name ?? ""} ${info.surname ?? ""}`.trim() || row.driverId,
    teamId: row.teamId,
    teamName: teamNames.get(row.teamId) ?? row.teamId,
    colour,
    photo: null, // filled below after download
    points: row.points,
    wins: row.wins,
    position: row.position,
  });
}

await mkdir(path.join(root, "public/drivers"), { recursive: true });
for (const d of outDrivers) {
  const o1 = byCode.get(d.code);
  if (!o1?.headshot_url) continue;
  try {
    const bytes = await getBytes(o1.headshot_url);
    if (bytes.length < 2048) {
      console.log(`skip photo ${d.driverId}: ${bytes.length}b (likely fallback placeholder)`);
      continue;
    }
    await writeFile(path.join(root, "public/drivers", `${d.driverId}.png`), bytes);
    d.photo = `/drivers/${d.driverId}.png`;
    console.log(`photo ${d.driverId}: ${bytes.length}b`);
  } catch (err) {
    console.log(`photo ${d.driverId} failed: ${err.message}`);
  }
}

const outTeams = teamRows.map((row) => ({
  teamId: row.teamId,
  name: teamNames.get(row.teamId) ?? row.teamId,
  colour: teamColour.get(row.teamId) ?? null,
  points: row.points,
  wins: row.wins,
  position: row.position,
}));

 // Sprint flags: Jolpica (Ergast-compatible) marks future sprints via the `Sprint`
 // object per race, while f1api.dev leaves sprintRace.date null until the weekend
 // happens. Jolpica wins when present; f1api is the fallback. Matched by round
 // number, since both follow official calendar order.
 const jolpicaSprintRounds = new Set(
   (jolpica?.MRData?.RaceTable?.Races ?? [])
     .filter((r) => r.Sprint != null)
     .map((r) => Number(r.round)),
 );
 if (jolpica) console.log(`sprint source: jolpica (${jolpicaSprintRounds.size} sprints)`);
 else console.log("sprint source: f1api.dev fallback");

 const rounds = current.races.map((r) => ({
   raceId: r.raceId,
   name: (r.raceName ?? r.raceId).replace(/^Formula 1\s+/, ""),
   round: r.round,
   date: r.schedule?.race?.date ?? null,
   sprint: jolpica ? jolpicaSprintRounds.has(Number(r.round)) : Boolean(r.schedule?.sprintRace?.date),
   played: Boolean(r.winner),
 }));

 // No API publishes the points system (checked f1api.dev, Jolpica, OpenF1):
 // it lives here as data so a 2027-style change (e.g. fastest-lap point back)
 // flows to avail boxes + solver without touching UI or engine code.
 const points = {
   race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
   sprint: [8, 7, 6, 5, 4, 3, 2, 1],
   fastestLap: 0, // per Grand Prix, sprints excluded; 1 extra pt/round if reintroduced
 };

 const snapshot = {
   season,
   generatedAt: new Date().toISOString(),
   sources: ["https://f1api.dev", "https://api.openf1.org", "https://api.jolpi.ca/ergast"],
   points,
   drivers: outDrivers,
   teams: outTeams,
   rounds,
 };

await mkdir(path.join(root, "src/data"), { recursive: true });
await writeFile(
  path.join(root, "src/data/snapshot.json"),
  JSON.stringify(snapshot, null, 2) + "\n",
);
const remaining = rounds.filter((r) => !r.played);
console.log(
  `drivers=${outDrivers.length} teams=${outTeams.length} ` +
    `rounds=${rounds.length} remaining=${remaining.length} ` +
    `sprintsRemaining=${remaining.filter((r) => r.sprint).length}`,
);
