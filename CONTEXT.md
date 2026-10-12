# Championship Calculator

An Astro app that answers what it would take for an F1 driver or team to win the current season's championship, given the current standings and the remaining rounds.

## Language

**Standings**:
The current championship points table for drivers or constructors.
_Avoid_: leaderboard, rankings

**Scenario**:
A user-assigned set of finishes for the remaining rounds, used to project final standings.
_Avoid_: prediction, forecast, simulation

**Clinch**:
Mathematical certainty of winning the championship regardless of all other remaining outcomes.
_Avoid_: lock, secure

**Round**:
One Grand Prix weekend, comprising the Grand Prix and an optional sprint race. Cancelled weekends and testing are not rounds, and cancelled weekends do not consume a round number.
_Avoid_: race weekend (ambiguous: a round contains races), GP

**Played round**:
A round whose Grand Prix result is already counted in the current standings. A race that has finished but whose points are not yet in the standings is still a remaining round.
_Avoid_: finished round, completed round
