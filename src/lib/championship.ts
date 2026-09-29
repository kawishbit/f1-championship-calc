 // Points tables and scenario/clinch math. No public API publishes the points
 // system, so the snapshot embeds it (scripts/snapshot.mjs) and the UI passes
 // it through; these constants are the compiled-in fallback + test anchor.
 // Fastest lap pays 0 since 2025 — kept as an explicit zero slot so avail
 // boxes + solver pick it up automatically if reintroduced (never paid in sprints).
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

 type Slot = { raceId: string; sprint: boolean; points: number; position: number; position2: number | null };

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
   points: PointsSystem = DEFAULT_POINTS,
   cars = 1,
 ): EffortResult {
   if (cars !== 1 && cars !== 2) throw new Error(`unsupported cars: ${cars}`);
   const me = current.find((s) => s.id === contenderId);
   if (!me) throw new Error(`unknown id: ${contenderId}`);
   const clamped = Math.min(Math.max(Math.trunc(target) || 1, 1), current.length);
   const others = current.filter((s) => s.id !== contenderId);
   /** Final rank of the contender at `total` when rivals stay on current points. */
   const rankAt = (total: number, wins: number) =>
     1 + others.filter((r) => r.points > total || (r.points === total && r.wins > wins)).length;

   // One prize per event: each round offers one race prize and (sometimes) one
   // sprint prize. Groups keep the mutually-exclusive options per event.
   // Fastest lap is a free best-case bonus (banked every round, never contested
   // in the knapsack): it lowers every bar by rounds.length * fl and is added
   // back to the reported totals. Zero today, so all of this is identity.
   // cars = 2 (teams view): one event pays the combined points of both cars —
   // every single finish plus every distinct pair (P1+P2 = 43 race, 8+7 = 15
   // sprint), since the cheapest cover for a small gap may be one car alone.
   const flPerRace = points.fastestLap;
   const freeFL = rounds.length * flPerRace;
   const pairOpts = (table: readonly number[]) => {
     const opts: Array<{ points: number; position: number; position2: number | null }> = [];
     for (let i = 0; i < table.length; i++) opts.push({ points: table[i], position: i + 1, position2: null });
     if (cars === 2) {
       for (let i = 0; i < table.length; i++)
         for (let j = i + 1; j < table.length; j++)
           opts.push({ points: table[i] + table[j], position: i + 1, position2: j + 1 });
     }
     return opts;
   };
   const groups: Slot[][] = [];
   for (const r of rounds) {
     groups.push(pairOpts(points.race).map((o) => ({ raceId: r.raceId, sprint: false, ...o })));
     if (r.sprint) groups.push(pairOpts(points.sprint).map((o) => ({ raceId: r.raceId, sprint: true, ...o })));
   }
   const maxPoints = groups.reduce((sum, g) => sum + Math.max(...g.map((s) => s.points)), 0) + freeFL;
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
             wins: cur.wins + (!slot.sprint && (slot.position === 1 || slot.position2 === 1) ? 1 : 0),
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
     const scored = spent.taken.length === 0 ? 0 : spent.points + freeFL;
     const total = me.points + scored;
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
       pointsNeeded: scored,
       winsAdded: spent.wins,
       assignments: [...byRound.values()],
     };
   };

   // Walk the bar down: first try beating the rival at (target - 1), i.e. the
   // cheapest rival whose total we must exceed; ties are winnable only with
   // strictly more wins (FIA order), otherwise we must outscore them by a point.
   // Free fastest-lap points lower every bar: the knapsack only funds the rest.
   const rivals = [...others].sort((a, b) => b.points - a.points || b.wins - a.wins);
   const gates = [0, ...rivals.slice(0, clamped).map((r) => r.points)];
   for (let beat = clamped - 1; beat >= 0; beat--) {
     const barPoints = gates[beat + 1] ?? 0;
     const solutions: Array<{ points: number; wins: number; taken: Slot[] }> = [];
     const outright = spend(Math.max(0, barPoints - me.points + 1 - freeFL));
     if (outright) solutions.push(outright);
     for (const r of rivals.filter((x) => x.points === barPoints)) {
       const tieNeed = barPoints - me.points - freeFL;
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
   return { ...finish({ points: maxPoints - freeFL, wins: winSlots, taken: best }), possible: false, position: rankAt(total, wins) };
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
