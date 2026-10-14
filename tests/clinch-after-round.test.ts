import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clinchAfterRound, type ClinchAnswer } from "../src/lib/championship.ts";

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

function possible(out: ClinchAnswer) {
  if (out.kind !== "possible") throw new Error(`expected possible, got ${out.kind}`);
  return out;
}

/** Bands as [from, to, conditions as "id Pn" | "alone" | "no"]. */
const bands = (out: ClinchAnswer) =>
  possible(out).finishes!.map((b) => [
    b.from,
    b.to,
    b.conditions == null ? "no" : b.conditions.length === 0 ? "alone" : b.conditions.map((c) => `${c.id} P${c.position}`).join(", "),
  ]);

describe("clinchAfterRound", () => {
  it("Antonelli clinches P1 after Austin only by winning, with Russell P9 or lower and Hamilton P5 or lower", () => {
    // Hamilton may score 11: a tie on 365 still goes to Antonelli on wins (9 to Hamilton's 6 at most).
    assert.deepEqual(bands(clinchAfterRound(drivers, "ant", 1, rounds, "usa")), [
      [1, 1, "rus P9, ham P5"],
      [2, 11, "no"],
    ]);
  });

  it("Verstappen clinches P8 after Austin on his own with P7 or higher; lower, Lawson must not win", () => {
    const out = possible(clinchAfterRound(drivers, "ver", 8, rounds, "usa"));
    assert.deepEqual(out.ahead, ["ant", "rus", "ham", "lec", "nor", "pia", "had"]);
    // Outside the points (221) against Lawson on 75 + 125 to play: Lawson may score 20, so P2 or lower.
    assert.deepEqual(bands(out), [
      [1, 7, "alone"],
      [8, 11, "law P2"],
    ]);
    assert.equal(out.points, null);
  });

  it("states the general rule as a margin to outscore each rival by, one less on countback", () => {
    const out = possible(clinchAfterRound(drivers, "ant", 1, rounds, "usa"));
    assert.deepEqual(
      out.rules.map((c) => [c.id, c.margin, c.countbackMargin]),
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
    assert.equal(possible(clinchAfterRound(drivers, "ant", 1, rounds, "mex")).earliest, "usa");
    assert.equal(possible(clinchAfterRound(drivers, "ant", 1, rounds, "usa")).earliest, "usa");
  });

  it("answers in points across several rounds: Hamilton needs 68 of 75 and margins over three rivals for P3", () => {
    const out = possible(clinchAfterRound(drivers, "ham", 3, rounds, "bra"));
    assert.equal(out.finishes, null);
    // No total is enough on its own; below 68 Verstappen (221 + 75 to play) can't be held off.
    assert.deepEqual(out.points, { alone: null, floor: 68, most: 75 });
    assert.deepEqual(
      out.rules.map((c) => [c.id, c.margin, c.countbackMargin]),
      [
        ["ver", 68, null],
        ["lec", 62, null],
        ["nor", 48, null],
      ],
    );
  });

  it("answers in points on a sprint weekend", () => {
    const out = possible(
      clinchAfterRound(
        [
          { id: "a", points: 100, wins: 1 },
          { id: "b", points: 90, wins: 0 },
        ],
        "a",
        1,
        [{ raceId: "r1", sprint: true }, { raceId: "r2", sprint: false }],
        "r1",
      ),
    );
    // b can reach 115 after r2; a needs 16 of the 33 on offer and to stay 16 ahead of b's weekend.
    assert.deepEqual(out.points, { alone: null, floor: 16, most: 33 });
    assert.deepEqual(out.rules.map((c) => [c.id, c.margin, c.countbackMargin]), [["b", 16, 15]]);
  });

  it("answers in points for teams", () => {
    const out = possible(
      clinchAfterRound(
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
      ),
    );
    // b can reach 323 after r2; a tie is enough (5 wins to b's 3 at most), so a needs 23 of 43.
    assert.deepEqual(out.points, { alone: null, floor: 23, most: 43 });
    assert.deepEqual(out.rules.map((c) => [c.id, c.margin, c.countbackMargin]), [["b", 24, 23]]);
  });

  it("finds the points that clinch on their own", () => {
    const out = possible(
      clinchAfterRound(
        [
          { id: "a", points: 100, wins: 1 },
          { id: "b", points: 50, wins: 0 },
        ],
        "a",
        1,
        ["r1", "r2", "r3"].map((raceId) => ({ raceId, sprint: false })),
        "r2",
      ),
    );
    // b could win r1, r2 and r3 (3 wins to a's 1), so a tie is never enough.
    // a is safe alone with 26: 126 against b's 50 + 50 + 25 = 125.
    assert.deepEqual(out.points, { alone: 26, floor: 0, most: 50 });
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
    // After r1, 25 remain and b can reach 5 wins, so a tie is never enough.
    // a wins (125): b may score 9 (P6). a P2 (118): b may score 2 (P9). a P3 or lower: b reaches 115+.
    assert.deepEqual(bands(out), [
      [1, 1, "b P6"],
      [2, 2, "b P9"],
      [3, 11, "no"],
    ]);
    assert.deepEqual(possible(out).rules.map((c) => [c.id, c.margin, c.countbackMargin]), [["b", 16, null]]);
  });
});
