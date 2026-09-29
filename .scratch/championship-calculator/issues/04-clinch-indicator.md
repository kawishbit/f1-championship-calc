# 04: Clinch indicator

**What to build:** No clinch-words UI: the contender row carries no "has clinched" / "eliminated" / "still alive" text. Outcomes stay visible directly — solver stats + bar for the best case, projected standings table for the scenario.

**Blocked by:** 03 (Scenario playground).

**Status:** done

- [x] Clinch-words readout removed from the scenario panel (no `clinchState` import or UI)
- [x] Title outcomes still answerable visually: holds state shows P-held + bar; impossible state shows best reachable + max pts
