# 03: Scenario playground

**What to build:** "Points still available" (Grand Prix pts + Sprint pts boxes with the sprint venue note) sits above "What would it take" (needed / finishes-on / target stats + bar, no per-round path list); the scenario builder sits below with bulk-fill plus optional fine-tune. Picks project live into the standings list on the left, with moved rows outlined and a note pointing at them.

**Blocked by:** 01 (Snapshot pipeline + static standings table), 02 (Points engine + remaining rounds).

**Status:** done

- [x] Points-available section above solver (200 Grand Prix pts, 8 Sprint pts with Singapore sprint note); sprint flag fixed via override after API check
- [x] Solver shows needed / finishes-on / target + bar only; scenario bulk-fill + fine-tune project into the left standings with moved-row outlines and pointing notes
- [x] Works for both drivers and constructors views
