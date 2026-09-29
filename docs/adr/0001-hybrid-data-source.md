# Hybrid data source with build-time snapshot

 Standings and schedule come from f1api.dev (single-call championship standings); driver headshots and team colours come from OpenF1 (f1api.dev serves no images), joined on driver number at build time by an `npm run snapshot` script whose JSON output is checked in as fallback. Sprint flags come from Jolpica (Ergast-compatible `api.jolpi.ca/ergast`, which marks future sprints via the `Sprint` object per race — f1api.dev leaves `sprintRace.date` null until the weekend happens), matched by round number with f1api as fallback. A weekly GitHub Actions cron (`.github/workflows/refresh.yml`, Mondays 06:00 UTC, plus manual dispatch) re-runs the snapshot, commits only on real data change (`generatedAt` ignored), and Vercel redeploys from that push — so visits cost zero API calls and never touch a rate limit.

## Considered Options

- **OpenF1 only**: has headshots and per-session points but no standings endpoint; aggregating a season means ~20 requests joined on driver number.
- **f1api.dev only**: one-call standings, but no images at all.
 - **Runtime fetch**: fresh data every visit, but every page load depends on free single-maintainer APIs.
