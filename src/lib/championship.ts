// 2026 points tables and scenario/clinch math. No fastest-lap point since 2025.
export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

export interface Standing {
  id: string;
  points: number;
  wins: number;
}

export interface RoundInfo {
  raceId: string;
  sprint: boolean;
}

/** Finishing order per round: driver/team ids in P1..Pn order (only scored positions matter). */
export interface RoundPicks {
  race: string[];
  sprint: string[];
}

export function projectStandings(
  current: Standing[],
  scenario: Record<string, RoundPicks>,
): Standing[] {
  const table: Record<string, Standing> = Object.fromEntries(
    current.map((s) => [s.id, { ...s }]),
  );
  for (const picks of Object.values(scenario)) {
    picks.race.forEach((id, i) => {
      const row = table[id];
      if (!row) return;
      row.points += RACE_POINTS[i] ?? 0;
      if (i === 0) row.wins += 1;
    });
    picks.sprint.forEach((id, i) => {
      const row = table[id];
      if (!row) return;
      row.points += SPRINT_POINTS[i] ?? 0;
    });
  }
  return Object.values(table).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

/** Max points still available across rounds with no picks assigned yet. */
export function maxRemainingPoints(rounds: RoundInfo[], scenario: Record<string, RoundPicks>): number {
  return rounds
    .filter((r) => {
      const picks = scenario[r.raceId];
      return !picks || (picks.race.length === 0 && picks.sprint.length === 0);
    })
    .reduce((sum, r) => sum + 25 + (r.sprint ? 8 : 0), 0);
}
export interface EffortAssignment {
  raceId: string;
  /** 1-based Grand Prix finishing position, or null when the contender skips scoring. */
  racePosition: number | null;
  sprintPosition: number | null;
}

export interface EffortResult {
  possible: boolean;
  /** Final position the contender lands on with this path. */
  position: number;
  pointsNeeded: number;
  winsAdded: number;
  assignments: EffortAssignment[];
}

type Slot = { raceId: string; sprint: boolean; points: number; position: number };

/**
 * Least-effort path: fewest contender points that reach `target` (P1..Pn),
 * assuming every rival scores the minimum possible (stays on current points).
 * Each round offers one race prize and at most one sprint prize; a group
 * knapsack picks the cheapest prize set reaching each points bar, and ties
 * are winnable only on strictly more wins (FIA order). Positions are prizes
 * (P1..P10 race, P1..P8 sprint), never invented rival results. Returns
 * `possible: false` with the best reachable position when out of reach.
 */
export function leastEffortPath(
  current: Standing[],
  contenderId: string,
  target: number,
  rounds: RoundInfo[],
): EffortResult {
  const me = current.find((s) => s.id === contenderId);
  if (!me) throw new Error(`unknown id: ${contenderId}`);
  const clamped = Math.min(Math.max(Math.trunc(target) || 1, 1), current.length);
  const others = current.filter((s) => s.id !== contenderId);
  /** Final rank of the contender at `total` when rivals stay on current points. */
  const rankAt = (total: number, wins: number) =>
    1 + others.filter((r) => r.points > total || (r.points === total && r.wins > wins)).length;

  // One prize per event: each round offers one race prize and (sometimes) one
  // sprint prize. Groups keep the mutually-exclusive options per event.
  const groups: Slot[][] = [];
  for (const r of rounds) {
    groups.push(RACE_POINTS.map((points, i) => ({ raceId: r.raceId, sprint: false, points, position: i + 1 })));
    if (r.sprint) groups.push(SPRINT_POINTS.map((points, i) => ({ raceId: r.raceId, sprint: true, points, position: i + 1 })));
  }
  const maxPoints = groups.reduce((sum, g) => sum + g[0].points, 0);
  const winSlots = groups.filter((g) => !g[0].sprint).length;

  /** Cheapest spend reaching `need` points (at most one prize per event). */
  const spend = (need: number): { points: number; wins: number; taken: Slot[] } | null => {
    if (need <= 0) return { points: 0, wins: 0, taken: [] };
    let dp: Array<{ points: number; wins: number; taken: Slot[] } | null> = Array(need + 1).fill(null);
    dp[0] = { points: 0, wins: 0, taken: [] };
    for (const group of groups) {
      const next = [...dp];
      for (const slot of group) {
        for (let v = need; v >= 0; v--) {
          const cur = dp[v];
          if (!cur) continue;
          const nv = Math.min(need, v + slot.points);
          const cand = {
            points: cur.points + slot.points,
            wins: cur.wins + (!slot.sprint && slot.position === 1 ? 1 : 0),
            taken: [...cur.taken, slot],
          };
          const prev = next[nv];
          if (!prev || cand.points < prev.points || (cand.points === prev.points && cand.wins > prev.wins)) next[nv] = cand;
        }
      }
      dp = next;
    }
    return dp[need];
  };

  const finish = (spent: { points: number; wins: number; taken: Slot[] }): EffortResult => {
    const total = me.points + spent.points;
    const wins = me.wins + spent.wins;
    const byRound = new Map<string, EffortAssignment>();
    for (const r of rounds) byRound.set(r.raceId, { raceId: r.raceId, racePosition: null, sprintPosition: null });
    for (const slot of spent.taken) {
      const a = byRound.get(slot.raceId)!;
      if (slot.sprint) a.sprintPosition = slot.position;
      else a.racePosition = slot.position;
    }
    return {
      possible: true,
      position: rankAt(total, wins),
      pointsNeeded: spent.points,
      winsAdded: spent.wins,
      assignments: [...byRound.values()],
    };
  };

  // Walk the bar down: first try beating the rival at (target - 1), i.e. the
  // cheapest rival whose total we must exceed; ties are winnable only with
  // strictly more wins (FIA order), otherwise we must outscore them by a point.
  const rivals = [...others].sort((a, b) => b.points - a.points || b.wins - a.wins);
  const gates = [0, ...rivals.slice(0, clamped).map((r) => r.points)];
  for (let beat = clamped - 1; beat >= 0; beat--) {
    const barPoints = gates[beat + 1] ?? 0;
    const solutions: Array<{ points: number; wins: number; taken: Slot[] }> = [];
    const outright = spend(barPoints - me.points + 1);
    if (outright) solutions.push(outright);
    for (const r of rivals.filter((x) => x.points === barPoints)) {
      const tieNeed = barPoints - me.points;
      const tie = spend(Math.max(0, tieNeed));
      if (tie && me.wins + tie.wins > r.wins) solutions.push(tie);
    }
    solutions.sort((a, b) => a.points - b.points || b.wins - a.wins);
    const best = solutions[0];
    if (best) {
      const done = finish(best);
      if (done.position <= clamped) return done;
    }
  }
  // Unreachable: show the best possible final position at full spend.
  const total = me.points + maxPoints;
  const wins = me.wins + winSlots;
  const best = groups.map((g) => g[0]);
  return { ...finish({ points: maxPoints, wins: winSlots, taken: best }), possible: false, position: rankAt(total, wins) };
}
export type ClinchState = "clinched" | "alive" | "eliminated";

/**
 * Glossary `clinch`: mathematical certainty of winning regardless of all other
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
