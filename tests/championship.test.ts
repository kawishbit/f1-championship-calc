import { describe, it } from "node:test";
import assert from "node:assert/strict";
 import {
   RACE_POINTS,
   SPRINT_POINTS,
   FASTEST_LAP_POINTS,
   DEFAULT_POINTS,
   availablePoints,
   insertPick,
   projectStandings,
   maxRemainingPoints,
   clinchState,
   type RoundPicks,
 } from "../src/lib/championship.ts";

 describe("2026 points tables", () => {
   it("race pays 25-18-15-12-10-8-6-4-2-1", () => {
     assert.deepEqual([...RACE_POINTS], [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]);
   });

   it("sprint pays 8-7-6-5-4-3-2-1", () => {
     assert.deepEqual([...SPRINT_POINTS], [8, 7, 6, 5, 4, 3, 2, 1]);
   });

   it("fastest lap pays 0 (kept explicit for a 2027-style return)", () => {
     assert.equal(FASTEST_LAP_POINTS, 0);
   });
 });

 describe("availablePoints", () => {
   const rounds = [
     { raceId: "r1", sprint: false },
     { raceId: "r2", sprint: true },
   ];
   it("drivers: 25/race + 8/sprint + fastest lap", () => {
     assert.deepEqual(availablePoints(rounds, DEFAULT_POINTS, 1), { gp: 50, sprint: 8, fastestLap: 0, total: 58 });
   });
   it("teams: P1+P2 per event (43 race, 15 sprint)", () => {
     assert.deepEqual(availablePoints(rounds, DEFAULT_POINTS, 2), { gp: 86, sprint: 15, fastestLap: 0, total: 101 });
   });
   it("fastest-lap return flows into every box automatically", () => {
     const fl = { ...DEFAULT_POINTS, fastestLap: 1 };
     assert.deepEqual(availablePoints(rounds, fl, 1), { gp: 50, sprint: 8, fastestLap: 2, total: 60 });
   });
 });

 describe("insertPick", () => {
   it("shifts occupants down when inserting at an occupied position", () => {
     assert.deepEqual(insertPick(["a", "b", "c"], "x", 2, 4), ["a", "x", "b", "c"]);
   });
   it("moves without duplicating when repositioning the same id", () => {
     assert.deepEqual(insertPick(["a", "x", "b"], "x", 1, 4), ["x", "a", null, "b"]);
   });
   it("drops the last occupant past max and removes on null pos", () => {
     assert.deepEqual(insertPick(["a", "b", "c", "d"], "x", 3, 4), ["a", "b", "x", "c"]);
     assert.deepEqual(insertPick(["a", "x"], "x", null, 4), ["a"]);
   });
   it("shifts down and drops the tail when the list is full", () => {
     assert.deepEqual(insertPick([null, null, null, null, "a"], "x", 2, 5), [null, "x"]);
   });
 });

 describe("projectStandings", () => {
   it("adds race + sprint points and re-sorts, counting race wins", () => {
     const out = projectStandings(
       [
         { id: "a", points: 100, wins: 2 },
         { id: "b", points: 90, wins: 1 },
       ],
       { r1: { race: ["b", "a"], sprint: ["a"], touched: true } satisfies RoundPicks },
     );
     assert.deepEqual(out, [
       { id: "a", points: 126, wins: 2 },
       { id: "b", points: 115, wins: 2 },
     ]);
   });

   it("ignores untouched rounds, unknown ids, and out-of-points slots", () => {
     const ids = Array.from({ length: 12 }, (_, i) => `d${i}`);
     const scored = projectStandings(
       [{ id: "d0", points: 0, wins: 0 }],
       { r1: { race: [...ids, "ghost"], sprint: [], touched: true } satisfies RoundPicks },
     );
     // d0 finishes P1 -> 25; ghost ignored; P11+ score 0
     assert.equal(scored[0].points, 25);
     assert.equal(scored[0].wins, 1);
     const untouched = projectStandings(
       [{ id: "d0", points: 0, wins: 0 }],
       { r1: { race: [...ids], sprint: [] } satisfies RoundPicks },
     );
     assert.equal(untouched[0].points, 0);
   });

   it("scores sparse position slots, skipping empty ones", () => {
     const out = projectStandings(
       [
         { id: "a", points: 100, wins: 2 },
         { id: "b", points: 90, wins: 1 },
       ],
       { r1: { race: ["b", null, null], sprint: [null, "a"], touched: true } satisfies RoundPicks },
     );
     // b wins the race (+25, +1 win); a takes sprint P2 (+7)
     assert.deepEqual(out, [
       { id: "b", points: 115, wins: 2 },
       { id: "a", points: 107, wins: 2 },
     ]);
   });
 });

 describe("maxRemainingPoints", () => {
   it("counts P1 per untouched round plus sprint P1, skipping touched rounds", () => {
     const rounds = [
       { raceId: "r1", sprint: false },
       { raceId: "r2", sprint: true },
       { raceId: "r3", sprint: true },
     ];
     assert.equal(
       maxRemainingPoints(rounds, { r1: { race: ["a"], sprint: [], touched: true } }),
       33 + 33,
     );
   });

   it("counts a set round as fully decided (touched guard)", () => {
     const rounds = [{ raceId: "r1", sprint: true }];
     assert.equal(maxRemainingPoints(rounds, { r1: { race: ["a"], sprint: [], touched: true } }), 0);
   });
 });

describe("clinchState", () => {
  it("clinched when nobody can catch up even with max remaining", () => {
    const table = [
      { id: "a", points: 300, wins: 8 },
      { id: "b", points: 200, wins: 2 },
    ];
    assert.equal(clinchState(table, "a", 50), "clinched");
    assert.equal(clinchState(table, "b", 50), "eliminated");
  });

  it("alive when the gap is still bridgeable", () => {
    const table = [
      { id: "a", points: 300, wins: 8 },
      { id: "b", points: 260, wins: 2 },
    ];
    assert.equal(clinchState(table, "a", 50), "alive");
    assert.equal(clinchState(table, "b", 50), "alive");
  });
});
