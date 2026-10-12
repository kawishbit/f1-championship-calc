# OpenF1 only, fetched at runtime behind a Vercel cache

Supersedes ADR-0001 (hybrid data source with build-time snapshot) and ADR-0002 (vendored headshots).

All data comes from OpenF1 (`api.openf1.org`): schedule from `meetings` and `sessions`, standings from `championship_drivers` and `championship_teams`, names, colours and headshots from `drivers`. f1api.dev (stopped updating after the Singapore GP) and Jolpica (sprint flags only) are removed. The GitHub Actions refresh job is removed. The page is rendered on demand with `@astrojs/vercel` ISR: Vercel caches the HTML, and the page picks its own `s-maxage` so the cache is valid until the next Grand Prix ends plus about 3 hours (OpenF1's championship rows exist for Race sessions only, so sprints don't trigger a refresh), capped at 3 days. Headshots are served by a same-origin route `/drivers/<F1 CDN path>` that fetches the photo from F1's CDN and caches it for about 30 days.

## Considered Options

- **Keep the cron + build-time snapshot, swap only the source**: kept visits free of API calls, but staleness equals the poll interval, the job needs upkeep (keepalive step, bot commits, redeploys) and the owner didn't want it.
- **Static shell + cached JSON endpoint** (client fetch): loading state and layout shift; the calculator can't start until data arrives.
- **Persisted store (Vercel Blob / Edge Config) with an explicit age check**: keeps the last good copy through failures, but adds a service, a token and a concurrent-refetch problem. Deferred until the failure behaviour below proves too weak.
- **Flat 3-day TTL**: the first suggestion. It recreates the original problem (standings stale for days after a race), so 3 days is only the ceiling.
- **Vercel Image Optimization for headshots**: no route code, but can't tell F1's placeholder silhouette from a real photo.

## Failure behaviour

OpenF1 returns 401 to unauthenticated callers during live sessions and may return 429. If a render can't fetch, the page serves the committed `snapshot.json` (refreshed by hand with `pnpm run snapshot`, so it can be old), with a short `s-maxage` of about 5 minutes and a notice that data may be out of date. The race-aware expiry means refreshes normally land after a session ends, when OpenF1 is open. How Vercel treats a failed regeneration and `stale-while-revalidate` is not documented, so the first implementation verifies it on a preview deployment.

Two cache rules besides the race-aware expiry: a race that has just finished but is missing from the standings is retried every 10 minutes for 24 hours, and while the page still shows last season's final table (new year, no new grid yet) it is cached for 1 hour so the new calendar is picked up promptly. A season where races have finished but no standings rows can be read is treated as a failure and falls back, never shown as a zero-point table.

## Data model notes

- Cancelled meetings (`is_cancelled`) and testing are not rounds; round numbers count only real Grand Prix weekends.
- A round is played when its Race session is at or before the latest session with championship rows, so a finished race whose points aren't published yet stays "remaining" and is never double-counted.
- OpenF1 has no slugs and driver numbers change between seasons, so ids derive from `name_acronym` (drivers), slugified `team_name` (teams) and `meeting_name` plus year (rounds).

## Rate limits

OpenF1 answers 429 with `Retry-After: 60` after a burst, so a render makes about eight sequential requests (plus one more per driver who has left the grid, normally one or two) and never one per photo. The first version of the photo route looked up each driver's `headshot_url` on OpenF1 and was rate-limited by its own 22 simultaneous photo requests. The snapshot now stores each photo as the variable part of F1's CDN path (`/drivers/M/MAXVER01_Max_Verstappen/maxver01.png`), so the route calls only the CDN and can only ever fetch from that one path. A 429 is retried only when `Retry-After` is 3 s or less; otherwise the render falls back at once.

## Photos

Hotlinking from F1's CDN is still avoided, and the legal caveat from ADR-0002 still applies: we redistribute F1-copyrighted photos through our own origin. The escape hatch is unchanged: initials plus team-colour discs.
