# Hybrid data source with build-time snapshot

Standings and schedule come from f1api.dev (single-call championship standings); driver headshots and team colours come from OpenF1 (f1api.dev serves no images), joined on driver number at build time by an `npm run snapshot` script whose JSON output is checked in as fallback. This way the page renders fast, survives either API being down, and each source covers the other's gap.

## Considered Options

- **OpenF1 only**: has headshots and per-session points but no standings endpoint; aggregating a season means ~20 requests joined on driver number.
- **f1api.dev only**: one-call standings, but no images at all.
- **Runtime fetch**: fresh data every visit, but every page load depends on two free single-maintainer APIs.
