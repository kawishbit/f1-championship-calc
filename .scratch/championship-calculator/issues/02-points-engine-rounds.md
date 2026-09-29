# 02: Points engine + remaining rounds

**What to build:** The page shows which rounds are still unplayed and the codebase knows the 2026 points tables, so later scenario math has a trusted foundation.

**Blocked by:** 01 (Snapshot pipeline + static standings table).

**Status:** ready-for-agent

- [ ] 2026 race points table (25-18-15-12-10-8-6-4-2-1) and sprint points table (8-7-6-5-4-3-2-1) hardcoded with unit tests; no fastest-lap point
- [ ] Remaining rounds derived from the schedule (race date in the future) with a manual played/unplayed override flag per round
- [ ] Remaining rounds section visible on the page
