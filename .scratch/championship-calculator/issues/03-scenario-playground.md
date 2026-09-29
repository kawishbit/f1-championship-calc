# 03: Scenario playground

**What to build:** A visitor picks a contender and a target final position, and the page shows the least-effort path: the fewest contender points that reach the target assuming every rival scores the minimum possible (stays on current points), plus the per-round finishes that produce it. Rivals are never assigned invented results.

**Blocked by:** 01 (Snapshot pipeline + static standings table), 02 (Points engine + remaining rounds).

**Status:** done

- [x] Contender + target-position (P1..Pn) question form; solver runs live on change
- [x] Answer shows points needed, final position, and per-round finishes; impossible targets show best reachable position
- [x] Works for both drivers and constructors views
