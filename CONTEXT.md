# Championship Calculator

An Astro app that answers what it would take for an F1 driver or team to win the current season's championship or clinch a position in it, given the current standings and the remaining rounds.

## Language

**Standings**:
The current championship points table for drivers or constructors.
_Avoid_: leaderboard, rankings

**Scenario**:
A user-assigned set of finishes for the remaining rounds, used to project final standings.
_Avoid_: prediction, forecast, simulation

**Clinch**:
Mathematical certainty of finishing at a given position or better in the final standings, regardless of all other remaining outcomes. "Clinch Pn" means no more than n−1 rivals can still finish ahead; plain "clinch" means clinch P1 (winning the championship). An exact points tie still counts when the rival cannot match the contender's wins even by winning every remaining Grand Prix.
_Avoid_: lock, secure, establish

**Clinch after a round**:
Clinching once that round's results are counted, along with every round before it. Rounds that come after it are still treated as open.
_Avoid_: clinch at, clinch in

**Round**:
One Grand Prix weekend, comprising the Grand Prix and an optional sprint race. Cancelled weekends and testing are not rounds, and cancelled weekends do not consume a round number.
_Avoid_: race weekend (ambiguous: a round contains races), GP

**Played round**:
A round whose Grand Prix result is already counted in the current standings. A race that has finished but whose points are not yet in the standings is still a remaining round.
_Avoid_: finished round, completed round
