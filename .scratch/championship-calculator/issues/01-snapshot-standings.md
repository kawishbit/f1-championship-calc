# 01: Snapshot pipeline + static standings table

**What to build:** A visitor sees the real 2026 driver and constructor standings on the index page, with a toggle between the two, backed by data fetched from f1api.dev and OpenF1 at build time.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `pnpm run snapshot` fetches f1api.dev standings/schedule and OpenF1 headshots/team colours, joined on driver number
- [ ] Headshots vendored into `public/drivers/` with initials fallback (per ADR-0002); JSON snapshot checked in as offline fallback (per ADR-0001)
- [ ] Index page renders real 2026 driver standings and constructor standings with a drivers/constructors toggle
