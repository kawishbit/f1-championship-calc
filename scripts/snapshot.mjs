// Build-time data snapshot: f1api.dev (standings + schedule) + OpenF1 (headshots + team colours).
// Output: src/data/snapshot.json (checked in, offline fallback) + public/drivers/*.png.
// Usage: pnpm run snapshot
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const UA = { "User-Agent": "f1-championship-calc snapshot script" };

async function getJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function getBytes(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// (name mapping table removed: the join key is the three-letter driver code.)
// Team colours come from OpenF1 per driver and are attributed to the f1api.dev teamId
// of that driver's row; the two APIs disagree on car numbers, so the join key is the
// three-letter driver code (f1api `shortName` == OpenF1 `name_acronym`).

const season = (await getJson("https://f1api.dev/api/current")).season;
console.log(`season: ${season}`);

const [driversChamp, teamsChamp, teams, drivers, current, openf1] = await Promise.all([
  getJson(`https://f1api.dev/api/${season}/drivers-championship`),
  getJson(`https://f1api.dev/api/${season}/constructors-championship`),
  getJson(`https://f1api.dev/api/${season}/teams`),
  getJson(`https://f1api.dev/api/${season}/drivers`),
  getJson("https://f1api.dev/api/current"),
  getJson("https://api.openf1.org/v1/drivers?session_key=latest"),
]);

const byCode = new Map();
for (const d of openf1) byCode.set(d.name_acronym, d);

const teamNames = new Map(teams.teams.map((t) => [t.teamId, t.teamName]));
const teamColour = new Map(); // teamId -> hex from OpenF1
const f1Drivers = new Map(drivers.drivers.map((d) => [d.driverId, d]));

const outDrivers = [];
for (const row of driversChamp.drivers_championship) {
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

const outTeams = teamsChamp.constructors_championship.map((row) => ({
  teamId: row.teamId,
  name: teamNames.get(row.teamId) ?? row.teamId,
  colour: teamColour.get(row.teamId) ?? null,
  points: row.points,
  wins: row.wins,
  position: row.position,
}));

const rounds = current.races.map((r) => ({
  raceId: r.raceId,
  name: (r.raceName ?? r.raceId).replace(/^Formula 1\s+/, ""),
  round: r.round,
  date: r.schedule?.race?.date ?? null,
  sprint: Boolean(r.schedule?.sprintRace?.date),
  played: Boolean(r.winner),
}));

const snapshot = {
  season,
  generatedAt: new Date().toISOString(),
  sources: ["https://f1api.dev", "https://api.openf1.org"],
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
