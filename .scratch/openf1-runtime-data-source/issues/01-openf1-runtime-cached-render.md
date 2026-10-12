# 01: OpenF1-only data, fetched at runtime behind a Vercel cache

**What to build:** The site gets all its data from OpenF1 and nothing else, fetched when a visitor's request misses Vercel's cache. f1api.dev and Jolpica are gone, and so is the GitHub Actions refresh job. The page stays fresh after every race instead of waiting for a poll. Decisions are recorded in ADR-0004 (supersedes ADR-0001 and ADR-0002).

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

**Type:** task

## Why

f1api.dev stopped updating: the Singapore GP finished on 11 Oct 2026 and the snapshot still held 16 of 23 rounds played. OpenF1 already has the race and, since its `championship_drivers` / `championship_teams` endpoints, the standings too (ADR-0001's "no standings endpoint" is out of date).

## Behaviour

**Data mapping (OpenF1 only)**
- Season = current UTC year; switch to a new season only once OpenF1 has that year's drivers, otherwise keep the previous season (preseason zero-point grid when drivers exist but no race has run).
- Rounds: GP meetings from `meetings?year=` minus testing and minus `is_cancelled` (cancelled rounds consume no round number). Round number = ordinal by `date_start`. Display name = `meeting_name`. `sprint` = the meeting has a `Sprint` session in `sessions`.
- Standings are read from the newest finished Grand Prix that has championship rows (the two newest are tried); finished races with no readable rows fall back instead of showing zeros.
- A round is **played** when its Race session is at or before the session of the latest `championship_drivers` rows, not when the clock says so.
- Standings from `championship_drivers` / `championship_teams` (latest session). Names, team, colour from `drivers` for the standings session, plus one lookup per driver who is in the championship but no longer on the grid (`drivers?driver_number=N&session_key>=<first race>`, last row), so departed drivers (e.g. #22, 1 point) still resolve. A full-season `drivers` query was tried first and is too heavy (1.1 MB, 8 s). Departed drivers stay in the standings but are excluded from the scenario/clinch driver pool.
- Ids: `driverId` = lowercased `name_acronym`; `teamId` = slugified `team_name`; `raceId` = slug of `meeting_name` plus year (e.g. `singapore-grand-prix-2026`). The points system stays hardcoded data.
- Requests to OpenF1 are sequential; a 429 is retried once only when `Retry-After` is 3 s or less. OpenF1 sends 60, so in practice a 429 falls back at once (ADR-0004, "Rate limits").

**Caching (Vercel)**
- `@astrojs/vercel` with `isr: { expiration: 3 days }`; `index.astro` renders on demand and the fetch lives in the page frontmatter (pure transform in `src/lib` or `scripts/lib`).
- The page sets `Cache-Control: s-maxage=N` per render: valid until the end of the next Grand Prix plus ~3 h, capped at 3 days (Race sessions only: OpenF1's championship rows exist for Race sessions only). A race that just ended and is missing from the standings is retried every 10 min for 24 h.
- OpenF1 failure at render (401 live-session lockout, 429, 5xx, timeout): render the committed `snapshot.json` with `s-maxage` of about 5 min and a visible "data may be out of date" notice.
- The "updated" label shows when the data was fetched, not `generatedAt` from a build.

**Headshots**
- A same-origin route, e.g. `/drivers/ver.png`, fetches `headshot_url` server-side and returns it with a long `s-maxage` (about 30 days). F1's placeholder (body under 2 KB; the fallback URL is the same URL, so size is the only signal) returns 404 with a short TTL, so the `<img>` falls back to initials plus the team-colour disc.
- `public/drivers/` and the build-time download code are deleted.

**Removals**
- Delete `.github/workflows/refresh.yml`; remove the workflow badge from the README.
- Keep `pnpm run snapshot` only as a manual generator of the offline fallback `snapshot.json`, rewritten against OpenF1.

## Acceptance criteria

- [x] f1api.dev and Jolpica appear nowhere in the code, docs or `snapshot.json` sources
- [x] Rendered standings match OpenF1 `championship_drivers` / `championship_teams` (checked against today's live data: Singapore included, 17 rounds played, 23 total; Bahrain and Saudi cancelled rounds excluded)
- [x] Pure OpenF1-to-snapshot transform has `node --test` tests using fixtures recorded from live responses, covering the cancelled-round case, driver #22 (in championship, not in the latest session), preseason, sprint detection, and played-round detection
- [x] Render failure path serves the committed fallback with a short TTL and an out-of-date notice
- [x] Headshot route serves cached photos and 404s on the placeholder; initials fallback verified in the UI
- [x] `refresh.yml` deleted, `public/drivers/` deleted, README "How it works" and badges updated
- [x] ADR-0001 and ADR-0002 marked superseded by ADR-0004; `CONTEXT.md` updated
- [ ] **Vercel preview deployment check**: (a) a second request inside the TTL does not hit OpenF1, (b) behaviour when a render fails after expiry (fallback poisons the cache for ~5 min only, not the full TTL), (c) whether `stale-while-revalidate` is honoured. (d) whether the photo route's 30-day `s-maxage` survives the adapter's 3-day ISR `expiration`. If a failed render can keep the last good cached page (e.g. by returning a 503), record that and decide whether to adopt it

## Out of scope

- A persisted last-good store (Vercel Blob / Edge Config); revisit only if the preview check shows the fallback is too weak
- Paid OpenF1 API key

## Comments

**Implemented, one item left for the owner.** Everything except the Vercel preview check is done and verified locally (`pnpm test` 48 passing, `pnpm build` succeeds, the app run against live OpenF1 showed Singapore included, 17 of 23 rounds played, 23 drivers, 22 in the pick pool).

Open: deploy a preview and check (a) a second request inside the TTL makes no OpenF1 calls, (b) what a failed render after expiry does to the cached page, (c) whether `stale-while-revalidate` is honoured. This could not be tested without a deployment.

Notes from the build:
- OpenF1 answers 429 with `Retry-After: 60` after a short burst. The first photo route looked up each driver on OpenF1 and rate-limited itself; photos are now `/drivers/<F1 CDN path>` and never touch OpenF1 (see ADR-0004, "Rate limits").
- Cache lifetime keys on Race sessions only, since OpenF1's championship rows exist for Race sessions only.
- The committed `src/data/snapshot.json` is regenerated against OpenF1; run `pnpm run snapshot` now and then so the fallback is not ancient.
