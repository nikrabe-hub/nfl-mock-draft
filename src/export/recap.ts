// Datenmodell für die Picks-Übersicht eines Teams (Grundlage für das PNG).
// Reine Funktion ohne Zugriff auf Browser oder Canvas – deshalb gut testbar.

import { getTeam } from '../data/teams';
import type { DraftSession } from '../draft/engine';
import type { DraftGrades, Grade } from '../draft/grades';
import type { MockRecord } from '../draft/history';

export interface RecapRow {
  pick: number;
  round: number;
  name: string;
  pos: string;
  college: string;
  rank: number | null;
  grade: Grade;
  /** Pick-Nr. minus Rank: positiv = Steal, negativ = Reach. */
  delta: number | null;
  needPos: string | null;
  auto: boolean;
  /** Pick wurde von einem anderen Team übernommen (Trade-Herkunft aus der Draft-Order). */
  from?: string;
}

export interface Recap {
  team: string;
  city: string;
  name: string;
  primary: string;
  secondary: string;
  year: number;
  grade: Grade;
  score: number;
  needScore: number;
  valueScore: number;
  covered: string[];
  open: string[];
  rows: RecapRow[];
}

/** Baut die Übersicht für ein Team. Gibt null zurück, wenn das Team keine bewerteten Picks hat. */
export function buildRecap(s: DraftSession, grades: DraftGrades, team: string): Recap | null {
  const tg = grades.teams[team];
  if (!tg || tg.picks.length === 0) return null;
  const byId = new Map(s.pool.map((p) => [p.id, p]));
  const info = getTeam(team);
  const rows: RecapRow[] = [];
  for (const pg of tg.picks) {
    const player = byId.get(pg.playerId);
    if (!player) continue;
    const res = s.results[pg.index];
    rows.push({
      pick: pg.pick,
      round: pg.round,
      name: player.name,
      pos: player.pos,
      college: player.college || '–',
      rank: Number.isFinite(player.rank) ? player.rank : null,
      grade: pg.grade,
      delta: Number.isFinite(player.rank) ? pg.delta : null,
      needPos: pg.needPos,
      auto: !!res?.auto,
      from: s.order[pg.index]?.from,
    });
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => a.pick - b.pick);
  return {
    team,
    city: info?.city ?? '',
    name: info?.name ?? team,
    primary: info?.primary ?? '#51607a',
    secondary: info?.secondary ?? '#ffffff',
    year: s.year ?? 2027,
    grade: tg.grade,
    score: tg.score,
    needScore: tg.needScore,
    valueScore: tg.valueScore,
    covered: tg.covered,
    open: tg.open,
    rows,
  };
}

/** Baut die Übersicht aus einem gespeicherten Mock (Verlauf). */
export function recapFromMock(m: MockRecord, team: string): Recap | null {
  const tg = m.teams[team];
  const picks = m.picks.filter((p) => p.team === team);
  if (!tg || picks.length === 0) return null;
  const info = getTeam(team);
  return {
    team,
    city: info?.city ?? '',
    name: info?.name ?? team,
    primary: info?.primary ?? '#51607a',
    secondary: info?.secondary ?? '#ffffff',
    year: m.year,
    grade: tg.grade,
    score: tg.score,
    needScore: tg.needScore,
    valueScore: tg.valueScore,
    covered: tg.covered,
    open: tg.open,
    rows: picks.map((p) => ({
      pick: p.pick,
      round: p.round,
      name: p.name,
      pos: p.pos,
      college: p.college,
      rank: p.rank,
      grade: p.grade,
      delta: p.delta,
      needPos: p.needPos,
      auto: !!p.auto,
      from: p.from,
    })),
  };
}

/** Dateiname ohne Sonderzeichen, z.B. "mock-draft-2027-LAC.png". */
export function recapFileName(r: Pick<Recap, 'team' | 'year'>): string {
  const safe = r.team.replace(/[^A-Za-z0-9]/g, '') || 'team';
  return `mock-draft-${r.year}-${safe}.png`;
}

/** Bildhöhe in Pixeln für die gegebene Zeilenzahl (Breite ist fest 1080). */
export const RECAP_WIDTH = 1080;
export const RECAP_HEADER = 330;
export const RECAP_ROW = 112;
export const RECAP_FOOTER = 140;

export function recapHeight(rowCount: number): number {
  return RECAP_HEADER + RECAP_ROW * rowCount + RECAP_FOOTER;
}
