// Team-Needs: pro Team 3–5 Positionen, wichtigste zuerst.
//
// WICHTIG: Das sind GROBE SCHÄTZUNGEN von mir (Stand Sommer 2026), keine Quelldaten.
// Tankathon und andere Seiten liefern keine abrufbaren Needs. Die App kennzeichnet sie deshalb als „geschätzt“.
// Eigene Änderungen werden unter KEYS.needsOverride gespeichert und überschreiben diese Liste.

import { isPosition } from '../data/positions';
import { getTeam, TEAMS } from '../data/teams';

export const NEEDS_INFO = { quelle: 'Eigene Schätzung (keine Quelle)', stand: '2026-10-19', geschaetzt: true } as const;

export type NeedsMap = Record<string, string[]>;

export const DEFAULT_NEEDS: Readonly<NeedsMap> = {
  ARI: ['QB', 'OT', 'EDGE', 'CB'],
  ATL: ['EDGE', 'DI', 'CB', 'OT'],
  BAL: ['OT', 'WR', 'CB', 'DI'],
  BUF: ['WR', 'DI', 'CB', 'IOL'],
  CAR: ['EDGE', 'DI', 'CB', 'IOL'],
  CHI: ['DI', 'EDGE', 'S', 'IOL'],
  CIN: ['EDGE', 'DI', 'CB', 'S'],
  CLE: ['QB', 'WR', 'OT', 'IOL', 'S'],
  DAL: ['EDGE', 'DI', 'CB', 'S', 'LB'],
  DEN: ['IOL', 'TE', 'WR', 'LB'],
  DET: ['EDGE', 'CB', 'WR', 'S'],
  GB: ['EDGE', 'WR', 'IOL', 'DI'],
  HOU: ['OT', 'IOL', 'TE', 'DI'],
  IND: ['EDGE', 'CB', 'LB', 'OT'],
  JAX: ['OT', 'DI', 'S', 'TE'],
  KC: ['OT', 'EDGE', 'CB', 'DI'],
  LV: ['QB', 'OT', 'IOL', 'CB'],
  LAC: ['OT', 'IOL', 'DI', 'WR'],
  LAR: ['CB', 'EDGE', 'IOL', 'S'],
  MIA: ['QB', 'OT', 'EDGE', 'DI', 'CB'],
  MIN: ['IOL', 'DI', 'CB', 'S'],
  NE: ['WR', 'OT', 'EDGE', 'CB'],
  NO: ['QB', 'EDGE', 'CB', 'OT'],
  NYG: ['OT', 'WR', 'CB', 'DI'],
  NYJ: ['QB', 'EDGE', 'WR', 'OT', 'CB'],
  PHI: ['CB', 'S', 'IOL', 'LB'],
  PIT: ['QB', 'OT', 'DI', 'CB', 'WR'],
  SF: ['CB', 'DI', 'OT', 'S'],
  SEA: ['OT', 'IOL', 'EDGE', 'DI'],
  TB: ['EDGE', 'DI', 'IOL', 'S'],
  TEN: ['OT', 'EDGE', 'WR', 'CB', 'DI'],
  WAS: ['EDGE', 'DI', 'OT', 'CB'],
};

/** Macht aus beliebigen (evtl. kaputten) gespeicherten Needs eine gültige Liste; Unbrauchbares wird ignoriert. */
export function sanitizeNeeds(raw: unknown): NeedsMap {
  const out: NeedsMap = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [abbr, list] of Object.entries(raw as Record<string, unknown>)) {
    const team = getTeam(abbr);
    if (!team || !Array.isArray(list)) continue;
    const positions = [...new Set(list.filter((p): p is string => typeof p === 'string' && isPosition(p)))].slice(0, 5);
    if (positions.length) out[team.abbr] = positions;
  }
  return out;
}

/** Eingebaute Needs, darüber die (geprüften) eigenen Änderungen. Jedes der 32 Teams hat immer eine Liste. */
export function resolveNeeds(override: unknown): NeedsMap {
  const o = sanitizeNeeds(override);
  const out: NeedsMap = {};
  for (const team of TEAMS) out[team.abbr] = o[team.abbr] ?? [...(DEFAULT_NEEDS[team.abbr] ?? [])];
  return out;
}
