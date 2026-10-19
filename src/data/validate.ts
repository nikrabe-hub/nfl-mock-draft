// Plausibilitätsprüfungen. Werden von der App (Laden, Import) und vom Daten-Job (vor dem Speichern) genutzt.
// Schlägt eine Prüfung fehl, bleibt der letzte gültige Stand bestehen.

import { makeId } from './names';
import { isPosition } from './positions';
import { getTeam, normalizeAbbr } from './teams';
import type { BigBoardFile, CollegeStatsFile, DraftOrderFile, DraftPick, Player, PlayerProfile, SourceInfo } from './types';

export type IssueCode =
  | 'not_object'
  | 'meta_missing'
  | 'meta_bad_date'
  | 'meta_bad_version'
  | 'list_missing'
  | 'too_few'
  | 'bad_item'
  | 'dup_pick'
  | 'gap_pick'
  | 'bad_round'
  | 'round_order'
  | 'bad_team'
  | 'teams_incomplete'
  | 'round_size'
  | 'dup_rank'
  | 'dup_id'
  | 'bad_pos'
  | 'bad_value'
  | 'bad_stat';

export interface Issue {
  code: IssueCode;
  detail?: string;
}

export type Result<T> = { ok: true; data: T } | { ok: false; issues: Issue[] };

/**
 * Mindestanzahl Spieler im Big Board. Der Prompt nennt 200; Tankathon listet derzeit aber nur 162 Spieler
 * (die Liste wächst im Lauf der Saison). 100 schützt weiter vor kaputten Abrufen.
 */
export const MIN_BOARD_PLAYERS = 100;

const MAX_ISSUES = 20;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isText = (v: unknown, max = 120): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

function fail<T>(issues: Issue[]): Result<T> {
  return { ok: false, issues: issues.slice(0, MAX_ISSUES) };
}

export function validateMeta(raw: Record<string, unknown>, now: Date = new Date()): { info?: SourceInfo; issues: Issue[] } {
  const issues: Issue[] = [];
  if (!isText(raw.quelle, 200)) issues.push({ code: 'meta_missing', detail: 'quelle' });
  const t = typeof raw.abgerufenAm === 'string' ? Date.parse(raw.abgerufenAm) : NaN;
  if (Number.isNaN(t) || t > now.getTime() + 24 * 3600 * 1000) issues.push({ code: 'meta_bad_date', detail: String(raw.abgerufenAm) });
  if (!isInt(raw.version) || raw.version < 1) issues.push({ code: 'meta_bad_version', detail: String(raw.version) });
  if (issues.length) return { issues };
  return { info: { quelle: raw.quelle as string, abgerufenAm: raw.abgerufenAm as string, version: raw.version as number }, issues };
}

// --- Draft-Reihenfolge -----------------------------------------------------

export function validateDraftOrder(raw: unknown, now: Date = new Date()): Result<DraftOrderFile> {
  if (!isRecord(raw)) return fail([{ code: 'not_object' }]);
  const meta = validateMeta(raw, now);
  if (!meta.info) return fail(meta.issues);
  if (!Array.isArray(raw.picks)) return fail([{ code: 'list_missing', detail: 'picks' }]);
  const year = raw.year;
  if (!isInt(year) || year < 2025 || year > 2040) return fail([{ code: 'bad_value', detail: `year=${String(year)}` }]);

  const issues: Issue[] = [];
  const picks: DraftPick[] = [];
  const seen = new Set<number>();
  const teamsSeen = new Set<string>();

  raw.picks.forEach((p: unknown, i: number) => {
    if (!isRecord(p) || !isInt(p.pick) || p.pick < 1 || !isInt(p.round)) {
      issues.push({ code: 'bad_item', detail: `picks[${i}]` });
      return;
    }
    if (p.round < 1 || p.round > 7) issues.push({ code: 'bad_round', detail: `Pick ${p.pick}: Runde ${p.round}` });
    const team = typeof p.team === 'string' ? getTeam(p.team) : undefined;
    if (!team) {
      issues.push({ code: 'bad_team', detail: `Pick ${p.pick}: ${String(p.team)}` });
      return;
    }
    let from: string | undefined;
    if (p.from !== undefined && p.from !== null) {
      const origin = typeof p.from === 'string' ? getTeam(p.from) : undefined;
      if (!origin) {
        issues.push({ code: 'bad_team', detail: `Pick ${p.pick} (von): ${String(p.from)}` });
        return;
      }
      if (origin.abbr !== team.abbr) from = origin.abbr;
      teamsSeen.add(origin.abbr);
    }
    if (seen.has(p.pick)) issues.push({ code: 'dup_pick', detail: String(p.pick) });
    seen.add(p.pick);
    teamsSeen.add(team.abbr);
    picks.push(from ? { pick: p.pick, round: p.round, team: team.abbr, from } : { pick: p.pick, round: p.round, team: team.abbr });
  });
  if (issues.length) return fail(issues);

  picks.sort((a, b) => a.pick - b.pick);
  if (picks.length < 220 || picks.length > 290) return fail([{ code: 'too_few', detail: `${picks.length} Picks` }]);
  for (let i = 0; i < picks.length; i++) {
    if (picks[i].pick !== i + 1) return fail([{ code: 'gap_pick', detail: `Pick ${i + 1} fehlt` }]);
    if (i > 0 && picks[i].round < picks[i - 1].round) return fail([{ code: 'round_order', detail: `Pick ${picks[i].pick}` }]);
  }
  for (let r = 1; r <= 7; r++) {
    const n = picks.filter((p) => p.round === r).length;
    if (n < 28 || n > 48) return fail([{ code: 'round_size', detail: `Runde ${r}: ${n} Picks` }]);
  }
  if (teamsSeen.size !== 32) return fail([{ code: 'teams_incomplete', detail: `${teamsSeen.size} von 32 Teams` }]);

  return { ok: true, data: { ...meta.info, year, picks } };
}

// --- Big Board / Spieler ---------------------------------------------------

function validateProfile(v: unknown): { value?: PlayerProfile | null; bad?: boolean } {
  if (v === undefined || v === null) return { value: null };
  if (!isRecord(v)) return { bad: true };
  const out: PlayerProfile = {};
  for (const key of ['strengths', 'weaknesses', 'comparison'] as const) {
    const f = v[key];
    if (f === undefined || f === null || f === '') continue;
    if (typeof f !== 'string' || f.length > 800) return { bad: true };
    out[key] = f;
  }
  return { value: Object.keys(out).length ? out : null };
}

/** Prüft ein einzelnes Spielerobjekt. Gibt Fehler als Text zurück oder den bereinigten Spieler. */
export function checkPlayer(p: unknown): { player?: Player; error?: string } {
  if (!isRecord(p)) return { error: 'kein Objekt' };
  if (!isText(p.name, 80)) return { error: 'Name fehlt' };
  if (!isText(p.college, 80)) return { error: 'College fehlt' };
  if (!isPosition(p.pos)) return { error: `Position unbekannt: ${String(p.pos)}` };
  if (!isInt(p.rank) || p.rank < 1 || p.rank > 2000) return { error: `Rank ungültig: ${String(p.rank)}` };

  const num = (key: string, min: number, max: number): { v?: number | null; bad?: boolean } => {
    const v = p[key];
    if (v === undefined || v === null) return { v: null };
    if (!isNum(v) || v < min || v > max) return { bad: true };
    return { v };
  };
  const adp = num('adp', 1, 600);
  const heightIn = num('heightIn', 60, 90);
  const weightLb = num('weightLb', 120, 450);
  const age = num('age', 18, 30);
  const posRank = num('posRank', 1, 200);
  for (const [key, r] of Object.entries({ adp, heightIn, weightLb, age, posRank })) {
    if (r.bad) return { error: `${key} unplausibel: ${String(p[key])}` };
  }
  let altPos: string[] | undefined;
  if (p.altPos !== undefined && p.altPos !== null) {
    if (!Array.isArray(p.altPos) || !p.altPos.every((x) => isPosition(x))) return { error: 'Position unbekannt: altPos' };
    if (p.altPos.length) altPos = [...new Set(p.altPos as string[])].filter((x) => x !== p.pos);
  }
  const profile = validateProfile(p.profile);
  if (profile.bad) return { error: 'Profil ungültig' };
  if (p.klasse !== undefined && p.klasse !== null && !isText(p.klasse, 40)) return { error: 'Klasse ungültig' };
  if (p.manual !== undefined && !(Array.isArray(p.manual) && p.manual.every((x) => typeof x === 'string'))) return { error: 'manual ungültig' };

  const name = (p.name as string).trim();
  const college = (p.college as string).trim();
  const player: Player = {
    id: isText(p.id, 200) ? (p.id as string) : makeId(name, college),
    name,
    pos: p.pos as string,
    college,
    rank: p.rank as number,
  };
  if (altPos?.length) player.altPos = altPos;
  if (posRank.v != null) player.posRank = posRank.v;
  if (adp.v != null) player.adp = adp.v;
  if (heightIn.v != null) player.heightIn = heightIn.v;
  if (weightLb.v != null) player.weightLb = weightLb.v;
  if (age.v != null) player.age = age.v;
  if (typeof p.klasse === 'string') player.klasse = p.klasse.trim();
  if (profile.value) player.profile = profile.value;
  if (p.notListed === true) player.notListed = true;
  if (Array.isArray(p.manual) && p.manual.length) player.manual = p.manual as string[];
  return { player };
}

export function validateBigBoard(raw: unknown, opts: { minPlayers?: number; now?: Date } = {}): Result<BigBoardFile> {
  const minPlayers = opts.minPlayers ?? MIN_BOARD_PLAYERS;
  if (!isRecord(raw)) return fail([{ code: 'not_object' }]);
  const meta = validateMeta(raw, opts.now);
  if (!meta.info) return fail(meta.issues);
  if (!Array.isArray(raw.players)) return fail([{ code: 'list_missing', detail: 'players' }]);

  const issues: Issue[] = [];
  const players: Player[] = [];
  const ids = new Set<string>();
  const ranks = new Set<number>();

  raw.players.forEach((item: unknown, i: number) => {
    const { player, error } = checkPlayer(item);
    if (!player) {
      const label = isRecord(item) && typeof item.name === 'string' ? item.name : `#${i + 1}`;
      issues.push({ code: error?.startsWith('Position') ? 'bad_pos' : error?.includes('unplausibel') || error?.includes('Rank') ? 'bad_value' : 'bad_item', detail: `${label}: ${error}` });
      return;
    }
    if (ids.has(player.id)) issues.push({ code: 'dup_id', detail: player.name });
    ids.add(player.id);
    if (!player.notListed) {
      if (ranks.has(player.rank)) issues.push({ code: 'dup_rank', detail: `${player.rank} (${player.name})` });
      ranks.add(player.rank);
    }
    players.push(player);
  });
  if (issues.length) return fail(issues);
  if (players.filter((p) => !p.notListed).length < minPlayers) {
    return fail([{ code: 'too_few', detail: `${players.filter((p) => !p.notListed).length} Spieler, mindestens ${minPlayers} nötig` }]);
  }
  return { ok: true, data: { ...meta.info, players } };
}

// --- College-Statistiken ---------------------------------------------------

export function validateCollegeStats(raw: unknown, now?: Date): Result<CollegeStatsFile> {
  if (!isRecord(raw)) return fail([{ code: 'not_object' }]);
  const meta = validateMeta(raw, now);
  if (!meta.info) return fail(meta.issues);
  if (!isInt(raw.season) || raw.season < 2020 || raw.season > 2040) return fail([{ code: 'bad_value', detail: `season=${String(raw.season)}` }]);
  if (!isRecord(raw.stats)) return fail([{ code: 'list_missing', detail: 'stats' }]);

  const issues: Issue[] = [];
  const stats: Record<string, Record<string, number>> = {};
  for (const [id, values] of Object.entries(raw.stats)) {
    if (!isRecord(values)) {
      issues.push({ code: 'bad_stat', detail: id });
      continue;
    }
    const clean: Record<string, number> = {};
    for (const [key, v] of Object.entries(values)) {
      const pct = /pct|percent|rate/i.test(key);
      const max = pct ? 100 : 12000;
      if (!isNum(v) || v < -200 || v > max) issues.push({ code: 'bad_stat', detail: `${id}.${key}=${String(v)}` });
      else clean[key] = v;
    }
    stats[id] = clean;
  }
  if (issues.length) return fail(issues);
  return { ok: true, data: { ...meta.info, season: raw.season, stats } };
}

export { normalizeAbbr };
