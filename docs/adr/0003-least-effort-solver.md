# Least-effort path solver

`leastEffortPath` in `src/lib/championship.ts` answers the page's question
("what would it take"): fewest contender points securing a target final
position P1..Pn, assuming every rival scores the minimum possible (stays on
current points). Per-round finishes are prizes, never invented rival results.

## Considered Options

- **Manual per-driver pickers**: full control of every finisher, but asks the
  visitor to do the solver's job (the confusion that prompted this change).
- **Worst-case rivals**: mathematically safe clinch, but answers a harder
  question than asked and buries cheap paths.
- **Group knapsack over prize slots (chosen)**: each round offers one race
  prize (P1..P10) and at most one sprint prize (P1..P8); DP picks the cheapest
  prize set reaching each points bar, with exact ties winnable only on
  strictly more wins (FIA order). Impossible targets return `possible: false`
  with the best reachable position at full spend.
