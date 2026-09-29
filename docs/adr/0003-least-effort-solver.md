 # Least-effort bound (not the projection)

 `leastEffortPath` in `src/lib/championship.ts` is a labeled best-case bound
 shown under the scenario builder ("What would it take"): fewest contender
 points reaching a target final position P1..Pn, assuming every rival scores
 the minimum possible (stays on current points). The projection itself is
 `projectStandings`, driven by the visitor's per-round picks; the bound never
 overrides it and must be labeled as best-case.

 ## Notes

 - Group knapsack over prize slots: each round offers one race prize
 (P1..P10) and at most one sprint prize (P1..P8); DP picks the cheapest
 prize set reaching each points bar, with exact ties winnable only on
 strictly more wins (FIA order). Impossible targets return `possible: false`
 with the best reachable position at full spend.
 - Teams view (`cars = 2`): each event pays both cars combined, so every
 prize is a single finish plus every distinct pair (P1+P2 = 43 race,
 8+7 = 15 sprint). Wins count when either car wins. Points and solver read
 the system from `snapshot.json` (`scripts/snapshot.mjs` hardcodes it — no
 API publishes it); fastest lap is a free best-case bonus, 0 today.
