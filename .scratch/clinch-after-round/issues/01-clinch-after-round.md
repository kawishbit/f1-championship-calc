# 01: "What would it take" answers clinch after a round

**What to build:** Replace the least-effort solver in the "What would it take" section with a clinch answer. The visitor picks a driver (or team), a position and a remaining round. The page says what has to happen for them to **clinch** that position **after that round**, meaning no rival can catch them in the rounds that follow. The decisions are recorded in ADR-0005 (supersedes ADR-0003). The terms are in `CONTEXT.md` (Clinch, Clinch after a round).

**Blocked by:** None (can start immediately).

**Status:** done

**Type:** task

## Why

The least-effort bound assumes every rival stops scoring, so in practice it tells visitors nothing. What fans ask is "can Antonelli wrap up the title at Austin, and what has to happen?"

## Behaviour

**Inputs**
- **Driver** (or **Team** in the constructors view), **Position** (P1…Pn), **After** (remaining rounds only).
- Defaults: the driver's current position, and the next round.
- A driver can ask about a position above their current one. A driver at P5 asking about P3 has to move up and also clinch.
- The heading stays "What would it take". The hint changes to something like "When can a driver clinch a position, and what has to happen?"

**Clinch test** (ADR-0005)
- Results up to and including the chosen round are hypothetical. Every round after it is open. "Available after" means the most points one car (or one team in the constructors view) can still score after the chosen round.
- A rival is a threat when they alone could finish ahead of the contender by scoring everything available after the chosen round.
- A points tie counts for the contender only when the rival can't match the contender's wins even by winning every remaining Grand Prix.
- For Clinch Pn, the n−1 rivals with the most points are let through. Conditions apply only to the rest.
- Uses the real standings only. Scenario picks are never read.

**Answer**
- **Headline, best case:** the contender wins every Grand Prix and sprint up to and including the chosen round. Each rival who still has a condition is shown as follows:
  - **Finishing positions**, when the chosen round is the next round and it has no sprint (drivers view only). Example: "Russell P9 or lower".
  - Otherwise, **a points cap** across those rounds. Example: "Russell scores ≤ 7 across Austin and Mexico".
  - The constructors view always uses points caps. Example: "Mercedes scores 43 (a 1-2)".
- Rivals whose condition is met automatically in the best case are summed up together. The same goes for rivals who can't catch the contender whatever happens ("everyone else is already out of reach").
- **The general rule** sits under the headline, one line per rival: "outscore Russell by 24+ across these rounds". Add "or by 23 if Antonelli ends up with more wins than Russell can reach" only when that case can happen.
- **Already clinched** (before the chosen round): "Already clinched Pn", with no conditions.
- **Possible earlier than the chosen round:** answer the question asked and add "earliest possible: after <round>".
- **Not possible by the chosen round:** say so, and name the earliest round where it becomes possible, if there is one. Use the same best case: the contender wins everything and rivals score nothing.

**Removal**
- Remove `leastEffortPath` and its tests (`tests/least-effort.test.ts`), plus the stats and bar UI that showed the least-effort result.
- Ticket championship-calculator/04 decided "no clinch words in the UI". That decision applied to the clinch indicator on the contender's row. This section deliberately uses clinch wording, and that row stays without it.

## Acceptance (snapshot of 12 Oct 2026: six rounds left, no sprints, 125 points available after Austin)

- [x] Antonelli, P1, after the United States Grand Prix: he wins. Russell P9 or lower, which holds on countback: a 125-point tie with 9 wins against Russell's maximum of 8. Hamilton P5 or lower. Nobody else has a condition.
- [x] The general rule for that case: outscore Russell by 24+ (or 23 with more wins than he can reach), and Hamilton by 15+ (or 14).
- [x] Hamilton, P3, after the United States Grand Prix: not possible. Earliest possible: after the São Paulo Grand Prix.
- [x] Already clinched, earliest-possible and constructors (points caps) cases are covered by unit tests with fixtures.
- [x] The answer never changes when Scenario picks change.

## Comments

- Follow-up (14 Oct 2026): the "best case" headline read as a requirement. Verstappen, P8, after the United States Grand Prix said "Verstappen wins" when P7 or higher clinches on its own, and anything lower only needs Lawson not to win. The answer is now one row per range of the contender's result, in finishes for one Grand Prix with no sprint and in points otherwise (ADR-0005). The note and general-rule text are larger.

- Implemented in `clinchAfterRound` (`src/lib/championship.ts`, tests in `tests/clinch-after-round.test.ts`) and `renderSolver` in `Calculator.astro`. Hamilton may score 11 at Austin, not 10: an 11-point tie still goes to Antonelli on wins, and either way the condition is P5 or lower. Drivers who have left the grid are never given a condition, because they can't score again. The Scenario rule is not unit-tested: the answer reads only the real standings (`entries()`), and this was checked by hand in the browser.
