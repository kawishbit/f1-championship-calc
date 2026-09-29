# 03: Scenario playground

**What to build:** "What would it take" comes first with a visual answer (stat cards, points bar, per-round path with finish chips); the scenario builder sits below with bulk-fill (driver + finish applied to every remaining round, including sprints when inside the top 8) plus optional per-round fine-tune accordions. The projected standings update live via `projectStandings`.

**Blocked by:** 01 (Snapshot pipeline + static standings table), 02 (Points engine + remaining rounds).

**Status:** done

- [x] Solver-first layout with stat cards (needed / finishes-on / target), have-vs-needed bar, and per-round path steps with P-chips (holds and impossible states visualized too)
- [x] Bulk-fill sets one finish across all remaining rounds; running it per driver composes head-to-head answers (Russell P1 everywhere then Antonelli P2 everywhere); fine-tune accordions stay optional and editable afterwards
- [x] Works for both drivers and constructors views
