// Reads OpenF1 and builds the snapshot. No JSON imports, so scripts/snapshot.mjs can run it in plain Node.
import { fetchSeason, type FetchOptions } from "./openf1.ts";
import { buildSnapshot, type Snapshot } from "./snapshot.ts";

/**
 * The current season, or last season's final table until OpenF1 publishes the new calendar
 * and grid. Throws when OpenF1 cannot be read; null only if neither season has a grid.
 */
export async function loadLiveSnapshot(now: Date, opts: FetchOptions = {}): Promise<Snapshot | null> {
  const year = now.getUTCFullYear();
  for (const season of [year, year - 1]) {
    const snapshot = buildSnapshot(await fetchSeason(season, now, opts), now);
    if (snapshot) return snapshot;
  }
  return null;
}
