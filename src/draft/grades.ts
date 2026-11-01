// Bewertung der Picks: Note von A+ bis F-.
//
// Gewichtung (festgelegt): 60 % "Wurden Needs erfüllt?", 40 % "Verhältnis Spieler-Rank zu Pick-Nummer" (Value).
//
// Need-Wert eines Picks (0–100), je nachdem ob und wie früh das Team die Position braucht:
//   1. Need 100 · 2. Need 90 · 3. Need 80 · 4. Need 70 · 5. Need 60.
//   War das Need schon durch einen früheren Pick desselben Teams besetzt: 55, ab dem zweiten Extra-Spieler: 35.
//   Position steht gar nicht in den Needs: 50.
// Value-Wert eines Picks (0–100) aus Rank und Pick-Nr.:  82 − 50 · ln((Rank + 8) / (Pick + 8)), begrenzt auf 0–100.
//   Rank = Pick ist ein fairer Pick (82). Ein Steal (Rank deutlich vor dem Pick) ergibt bis 100, ein Reach deutlich weniger.
//   Das "+ 8" verhindert, dass ganz frühe Picks (z.B. Pick 1 statt Rank 3) zu hart bestraft werden.
// Team-Note: Need-Anteil und Value-Anteil sind jeweils der Durchschnitt der Pick-Werte, frühe Runden zählen
//   stärker (Gewicht 1/√Runde). Welche Needs abgedeckt wurden bzw. offen blieben, wird zusätzlich angezeigt.

import type { Player } from '../data/types';
import type { DraftSession } from './engine';

export const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F+', 'F', 'F-'] as const;
export type Grade = (typeof GRADES)[number];

/** Mindestpunktzahl je Note, von oben nach unten. */
export const GRADE_THRESHOLDS: readonly (readonly [number, Grade])[] = [
  [95, 'A+'],
  [90, 'A'],
  [86, 'A-'],
  [82, 'B+'],
  [78, 'B'],
  [74, 'B-'],
  [70, 'C+'],
  [66, 'C'],
  [62, 'C-'],
  [58, 'D+'],
  [54, 'D'],
  [50, 'D-'],
  [42, 'F+'],
  [34, 'F'],
];

export const WEIGHT_NEED = 0.6;
export const WEIGHT_VALUE = 0.4;
/** Need-Wert nach Priorität des Needs (1. bis 5. Need). */
export const NEED_BY_PRIORITY = [100, 90, 80, 70, 60] as const;
export const NEED_ALREADY_FILLED = 55;
export const NEED_STACKED = 35;
export const NEED_NONE = 50;

export function gradeFor(score: number): Grade {
  const s = Number.isFinite(score) ? score : 0;
  for (const [min, grade] of GRADE_THRESHOLDS) if (s >= min) return grade;
  return 'F-';
}

/** Sortierwert einer Note (A+ = 0 … F- = 14), z.B. für Ranglisten. */
export function gradeIndex(g: Grade): number {
  return GRADES.indexOf(g);
}

/** Farbstufe für die Anzeige: gut, mittel, schwach. */
export function gradeTone(g: Grade): 'good' | 'ok' | 'bad' {
  const c = g[0];
  return c === 'A' || c === 'B' ? 'good' : c === 'C' ? 'ok' : 'bad';
}

export function valueScore(rank: number, pick: number): number {
  const r = Number.isFinite(rank) && rank > 0 ? rank : 9999;
  const v = 82 - 50 * Math.log((r + 8) / (pick + 8));
  return Math.max(0, Math.min(100, v));
}

const positionsOf = (p: Player): string[] => [p.pos, ...(p.altPos ?? [])];

export interface PickGrade {
  /** Index in session.order. */
  index: number;
  pick: number;
  round: number;
  team: string;
  playerId: string;
  /** Position aus den Needs, die dieser Pick abdeckt (falls einer). */
  needPos: string | null;
  needScore: number;
  valueScore: number;
  score: number;
  grade: Grade;
  /** Pick-Nr. minus Rank: positiv = Steal (Spieler war besser eingestuft), negativ = Reach. */
  delta: number;
}

export interface TeamGrade {
  team: string;
  picks: PickGrade[];
  needScore: number;
  valueScore: number;
  score: number;
  grade: Grade;
  /** Needs, die durch mindestens einen Pick abgedeckt wurden (in Prioritätsreihenfolge). */
  covered: string[];
  /** Needs, die offen blieben. */
  open: string[];
}

export interface DraftGrades {
  /** Gleiche Reihenfolge wie session.order; undefined für noch nicht gemachte Picks. */
  picks: (PickGrade | undefined)[];
  teams: Record<string, TeamGrade>;
}

export function gradeDraft(s: DraftSession): DraftGrades {
  const byId = new Map(s.pool.map((p) => [p.id, p]));
  /** Je Team: wie oft wurde eine Position bisher gezogen, und welche Needs sind schon abgedeckt. */
  const state = new Map<string, { counts: Record<string, number>; covered: Set<number> }>();
  const picks: (PickGrade | undefined)[] = [];
  const perTeam = new Map<string, PickGrade[]>();

  s.results.forEach((res, index) => {
    const slot = s.order[index];
    const player = byId.get(res.playerId);
    if (!slot || !player) {
      picks.push(undefined);
      return;
    }
    const needs = s.needs[slot.team] ?? [];
    const st = state.get(slot.team) ?? { counts: {}, covered: new Set<number>() };
    state.set(slot.team, st);
    const positions = positionsOf(player);

    // Bestes passendes Need dieses Picks bestimmen.
    let need = NEED_NONE;
    let needPos: string | null = null;
    let coverIndex = -1;
    let bestMatch = -1;
    needs.forEach((pos, i) => {
      if (!positions.includes(pos)) return;
      const filled = st.counts[pos] ?? 0;
      const score = filled === 0 ? (NEED_BY_PRIORITY[i] ?? 55) : filled === 1 ? NEED_ALREADY_FILLED : NEED_STACKED;
      if (score > bestMatch) {
        bestMatch = score;
        need = score;
        needPos = pos;
        coverIndex = filled === 0 ? i : -1;
      }
    });
    if (coverIndex >= 0) st.covered.add(coverIndex);
    for (const pos of positions) st.counts[pos] = (st.counts[pos] ?? 0) + 1;

    const value = valueScore(player.rank, slot.pick);
    const score = WEIGHT_NEED * need + WEIGHT_VALUE * value;
    const pg: PickGrade = {
      index,
      pick: slot.pick,
      round: slot.round,
      team: slot.team,
      playerId: player.id,
      needPos,
      needScore: Math.round(need),
      valueScore: Math.round(value),
      score: Math.round(score * 10) / 10,
      grade: gradeFor(score),
      delta: slot.pick - (Number.isFinite(player.rank) ? player.rank : slot.pick),
    };
    picks.push(pg);
    const list = perTeam.get(slot.team) ?? [];
    list.push(pg);
    perTeam.set(slot.team, list);
  });

  const teams: Record<string, TeamGrade> = {};
  for (const [team, list] of perTeam) {
    const needs = s.needs[team] ?? [];
    const covered = state.get(team)?.covered ?? new Set<number>();
    let wsum = 0;
    let vsum = 0;
    let nsum = 0;
    for (const p of list) {
      const w = 1 / Math.sqrt(Math.max(1, p.round));
      wsum += w;
      vsum += w * p.valueScore;
      nsum += w * p.needScore;
    }
    const value = wsum > 0 ? vsum / wsum : 0;
    const needScore = wsum > 0 ? nsum / wsum : 0;
    const score = WEIGHT_NEED * needScore + WEIGHT_VALUE * value;
    teams[team] = {
      team,
      picks: list,
      needScore: Math.round(needScore),
      valueScore: Math.round(value),
      score: Math.round(score * 10) / 10,
      grade: gradeFor(score),
      covered: [...covered].sort((a, b) => a - b).map((i) => needs[i]),
      open: needs.filter((_, i) => !covered.has(i)),
    };
  }
  return { picks, teams };
}

/** Die größten Steals (Spieler war besser eingestuft als der Pick) und Reaches (Spieler deutlich zu früh gewählt). */
export function stealsAndReaches<T extends { delta: number | null; pick: number }>(lines: readonly T[], n = 5): { steals: T[]; reaches: T[] } {
  const valid = lines.filter((l): l is T & { delta: number } => l.delta !== null && Number.isFinite(l.delta));
  const steals = valid.filter((l) => l.delta > 0).sort((a, b) => b.delta - a.delta || a.pick - b.pick).slice(0, n);
  const reaches = valid.filter((l) => l.delta < 0).sort((a, b) => a.delta - b.delta || a.pick - b.pick).slice(0, n);
  return { steals, reaches };
}
