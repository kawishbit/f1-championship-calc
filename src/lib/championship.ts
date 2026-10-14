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

export interface ClinchCondition {
  id: string;
  /** Best case: most points the rival may score up to and including the chosen round. */
  maxPoints: number;
  /** The same cap as a Grand Prix finish ("P9 or lower"): one Grand Prix with no sprint, drivers view only. */
  position: number | null;
  /** General rule: outscore the rival by at least this much up to and including the chosen round. */
  margin: number;
  /** One less, enough when the contender ends with more wins than the rival can reach; null when that can't happen. */
  countbackMargin: number | null;
}

export type ClinchAnswer =
  | { kind: "clinched" }
  /** `scores`: the contender's best-case points; `ahead`: the rivals let through for P2 and below (most points first). */
  | { kind: "possible"; earliest: string; scores: number; ahead: string[]; conditions: ClinchCondition[] }
  | { kind: "impossible"; earliest: string | null };

/**
 * Glossary `clinch after a round` (ADR-0005): what has to happen up to and
 * including `afterRaceId` for the contender to clinch P`target`. Best case:
 * the contender wins every Grand Prix and sprint up to then. Each rival is
 * tested on its own; the target-1 rivals with the most points are let through.
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
  const n = Math.min(Math.max(Math.trunc(target) || 1, 1), current.length);
  const rivals = current
    .filter((s) => s.id !== contenderId)
    .sort((a, b) => b.points - a.points || b.wins - a.wins);
  const ahead = rivals.slice(0, n - 1).map((r) => r.id);
  const held = rivals.slice(n - 1);

  // While the contender takes the top `cars` places, a rival tops out one place group lower.
  const below = (table: readonly number[]) => table.slice(cars, 2 * cars).reduce((a, b) => a + b, 0);

  /** Best case after the first `count` rounds; null when some held rival can't be held. */
  const bestCase = (count: number): ClinchCondition[] | null => {
    const counted = rounds.slice(0, count);
    const after = rounds.slice(count);
    const gain = availablePoints(counted, points, cars).total;
    const wins = me.wins + counted.length;
    const availAfter = availablePoints(after, points, cars).total;
    const rivalMax = counted.reduce((sum, r) => sum + below(points.race) + (r.sprint ? below(points.sprint) : 0), 0);
    const single = cars === 1 && counted.length === 1 && !counted[0].sprint;
    const conditions: ClinchCondition[] = [];
    for (const r of held) {
      // A rival who has left the grid stays on their current points and wins.
      const open = r.departed ? 0 : availAfter;
      const slack = me.points + gain - (r.points + open);
      const countback = wins > r.wins + (r.departed ? 0 : after.length);
      const cap = countback ? slack : slack - 1;
      if (cap < 0) return null;
      if (r.departed || cap >= rivalMax) continue;
      let position: number | null = null;
      if (single) {
        const i = points.race.findIndex((p) => p <= cap);
        position = i < 0 ? points.race.length + 1 : i + 1;
      }
      const margin = r.points + open - me.points + 1;
      conditions.push({ id: r.id, maxPoints: cap, position, margin, countbackMargin: countback ? margin - 1 : null });
    }
    return conditions;
  };

  // No rounds counted: every remaining point is still open, so this is "already clinched".
  if (bestCase(0)) return { kind: "clinched" };
  const conditions = bestCase(at + 1);
  if (!conditions) {
    let earliest: string | null = null;
    for (let count = at + 2; count <= rounds.length && !earliest; count++) {
      if (bestCase(count)) earliest = rounds[count - 1].raceId;
    }
    return { kind: "impossible", earliest };
  }
  let first = 1;
  while (first < at + 1 && !bestCase(first)) first++;
  const scores = availablePoints(rounds.slice(0, at + 1), points, cars).total;
  return { kind: "possible", earliest: rounds[first - 1].raceId, scores, ahead, conditions };
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
