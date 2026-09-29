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
