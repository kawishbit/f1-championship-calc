# 03: Scenario playground

**What to build:** A visitor assigns per-round finishes (race + sprint) for the remaining rounds, and the page projects the final standings live via `projectStandings`. The panel also carries a labeled "What would it take" bound: the fewest contender points reaching a target P1..Pn if rivals scored nothing more (best case, not a projection).

**Blocked by:** 01 (Snapshot pipeline + static standings table), 02 (Points engine + remaining rounds).

**Status:** done

- [x] Per-round finish pickers (race + sprint where present) for every remaining round; projected standings update live
- [x] Head-to-head answers work (e.g. Russell P1 x3 with Antonelli scoreless puts Russell P1 311 vs 302; adding Antonelli P2 x3 keeps Antonelli ahead 356 vs 311)
- [x] Solver bound labeled as best-case for contender + target; works for both drivers and constructors views
