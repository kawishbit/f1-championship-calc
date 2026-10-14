# "What would it take" answers clinch after a round, testing each rival on its own

Supersedes ADR-0003 (least-effort bound).

The section now answers "what has to happen for this driver (or team) to clinch Pn after this round?" instead of "what is the fewest points to reach Pn if rivals score nothing?". Visitors found the least-effort bound useless. It assumes that every rival stops scoring, which never happens. What people ask about is when a position becomes safe. The answer uses the real standings only. The visitor's Scenario picks are never read, so "already clinched" always means clinched in reality.

Clinch Pn is tested **one rival at a time**. A rival is a threat if they alone could finish ahead of the contender by scoring every remaining point after the chosen round. The contender has clinched Pn when fewer than n rivals are threats. When this test says "clinched", that is always true: if fewer than n rivals can each pass on their own, they can't do it together either. It can report a clinch later than the truth for P2 and below, because two rivals can't both win the same race. For P1 it is exact. This is how the media usually calculate clinches.

A points tie counts in the contender's favour only when the rival can't match the contender's wins even by winning every remaining Grand Prix. Countback beyond wins (second places and so on) is ignored, so a tie that only those would decide is not counted as clinched.

The answer is laid out **by the contender's own result**, not as a single best case. For one Grand Prix with no sprint (drivers view), each range of finishes says exactly what has to happen: "P7 or higher: clinched, whatever anyone else does; P8 or lower: only if Lawson finishes P2 or lower". Otherwise (several rounds, a sprint weekend, or the constructors view) the ranges are in points, with a points margin for each rival. The first version led with "if the contender wins everything". That was correct, but it read as a requirement: it said Verstappen needed a win to clinch P8 when he needed nothing at all as long as Lawson didn't win. Whenever the contender doesn't win everything, rivals are assumed able to win those races, so the countback test then allows for their extra wins. This keeps each statement true, but it can ask for one point more than strictly needed.

## Considered Options

- **Exact joint search** (rivals sharing the same finishes): this would catch every clinch for P2 and below at the earliest possible round. But it's a search over how the remaining points could be split among rivals, it's hard to explain in a single sentence, and it changes nothing for P1, which is the question asked most.
- **Keep the least-effort bound next to the new answer**: rejected. Two "best case" answers that use different assumptions would conflict.
- **Strict "more than" only, with no countback**: simpler, but it misses real clinches. Antonelli winning Austin while Russell finishes P9 leaves the gap at exactly 125, and Antonelli wins on countback.
