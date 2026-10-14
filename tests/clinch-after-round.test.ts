import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clinchAfterRound } from "../src/lib/championship.ts";

// Snapshot of 12 Oct 2026: six rounds left, no sprints.
const drivers = [
  { id: "ant", points: 340, wins: 8 },
  { id: "rus", points: 238, wins: 3 },
  { id: "ham", points: 229, wins: 1 },
  { id: "ver", points: 221, wins: 2 },
  { id: "lec", points: 215, wins: 1 },
  { id: "nor", points: 201, wins: 2 },
  { id: "pia", points: 138, wins: 0 },
  { id: "had", points: 97, wins: 0 },
  { id: "law", points: 75, wins: 0 },
  { id: "gas", points: 41, wins: 0 },
];
const rounds = ["usa", "mex", "bra", "lv", "qat", "abu"].map((raceId) => ({ raceId, sprint: false }));

describe("clinchAfterRound", () => {
  it("Antonelli clinches P1 after Austin by winning with Russell P9 or lower and Hamilton P5 or lower", () => {
    const out = clinchAfterRound(drivers, "ant", 1, rounds, "usa");
    assert.equal(out.kind, "possible");
    if (out.kind !== "possible") return;
    assert.deepEqual(
      out.conditions.map((c) => [c.id, c.maxPoints, c.position]),
      [
        ["rus", 2, 9],
        ["ham", 11, 5],
      ],
    );
  });

  it("states the general rule as a margin to outscore each rival by, one less on countback", () => {
    const out = clinchAfterRound(drivers, "ant", 1, rounds, "usa");
    if (out.kind !== "possible") return assert.fail(out.kind);
    assert.deepEqual(
      out.conditions.map((c) => [c.id, c.margin, c.countbackMargin]),
      [
        ["rus", 24, 23],
        ["ham", 15, 14],
      ],
    );
  });

  it("Hamilton can't clinch P3 after Austin; the earliest is after São Paulo", () => {
    // Antonelli and Russell are let through; Verstappen is 8 behind with 150 to play.
    // Hamilton winning three in a row (304) against Verstappen on 221 + 75 = 296 is the first that holds.
    assert.deepEqual(clinchAfterRound(drivers, "ham", 3, rounds, "usa"), { kind: "impossible", earliest: "bra" });
  });

  it("reports no earliest round when the position can't be clinched at all", () => {
    assert.deepEqual(clinchAfterRound(drivers, "gas", 1, rounds, "abu"), { kind: "impossible", earliest: null });
  });

  it("says already clinched when no result can change it", () => {
    const out = clinchAfterRound(
      [
        { id: "a", points: 200, wins: 5 },
        { id: "b", points: 150, wins: 0 },
      ],
      "a",
      1,
      [{ raceId: "r1", sprint: false }, { raceId: "r2", sprint: false }],
      "r2",
    );
    // b tops out on a tie (150 + 50 = 200) with at most 2 wins to a's 5.
    assert.deepEqual(out, { kind: "clinched" });
  });

  it("names the earliest round when the clinch can come sooner than asked", () => {
    const out = clinchAfterRound(drivers, "ant", 1, rounds, "mex");
    if (out.kind !== "possible") return assert.fail(out.kind);
    assert.equal(out.earliest, "usa");
    const next = clinchAfterRound(drivers, "ant", 1, rounds, "usa");
    assert.equal(next.kind === "possible" && next.earliest, "usa");
  });

  it("caps rivals in points across several rounds, letting the leaders through for P3", () => {
    const out = clinchAfterRound(drivers, "ham", 3, rounds, "bra");
    if (out.kind !== "possible") return assert.fail(out.kind);
    assert.deepEqual(out.ahead, ["ant", "rus"]);
    // Hamilton wins three (304, 4 wins); 75 remain. Verstappen can reach 5 wins, so a tie isn't enough.
    assert.deepEqual(
      out.conditions.map((c) => [c.id, c.maxPoints, c.position]),
      [
        ["ver", 7, null],
        ["lec", 13, null],
        ["nor", 27, null],
      ],
    );
  });

  it("caps rivals in points on a sprint weekend", () => {
    const out = clinchAfterRound(
      [
        { id: "a", points: 100, wins: 1 },
        { id: "b", points: 90, wins: 0 },
      ],
      "a",
      1,
      [{ raceId: "r1", sprint: true }, { raceId: "r2", sprint: false }],
      "r1",
    );
    if (out.kind !== "possible") return assert.fail(out.kind);
    // a takes both wins (133); b may score 18 of its possible 18 + 7 and tie on 133 with fewer wins.
    assert.deepEqual(out.conditions.map((c) => [c.id, c.maxPoints, c.position]), [["b", 18, null]]);
  });

  it("caps rival teams in points while the contender scores a 1-2", () => {
    const out = clinchAfterRound(
      [
        { id: "a", points: 300, wins: 5 },
        { id: "b", points: 280, wins: 2 },
      ],
      "a",
      1,
      [{ raceId: "r1", sprint: false }, { raceId: "r2", sprint: false }],
      "r1",
      undefined,
      2,
    );
    if (out.kind !== "possible") return assert.fail(out.kind);
    assert.equal(out.scores, 43);
    // a: 300 + 43 = 343. b may score 20 of its possible 15 + 12, then ties at 343 with 43 to play.
    assert.deepEqual(
      out.conditions.map((c) => [c.id, c.maxPoints, c.position, c.margin, c.countbackMargin]),
      [["b", 20, null, 24, 23]],
    );
  });

  it("never puts a condition on a driver who has left the grid", () => {
    const out = clinchAfterRound(
      [
        { id: "a", points: 30, wins: 0 },
        { id: "gone", points: 20, wins: 0, departed: true },
      ],
      "a",
      1,
      [{ raceId: "r1", sprint: false }, { raceId: "r2", sprint: false }],
      "r1",
    );
    // gone can't score again, so a is already clear of them.
    assert.deepEqual(out, { kind: "clinched" });
  });

  it("drops the countback margin when the contender can't out-win the rival", () => {
    const out = clinchAfterRound(
      [
        { id: "a", points: 100, wins: 1 },
        { id: "b", points: 90, wins: 4 },
      ],
      "a",
      1,
      [{ raceId: "r1", sprint: false }, { raceId: "r2", sprint: false }],
      "r1",
    );
    if (out.kind !== "possible") return assert.fail(out.kind);
    // After r1, 25 remain and b can reach 5 wins to a's 2, so a tie is not enough:
    // a wins (125) and b may score 9 at most (99 + 25 = 124), so P6 or lower.
    assert.deepEqual(
      out.conditions.map((c) => [c.id, c.margin, c.countbackMargin, c.maxPoints, c.position]),
      [["b", 16, null, 9, 6]],
    );
  });
});
