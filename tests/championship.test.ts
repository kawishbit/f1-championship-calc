import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RACE_POINTS,
  SPRINT_POINTS,
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
});

describe("projectStandings", () => {
  it("adds race + sprint points and re-sorts, counting race wins", () => {
    const out = projectStandings(
      [
        { id: "a", points: 100, wins: 2 },
        { id: "b", points: 90, wins: 1 },
      ],
      { r1: { race: ["b", "a"], sprint: ["a"] } satisfies RoundPicks },
    );
    assert.deepEqual(out, [
      { id: "a", points: 126, wins: 2 },
      { id: "b", points: 115, wins: 2 },
    ]);
  });

  it("ignores picks for unknown ids and positions outside the points", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `d${i}`);
    const out = projectStandings(
      [{ id: "d0", points: 0, wins: 0 }],
      { r1: { race: [...ids, "ghost"], sprint: [] } satisfies RoundPicks },
    );
    // d0 finishes P1 -> 25; ghost ignored; P11+ score 0
    assert.equal(out[0].points, 25);
    assert.equal(out[0].wins, 1);
  });

  it("scores sparse position slots, skipping empty ones", () => {
    const out = projectStandings(
      [
        { id: "a", points: 100, wins: 2 },
        { id: "b", points: 90, wins: 1 },
      ],
      { r1: { race: ["b", null, null], sprint: [null, "a"] } satisfies RoundPicks },
    );
    // b wins the race (+25, +1 win); a takes sprint P2 (+7)
    assert.deepEqual(out, [
      { id: "b", points: 115, wins: 2 },
      { id: "a", points: 107, wins: 2 },
    ]);
  });
});

describe("maxRemainingPoints", () => {
  it("counts 25 per untouched round plus 8 for sprints, skipping picked rounds", () => {
    const rounds = [
      { raceId: "r1", sprint: false },
      { raceId: "r2", sprint: true },
      { raceId: "r3", sprint: true },
    ];
    assert.equal(
      maxRemainingPoints(rounds, { r1: { race: ["a"], sprint: [] } }),
      33 + 33,
    );
  });

  it("keeps the sprint alive when only the race has picks", () => {
    const rounds = [{ raceId: "r1", sprint: true }];
    assert.equal(maxRemainingPoints(rounds, { r1: { race: ["a"], sprint: [] } }), 8);
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
