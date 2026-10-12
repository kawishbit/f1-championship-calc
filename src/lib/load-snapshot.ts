// Decides what the page renders and how long Vercel may cache it.
import committed from "../data/snapshot.json";
import { loadLiveSnapshot } from "./live-snapshot.ts";
import type { FetchOptions } from "./openf1.ts";
import { cacheSeconds, type Snapshot } from "./snapshot.ts";

const OVERALL_TIMEOUT_MS = 8000; // stay inside the serverless function's time limit
const FALLBACK_CACHE_SECONDS = 5 * 60;

export type Loaded = {
  snapshot: Snapshot;
  /** `s-maxage` for the rendered page. */
  cacheSeconds: number;
  /** True when OpenF1 could not be read and the committed fallback was used. */
  stale: boolean;
};

/**
 * Live OpenF1 data, cached by the caller for `cacheSeconds`. Any failure to read OpenF1, such
 * as the 401 it answers during live sessions, a 429 or a timeout, serves the committed
 * snapshot with a short cache so the next visit retries.
 */
export async function loadSnapshot(now = new Date(), opts: FetchOptions = {}): Promise<Loaded> {
  try {
    const signal = opts.signal ?? AbortSignal.timeout(OVERALL_TIMEOUT_MS);
    const snapshot = await loadLiveSnapshot(now, { ...opts, signal });
    if (snapshot) return { snapshot, cacheSeconds: cacheSeconds(snapshot, now), stale: false };
    console.error("OpenF1 has no season with a grid yet, serving committed snapshot");
  } catch (err) {
    console.error(`OpenF1 unavailable, serving committed snapshot: ${err instanceof Error ? err.message : err}`);
  }
  return { snapshot: committed as Snapshot, cacheSeconds: FALLBACK_CACHE_SECONDS, stale: true };
}
