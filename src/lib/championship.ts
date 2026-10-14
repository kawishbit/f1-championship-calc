 // Points tables and scenario/clinch math. No public API publishes the points
 // system, so the snapshot embeds it (scripts/snapshot.mjs) and the UI passes
 // it through; these constants are the compiled-in fallback + test anchor.
 // Fastest lap pays 0 since 2025 — kept as an explicit zero slot so avail
 // boxes + clinch answer pick it up automatically if reintroduced (never paid in sprints).
 export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;
 export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
 export const FASTEST_LAP_POINTS = 0;

 /** Points system, mirroring `points` in snapshot.json. */
 export interface PointsSystem {
   race: readonly number[];
   sprint: readonly number[];
   /** Per Grand Prix (never paid in sprints). */
   fastestLap: number;
 }

 export const DEFAULT_POINTS: PointsSystem = {
   race: RACE_POINTS,
   sprint: SPRINT_POINTS,
   fastestLap: FASTEST_LAP_POINTS,
 };

 export interface AvailBreakdown {
   gp: number;
   sprint: number;
   fastestLap: number;
   total: number;
 }

 /**
  * Available-points boxes. `cars` = scoring finishers per event: 1 for drivers
  * (P1), 2 for teams (P1+P2 — a team banks both its drivers). Fastest lap pays
  * once per Grand Prix in any view (one driver sets it; never in sprints).
  */
 export function availablePoints(
   rounds: RoundInfo[],
   points: PointsSystem = DEFAULT_POINTS,
   cars = 1,
 ): AvailBreakdown {
   const n = Math.max(1, Math.trunc(cars) || 1);
   const top = (table: readonly number[]) => table.slice(0, n).reduce((a, b) => a + b, 0);
   const sprints = rounds.filter((r) => r.sprint).length;
   const gp = rounds.length * top(points.race);
   const sprint = sprints * top(points.sprint);
   const fastestLap = rounds.length * points.fastestLap;
   return { gp, sprint, fastestLap, total: gp + sprint + fastestLap };
 }
 /**
  * Ordered insert with shift-down: place `id` at 1-based `pos`, moving every
  * occupant at >= pos down one (last falls out past `max`). Existing entry is
  * removed first, so moves never duplicate. `pos` null/0/out-of-range removes
  * only. Gaps preserved (nulls shift too), so sparse "P5 alone" picks survive.
  */
 export function insertPick(
   slots: Array<string | null>,
   id: string,
   pos: number | null,
   max: number,
 ): Array<string | null> {
   const n = Math.max(0, Math.trunc(max) || 0);
   const arr: Array<string | null> = Array.from({ length: n }, (_, i) => slots[i] ?? null);
   for (let i = 0; i < n; i++) if (arr[i] === id) arr[i] = null;
   const p = pos == null ? 0 : Math.trunc(pos);
   if (p >= 1 && p <= n) {
     for (let i = n - 1; i > p - 1; i--) arr[i] = arr[i - 1];
     arr[p - 1] = id;
   }
   let end = n;
   while (end > 0 && !arr[end - 1]) end--;
   return arr.slice(0, end);
 }

 export interface Standing {
  id: string;
  points: number;
  wins: number;
  /** Left the grid: keeps the points and wins already scored, but can't add to them. */
  departed?: boolean;
}

export interface RoundInfo {
  raceId: string;
  sprint: boolean;
}

 /** Position slots per round: index P1..Pn holds a driver/team id, null when empty. */
 export interface RoundPicks {
   race: Array<string | null>;
   sprint: Array<string | null>;
   /** Visitor reordered this round; untouched rounds inherit field order for display only. */
   touched?: boolean;
 }

 export function projectStandings(
   current: Standing[],
   scenario: Record<string, RoundPicks>,
   points: PointsSystem = DEFAULT_POINTS,
 ): Standing[] {
   const table: Record<string, Standing> = Object.fromEntries(
     current.map((s) => [s.id, { ...s }]),
   );
   for (const picks of Object.values(scenario)) {
     if (!picks.touched) continue;
     picks.race.forEach((id, i) => {
       if (!id) return;
       const row = table[id];
       if (!row) return;
       row.points += points.race[i] ?? 0;
       if (i === 0) row.wins += 1;
     });
     picks.sprint.forEach((id, i) => {
       if (!id) return;
       const row = table[id];
       if (!row) return;
       row.points += points.sprint[i] ?? 0;
     });
   }
   return Object.values(table).sort((a, b) => b.points - a.points || b.wins - a.wins);
 }

 /** Max points still available: P1 per undecided race + sprint P1, plus fastest lap. */
 export function maxRemainingPoints(
   rounds: RoundInfo[],
   scenario: Record<string, RoundPicks>,
   points: PointsSystem = DEFAULT_POINTS,
 ): number {
   return rounds.reduce((sum, r) => {
     const picks = scenario[r.raceId];
     if (picks?.touched) return sum;
     return sum + points.race[0] + points.fastestLap + (r.sprint ? points.sprint[0] : 0);
   }, 0);
 }

/** A rival who must finish no higher than `position` ("P2 or lower"). */
export interface RivalLimit {
  id: string;
  position: number;
}

/** A run of contender finishes with the same answer; finishes are 1-based, points table length + 1 = outside the points. */
export interface FinishBand {
  from: number;
  to: number;
  /** null: can't clinch with these finishes. Empty: clinched whatever anyone else does. */
  conditions: RivalLimit[] | null;
}

/** The contender's points up to and including the chosen round, when finishes can't express the answer. */
export interface PointsBands {
  /** Enough on its own, whatever anyone else does; null when no total is. */
  alone: number | null;
  /** Fewer than this and the clinch is out of reach after the chosen round. */
  floor: number;
  /** Most the contender can score up to then. */
  most: number;
}

/**
 * General rule: the contender must outscore the rival by `margin` or more up to
 * and including the chosen round (zero or less: the rival may outscore the
 * contender by up to -margin). `countbackMargin` (one less) is enough when the
 * contender ends with more wins than the rival can reach; null when that can't happen.
 */
export interface ClinchRule {
  id: string;
  margin: number;
  countbackMargin: number | null;
}

export type ClinchAnswer =
  | { kind: "clinched" }
  /**
   * `ahead`: the rivals let through for P2 and below (most points first).
   * `finishes` answers one Grand Prix with no sprint in the drivers view; `points` everything else.
   * `rules` covers every rival who still matters at the contender's lowest workable result.
   */
  | { kind: "possible"; earliest: string; ahead: string[]; finishes: FinishBand[] | null; points: PointsBands | null; rules: ClinchRule[] }
  | { kind: "impossible"; earliest: string | null };

/**
 * Glossary `clinch after a round` (ADR-0005): what has to happen up to and
 * including `afterRaceId` for the contender to clinch P`target`, laid out by the
 * contender's own result. Each rival is tested on its own; the target-1 rivals
 * with the most points are let through. Whenever the contender doesn't win
 * everything, rivals are assumed able to win the rest (countback included).
 */
export function clinchAfterRound(
  current: Standing[],
  contenderId: string,
  target: number,
  rounds: RoundInfo[],
  afterRaceId: string,
  points: PointsSystem = DEFAULT_POINTS,
  cars = 1,
): ClinchAnswer {
  const me = current.find((s) => s.id === contenderId);
  if (!me) throw new Error(`unknown id: ${contenderId}`);
  const at = rounds.findIndex((r) => r.raceId === afterRaceId);
  if (at < 0) throw new Error(`unknown round: ${afterRaceId}`);
  const position = Math.min(Math.max(Math.trunc(target) || 1, 1), current.length);
  const rivals = current
    .filter((s) => s.id !== contenderId)
    .sort((a, b) => b.points - a.points || b.wins - a.wins);
  const ahead = rivals.slice(0, position - 1).map((r) => r.id);
  const held = rivals.slice(position - 1);
  const live = held.filter((r) => !r.departed);

  const total = (rs: RoundInfo[]) => availablePoints(rs, points, cars).total;
  /**
   * Most points rival `r` may score in the first `count` rounds while the contender
   * scores `gain` and adds `wins` wins there, the rival adding at most `rivalWins`.
   * Negative: the rival can't be held off even on zero.
   */
  const capFor = (r: Standing, count: number, gain: number, wins: number, rivalWins: number) => {
    const after = rounds.slice(count);
    // A rival who has left the grid stays on their current points and wins.
    const left = r.departed ? 0 : total(after);
    const countback = me.wins + wins > r.wins + (r.departed ? 0 : rivalWins + after.length);
    return me.points + gain - (r.points + left) - (countback ? 0 : 1);
  };
  const feasible = (count: number, gain: number, wins: number) =>
    held.every((r) => capFor(r, count, gain, wins, 0) >= 0);
  /** Contender wins everything in the first `count` rounds; rivals score nothing. */
  const bestCase = (count: number) => feasible(count, total(rounds.slice(0, count)), count);

  // No rounds counted: every remaining point is still open, so this is "already clinched".
  if (feasible(0, 0, 0)) return { kind: "clinched" };
  const count = at + 1;
  if (!bestCase(count)) {
    let earliest: string | null = null;
    for (let c = count + 1; c <= rounds.length && !earliest; c++) {
      if (bestCase(c)) earliest = rounds[c - 1].raceId;
    }
    return { kind: "impossible", earliest };
  }
  let first = 1;
  while (first < count && !bestCase(first)) first++;
  const earliest = rounds[first - 1].raceId;

  const counted = rounds.slice(0, count);
  const after = rounds.slice(count);
  const rule = (r: Standing): ClinchRule => {
    const margin = r.points + (r.departed ? 0 : total(after)) - me.points + 1;
    const countback = me.wins + counted.length > r.wins + after.length;
    return { id: r.id, margin, countbackMargin: countback ? margin - 1 : null };
  };

  if (cars === 1 && counted.length === 1 && !counted[0].sprint) {
    const race = points.race;
    const limit = (cap: number) => {
      const i = race.findIndex((p) => p <= cap);
      return i < 0 ? race.length + 1 : i + 1;
    };
    const key = (c: RivalLimit[] | null) => (c == null ? "no" : c.map((x) => `${x.id}:${x.position}`).join(","));
    const finishes: FinishBand[] = [];
    let lowest: RivalLimit[] = [];
    for (let f = 1; f <= race.length + 1; f++) {
      const won = f === 1;
      const gain = (race[f - 1] ?? 0) + (won ? points.fastestLap : 0);
      let conditions: RivalLimit[] | null = null;
      if (feasible(count, gain, won ? 1 : 0)) {
        conditions = [];
        for (const r of live) {
          if (won) {
            // The rival can't win this Grand Prix too; P2 is the most they can take.
            const cap = capFor(r, count, gain, 1, 0);
            if (cap < race[1]) conditions.push({ id: r.id, position: limit(cap) });
          } else if (capFor(r, count, gain, 0, 1) < race[0]) {
            // A win would beat the contender, so the rival must not win: cap without that win.
            conditions.push({ id: r.id, position: Math.max(2, limit(capFor(r, count, gain, 0, 0))) });
          }
        }
        lowest = conditions;
      }
      const last = finishes.at(-1);
      if (last && key(last.conditions) === key(conditions)) last.to = f;
      else finishes.push({ from: f, to: f, conditions });
    }
    const rules = live.filter((r) => lowest.some((c) => c.id === r.id)).map(rule);
    return { kind: "possible", earliest, ahead, finishes, points: null, rules };
  }

  // Points: below the full haul the contender is assumed to win nothing, and
  // rivals to be able to take every prize and win.
  const most = total(counted);
  // While the contender takes the top `cars` places, a rival tops out one place group lower.
  const below = (table: readonly number[]) => table.slice(cars, 2 * cars).reduce((a, b) => a + b, 0);
  const rivalBelow = counted.reduce((sum, r) => sum + below(points.race) + (r.sprint ? below(points.sprint) : 0), 0);
  const heldOff = (r: Standing, g: number) =>
    g === most ? capFor(r, count, g, counted.length, 0) >= rivalBelow : capFor(r, count, g, 0, counted.length) >= most;
  let floor = most;
  while (floor > 0 && feasible(count, floor - 1, 0)) floor--;
  let alone: number | null = null;
  for (let g = 0; g <= most && alone == null; g++) {
    if (live.every((r) => heldOff(r, g))) alone = g;
  }
  const rules = live.filter((r) => !heldOff(r, floor)).map(rule);
  return { kind: "possible", earliest, ahead, finishes: null, points: { alone, floor, most }, rules };
}

export type ClinchState = "clinched" | "alive" | "eliminated";

/**
 * Glossary `clinch` (P1): mathematical certainty of winning regardless of all other
 * remaining outcomes. Points-only (wins break display ties, not clinch math).
 */
export function clinchState(
  projected: Standing[],
  id: string,
  maxRemaining: number,
): ClinchState {
  const me = projected.find((s) => s.id === id);
  if (!me) throw new Error(`unknown id: ${id}`);
  if (projected.every((r) => r.id === id || me.points > r.points + maxRemaining)) {
    return "clinched";
  }
  if (projected.some((r) => r.id !== id && r.points > me.points + maxRemaining)) {
    return "eliminated";
  }
  return "alive";
}
