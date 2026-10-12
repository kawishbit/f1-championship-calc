// Manual generator for the committed fallback snapshot (src/data/snapshot.json).
// The site itself reads OpenF1 at request time (src/lib/load-snapshot.ts, ADR-0004); this file
// is only served when OpenF1 cannot be read, so refresh it now and then.
// Usage: pnpm run snapshot   (Node 22.18+ runs the TypeScript imports directly)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLiveSnapshot } from "../src/lib/live-snapshot.ts";

const file = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "src/data/snapshot.json");

const snapshot = await loadLiveSnapshot(new Date());
if (!snapshot) throw new Error("OpenF1 has no season with a grid yet");

const existing = await readFile(file, "utf8").then(JSON.parse).catch(() => null);
if (existing && existing.season > snapshot.season) {
  throw new Error(`OpenF1 season ${snapshot.season} is older than snapshot season ${existing.season}; refusing to downgrade`);
}

await mkdir(path.dirname(file), { recursive: true });
await writeFile(file, JSON.stringify(snapshot, null, 2) + "\n");

const remaining = snapshot.rounds.filter((r) => !r.played);
console.log(
  `season=${snapshot.season} drivers=${snapshot.drivers.length} teams=${snapshot.teams.length} ` +
    `rounds=${snapshot.rounds.length} remaining=${remaining.length} sprintsRemaining=${remaining.filter((r) => r.sprint).length}`,
);
