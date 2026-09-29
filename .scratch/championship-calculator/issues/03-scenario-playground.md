# 03: Scenario playground

**What to build:** A visitor picks a finishing position for every driver/team in each remaining round and watches the projected final standings recompute live.

**Blocked by:** 01 (Snapshot pipeline + static standings table), 02 (Points engine + remaining rounds).

**Status:** ready-for-agent

- [ ] Per-round finish pickers for every driver/team in each remaining round
- [ ] Projected final standings (current standings + scenario picks) recompute live on every change
- [ ] Works for both drivers and constructors views
