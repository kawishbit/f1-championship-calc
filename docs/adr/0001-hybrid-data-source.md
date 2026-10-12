# Hybrid data source with build-time snapshot

> **Superseded by [ADR-0004](0004-openf1-runtime-cached-render.md).** f1api.dev and Jolpica are removed and the cron job is gone. The text below is kept as history.

 Standings and schedule come from f1api.dev (single-call championship standings); driver headshots and team colours come from OpenF1 (f1api.dev serves no images), joined on driver number at build time by an `npm run snapshot` script whose JSON output is checked in as fallback. Sprint flags come from Jolpica (Ergast-compatible `api.jolpi.ca/ergast`, which marks future sprints via the `Sprint` object per race — f1api.dev leaves `sprintRace.date` null until the weekend happens), matched by round number with f1api as fallback. A GitHub Actions cron (`.github/workflows/refresh.yml`, every 6 hours, plus manual dispatch) re-runs the snapshot, commits only on real data change (`generatedAt` ignored), and Vercel redeploys from that push — so visits cost zero API calls and never touch a rate limit.

## Considered Options

- **OpenF1 only**: has headshots and per-session points but no standings endpoint; aggregating a season means ~20 requests joined on driver number.
- **f1api.dev only**: one-call standings, but no images at all.
 - **Runtime fetch**: fresh data every visit, but every page load depends on free single-maintainer APIs.

## Season rollover

The season comes from `f1api.dev/api/current`, so the snapshot follows the API into a new year with no code change. Before round 1 the standings endpoints may be empty or 404: the script then builds a zero-point grid from the drivers/teams lists, and if even those are missing it exits 0 leaving the previous snapshot in place for the next run to retry. The 6-hourly cadence (rather than race-day-only) is what makes this work, since nobody knows when the new grid is published. The workflow also re-enables itself each run, because GitHub disables schedules after 60 days of repo inactivity and the winter break outlasts that.

## OpenF1 is optional

OpenF1 returns 401 to unauthenticated callers whenever an F1 session is live, which covers most of every race weekend. It only supplies headshots and team colours, so the snapshot treats it as best-effort: on failure each driver and team keeps its colour and photo from the previous snapshot, and the refresh still succeeds with f1api.dev standings. Standings and schedule (f1api.dev) remain required.
