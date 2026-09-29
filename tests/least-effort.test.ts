import { describe, it } from "node:test";
import assert from "node:assert/strict";
 import { leastEffortPath, DEFAULT_POINTS } from "../src/lib/championship.ts";

describe("leastEffortPath", () => {
  it("finds cheapest single-race result to take P1", () => {
    const out = leastEffortPath(
      [
        { id: "a", points: 100, wins: 2 },
        { id: "b", points: 80, wins: 1 },
      ],
      "b",
      1,
      [{ raceId: "r1", sprint: false }],
    );
    assert.equal(out.possible, true);
    // Gap is 21 (100 - 80 + 1); P2 pays only 18, so P1 = 25 is the answer.
    assert.equal(out.pointsNeeded, 25);
    assert.equal(out.winsAdded, 1);
    assert.deepEqual(
      out.assignments.map((a) => a.racePosition),
      [1],
    );
    assert.equal(out.position, 1);
  });

  it("targets any position, not just the title", () => {
    const out = leastEffortPath(
      [
        { id: "a", points: 100, wins: 5 },
        { id: "b", points: 90, wins: 3 },
        { id: "c", points: 80, wins: 1 },
      ],
      "c",
      2,
      [{ raceId: "r1", sprint: false }],
    );
    assert.equal(out.possible, true);
    // Needs 90 - 80 + 1 = 11; cheapest prize covering it is P4 = 12.
    assert.equal(out.pointsNeeded, 12);
    assert.deepEqual(
      out.assignments.map((a) => a.racePosition),
      [4],
    );
    assert.equal(out.position, 2);
  });

  it("reports best reachable position when the target is impossible", () => {
    const out = leastEffortPath(
      [
        { id: "a", points: 100, wins: 5 },
        { id: "b", points: 90, wins: 3 },
        { id: "c", points: 0, wins: 0 },
      ],
      "c",
      1,
      [{ raceId: "r1", sprint: false }],
    );
    assert.equal(out.possible, false);
    // One P1 = 25 points: lands P3, still short of the 100-point bar.
    assert.equal(out.pointsNeeded, 25);
    assert.equal(out.position, 3);
  });

  it("combines race and sprint rounds, spending on cheapest slots", () => {
    const out = leastEffortPath(
      [
        { id: "a", points: 100, wins: 5 },
        { id: "b", points: 80, wins: 1 },
      ],
      "b",
      1,
      [
        { raceId: "r1", sprint: true },
        { raceId: "r2", sprint: false },
      ],
    );
    assert.equal(out.possible, true);
    // Gap 21: cheapest cover is P2 race (18) + P6 sprint (3) = 21 exactly.
    assert.equal(out.pointsNeeded, 21);
    assert.equal(out.position, 1);
  });
   it("teams view banks both cars: P1+P2 pair covers a 43-point gap in one round", () => {
     const out = leastEffortPath(
       [
         { id: "a", points: 100, wins: 5 },
         { id: "b", points: 58, wins: 0 },
       ],
       "b",
       1,
       [{ raceId: "r1", sprint: false }],
       DEFAULT_POINTS,
       2,
     );
     assert.equal(out.possible, true);
     // Gap 43 (100 - 58 + 1): one car maxes at 25, the pair banks 25+18 = 43.
     assert.equal(out.pointsNeeded, 43);
     assert.equal(out.position, 1);
   });

  it("wins on victories on an exact tie, without inventing rival results", () => {
    const out = leastEffortPath(
      [
        { id: "a", points: 100, wins: 5 },
        { id: "b", points: 88, wins: 6 },
      ],
      "b",
      1,
      [{ raceId: "r1", sprint: false }],
    );
    assert.equal(out.possible, true);
    // Tie needs 12 (P4); outright needs 13 (P3 = 15). b already leads on
    // wins, so the exact tie wins it cheaper: 12 < 15.
    assert.equal(out.pointsNeeded, 12);
    assert.equal(out.winsAdded, 0);
    assert.deepEqual(
      out.assignments.map((a) => a.racePosition),
      [4],
    );
    assert.equal(out.position, 1);
  });

  it("answers nothing-to-do when the contender already holds the target", () => {
    const out = leastEffortPath(
      [
        { id: "a", points: 100, wins: 5 },
        { id: "b", points: 90, wins: 3 },
      ],
      "a",
      1,
      [{ raceId: "r1", sprint: false }],
    );
    assert.equal(out.possible, true);
    assert.equal(out.pointsNeeded, 0);
    assert.equal(out.position, 1);
    assert.deepEqual(
      out.assignments.map((a) => a.racePosition),
      [null],
    );
  });
});
