// Draft-Kern: reine Logik ohne Oberfläche und ohne Speicher.
//
// Ein Draft (DraftSession) ist in sich geschlossen: Er enthält eine Momentaufnahme der Pick-Reihenfolge, des
// Spieler-Pools und der Needs. Dadurch geht es nach dem Neuladen exakt am selben Pick weiter – auch wenn
// inzwischen neue Daten geladen wurden.
//
// Annahme (ausdrücklich): Die App erfindet keine Spieler. Hat der Pool weniger Spieler als Picks, endet der
// Draft nach dem letzten verfügbaren Spieler mit dem Grund "pool_empty"; die übrigen Picks bleiben leer.

import { isPosition, POSITION_VALUE, type Position } from '../data/positions';
import { getTeam } from '../data/teams';
import type { DraftPick, Player } from '../data/types';
import { gauss } from './rng';
import type { NeedsMap } from './needs';

export type Randomness = 'predictable' | 'realistic' | 'chaos';
export type Tempo = 'slow' | 'normal' | 'instant';

export const RANDOMNESS_LEVELS: readonly Randomness[] = ['predictable', 'realistic', 'chaos'];
export const TEMPOS: readonly Tempo[] = ['slow', 'normal', 'instant'];
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 7;

/** Streuung des Zufalls (Faktor auf den Score: exp(Sigma · z)). */
export const RANDOM_SIGMA: Record<Randomness, number> = { predictable: 0.02, realistic: 0.1, chaos: 0.3 };
/** Zusatzgewicht eines Needs je Prioritätsplatz (1. Need zählt am meisten). */
export const NEED_WEIGHTS = [0.2, 0.15, 0.1, 0.06, 0.03] as const;
/** Wie stark ein Need wirkt, wenn das Team die Position schon gezogen hat (0, 1, 2+ Spieler). */
export const FILLED_FACTOR = [1, 0.35, 0] as const;
/** Je größer, desto flacher fällt der Wert mit dem Rank ab. 45 Ränge ≈ Faktor e. */
export const RANK_SCALE = 45;
/** Abschlag je bereits gezogenem Spieler derselben Position (gegen Stapeln). */
export const STACK_PENALTY = 0.9;
/** Anteil des ADP am Big-Board-Wert, falls ein ADP vorhanden ist. */
export const ADP_SHARE = 0.3;

export interface DraftConfig {
  rounds: number;
  userTeams: string[];
  randomness: Randomness;
  seed: number;
}

export interface PickResult {
  /** Gesamt-Picknummer des Slots. */
  pick: number;
  playerId: string;
  /** Hat die KI für ein eigenes Team gewählt (Auto-Pick)? */
  auto?: boolean;
}

export type DraftStatus = 'running' | 'finished';
export type EndReason = 'complete' | 'pool_empty';

export const SESSION_FORMAT = 'nfl-mock-draft-session';
export const SESSION_VERSION = 1;

export interface DraftSession {
  format: typeof SESSION_FORMAT;
  version: number;
  id: string;
  createdAt: string;
  updatedAt: string;
  year: number | null;
  config: DraftConfig;
  /** Alle Picks der gewählten Runden in Reihenfolge. results[i] gehört zu order[i]. */
  order: DraftPick[];
  pool: Player[];
  needs: NeedsMap;
  results: PickResult[];
  status: DraftStatus;
  endReason?: EndReason;
}

// ---------------------------------------------------------------------------------------------
// Aufbau und Abfragen

export type CreateError = 'no_picks' | 'no_players' | 'no_teams';

export interface CreateInput {
  order: readonly DraftPick[];
  players: readonly Player[];
  needs: NeedsMap;
  year: number | null;
  config: DraftConfig;
  now?: Date;
  id?: string;
}

export function clampRounds(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : MIN_ROUNDS;
  return Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, v));
}

export function sortPool(players: readonly Player[]): Player[] {
  return players
    .filter((p) => !p.notListed && typeof p.id === 'string' && p.id)
    .map((p) => ({ ...p }))
    .sort((a, b) => safeRank(a) - safeRank(b) || a.name.localeCompare(b.name));
}

export function createSession(input: CreateInput): { ok: true; session: DraftSession } | { ok: false; error: CreateError } {
  const rounds = clampRounds(input.config.rounds);
  const order = input.order
    .filter((p) => p.round >= 1 && p.round <= rounds)
    .map((p) => ({ ...p }))
    .sort((a, b) => a.pick - b.pick);
  const pool = sortPool(input.players);
  const userTeams = [...new Set(input.config.userTeams.map((t) => getTeam(t)?.abbr).filter((t): t is string => !!t))];
  if (order.length === 0) return { ok: false, error: 'no_picks' };
  if (pool.length === 0) return { ok: false, error: 'no_players' };
  if (userTeams.length === 0) return { ok: false, error: 'no_teams' };
  const now = (input.now ?? new Date()).toISOString();
  const session: DraftSession = {
    format: SESSION_FORMAT,
    version: SESSION_VERSION,
    id: input.id ?? `d-${now.replace(/\D/g, '').slice(0, 14)}-${(input.config.seed >>> 0).toString(36)}`,
    createdAt: now,
    updatedAt: now,
    year: input.year,
    config: { rounds, userTeams, randomness: RANDOMNESS_LEVELS.includes(input.config.randomness) ? input.config.randomness : 'realistic', seed: input.config.seed >>> 0 },
    order,
    pool,
    needs: input.needs,
    results: [],
    status: 'running',
  };
  return { ok: true, session: settle(session) };
}

/** Setzt Status und Endgrund passend zum Fortschritt. */
function settle(s: DraftSession): DraftSession {
  if (s.results.length >= s.order.length) return { ...s, status: 'finished', endReason: 'complete' };
  if (s.results.length >= s.pool.length) return { ...s, status: 'finished', endReason: 'pool_empty' };
  if (s.status === 'running' && !s.endReason) return s;
  const { endReason: _unused, ...rest } = s;
  void _unused;
  return { ...rest, status: 'running' };
}

export function currentIndex(s: DraftSession): number {
  return s.results.length;
}

export function currentSlot(s: DraftSession): DraftPick | null {
  return s.status === 'running' ? (s.order[s.results.length] ?? null) : null;
}

export function isUserTeam(s: DraftSession, team: string): boolean {
  return s.config.userTeams.includes(team);
}

export function isUserTurn(s: DraftSession): boolean {
  const slot = currentSlot(s);
  return !!slot && isUserTeam(s, slot.team);
}

export function draftedIds(s: DraftSession): Set<string> {
  return new Set(s.results.map((r) => r.playerId));
}

export function availablePlayers(s: DraftSession): Player[] {
  const taken = draftedIds(s);
  return s.pool.filter((p) => !taken.has(p.id));
}

/** Ergebnis eines Slots (oder undefined, wenn der Pick noch nicht gemacht wurde). */
export function resultAt(s: DraftSession, index: number): PickResult | undefined {
  return s.results[index];
}

export function playerById(s: DraftSession, id: string): Player | undefined {
  return s.pool.find((p) => p.id === id);
}

/** Picks eines Teams (nach aktuellem Besitzer des Slots), mit Index in order. */
export function teamSlots(s: DraftSession, team: string): { index: number; slot: DraftPick }[] {
  const out: { index: number; slot: DraftPick }[] = [];
  s.order.forEach((slot, index) => {
    if (slot.team === team) out.push({ index, slot });
  });
  return out;
}

export function remainingPicks(s: DraftSession, team: string): number {
  return teamSlots(s, team).filter((x) => x.index >= s.results.length).length;
}

export function teamDrafted(s: DraftSession, team: string): Player[] {
  const byId = new Map(s.pool.map((p) => [p.id, p]));
  const out: Player[] = [];
  s.results.forEach((r, i) => {
    if (s.order[i]?.team !== team) return;
    const p = byId.get(r.playerId);
    if (p) out.push(p);
  });
  return out;
}

export interface NeedStatus {
  pos: string;
  /** Wie viele Spieler dieser Position das Team bereits gezogen hat. */
  filled: number;
}

/** Needs eines Teams in Prioritätsreihenfolge, mit Anzahl bereits gezogener Spieler dieser Position. */
export function needStatus(s: DraftSession, team: string): NeedStatus[] {
  const drafted = teamDrafted(s, team);
  return (s.needs[team] ?? []).map((pos) => ({ pos, filled: drafted.filter((p) => p.pos === pos || p.altPos?.includes(pos)).length }));
}

// ---------------------------------------------------------------------------------------------
// KI

function safeRank(p: Player): number {
  return Number.isFinite(p.rank) && p.rank > 0 ? p.rank : 9999;
}

/** Big-Board-Wert: Rank, mit ADP gemischt, falls vorhanden. Kleiner = besser. */
export function effectiveRank(p: Player): number {
  const r = safeRank(p);
  const adp = p.adp;
  return typeof adp === 'number' && Number.isFinite(adp) && adp > 0 ? (1 - ADP_SHARE) * r + ADP_SHARE * adp : r;
}

export function positionValue(pos: string): number {
  return isPosition(pos) ? POSITION_VALUE[pos as Position] : 0.9;
}

export interface ScoreParts {
  value: number;
  position: number;
  need: number;
  stack: number;
  noise: number;
  total: number;
}

function countByPos(players: readonly Player[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const p of players) c[p.pos] = (c[p.pos] ?? 0) + 1;
  return c;
}

/** Zusatzgewicht für die Needs des Teams (0 = kein Need). */
export function needBonus(needs: readonly string[], drafted: readonly Player[], player: Player): number {
  const positions = [player.pos, ...(player.altPos ?? [])];
  let best = 0;
  needs.forEach((pos, i) => {
    if (!positions.includes(pos)) return;
    const filled = drafted.filter((p) => p.pos === pos || p.altPos?.includes(pos)).length;
    const w = (NEED_WEIGHTS[i] ?? 0.02) * FILLED_FACTOR[Math.min(filled, FILLED_FACTOR.length - 1)];
    if (w > best) best = w;
  });
  return best;
}

export function scorePlayer(
  player: Player,
  ctx: { needs: readonly string[]; drafted: readonly Player[]; seed: number; pick: number; randomness: Randomness },
): ScoreParts {
  const value = Math.exp(-effectiveRank(player) / RANK_SCALE);
  const position = positionValue(player.pos);
  const need = 1 + needBonus(ctx.needs, ctx.drafted, player);
  const stack = Math.pow(STACK_PENALTY, countByPos(ctx.drafted)[player.pos] ?? 0);
  const noise = Math.exp(RANDOM_SIGMA[ctx.randomness] * gauss(ctx.seed, ctx.pick, player.id));
  return { value, position, need, stack, noise, total: value * position * need * stack * noise };
}

/** Wählt für den aktuellen Slot den Spieler mit dem höchsten Score. Gibt null zurück, wenn der Pool leer ist. */
export function chooseAiPick(s: DraftSession): string | null {
  const slot = currentSlot(s);
  if (!slot) return null;
  const available = availablePlayers(s);
  if (available.length === 0) return null;
  const drafted = teamDrafted(s, slot.team);
  const needs = s.needs[slot.team] ?? [];
  let best: Player | null = null;
  let bestScore = -Infinity;
  for (const p of available) {
    const { total } = scorePlayer(p, { needs, drafted, seed: s.config.seed, pick: slot.pick, randomness: s.config.randomness });
    const score = Number.isFinite(total) ? total : -1;
    if (score > bestScore || (score === bestScore && best && safeRank(p) < safeRank(best))) {
      best = p;
      bestScore = score;
    }
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------------------------------------
// Picks ausführen

export type PickError = 'finished' | 'unknown_player' | 'already_drafted';

export function applyPick(s: DraftSession, playerId: string, opts: { auto?: boolean; now?: Date } = {}): { ok: true; session: DraftSession } | { ok: false; error: PickError } {
  const slot = currentSlot(s);
  if (!slot) return { ok: false, error: 'finished' };
  if (!s.pool.some((p) => p.id === playerId)) return { ok: false, error: 'unknown_player' };
  if (s.results.some((r) => r.playerId === playerId)) return { ok: false, error: 'already_drafted' };
  const result: PickResult = opts.auto ? { pick: slot.pick, playerId, auto: true } : { pick: slot.pick, playerId };
  const next: DraftSession = { ...s, results: [...s.results, result], updatedAt: (opts.now ?? new Date()).toISOString() };
  return { ok: true, session: settle(next) };
}

/** Lässt die KI den aktuellen Pick machen (Computer-Team oder Auto-Pick für ein eigenes Team). */
export function applyAiPick(s: DraftSession, opts: { auto?: boolean; now?: Date } = {}): DraftSession {
  const id = chooseAiPick(s);
  if (id === null) return settle({ ...s, status: 'finished', endReason: 'pool_empty' });
  const r = applyPick(s, id, opts);
  return r.ok ? r.session : s;
}

// ---------------------------------------------------------------------------------------------
// Prüfen geladener Drafts

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function sanitizePlayer(v: unknown): Player | null {
  if (!isRecord(v) || typeof v.id !== 'string' || !v.id || typeof v.name !== 'string' || typeof v.pos !== 'string') return null;
  if (typeof v.rank !== 'number' || !Number.isFinite(v.rank)) return null;
  return { ...(v as unknown as Player), college: typeof v.college === 'string' ? v.college : '' };
}

/** Prüft einen gespeicherten Draft streng. Alles Unbrauchbare ergibt null – die App läuft dann ohne ihn weiter. */
export function sanitizeSession(raw: unknown): DraftSession | null {
  try {
    if (!isRecord(raw) || raw.format !== SESSION_FORMAT) return null;
    if (typeof raw.version !== 'number' || raw.version < 1 || raw.version > SESSION_VERSION) return null;
    if (!isRecord(raw.config) || !Array.isArray(raw.order) || !Array.isArray(raw.pool) || !Array.isArray(raw.results) || !isRecord(raw.needs)) return null;
    if (raw.order.length === 0 || raw.order.length > 400 || raw.pool.length === 0 || raw.pool.length > 5000 || raw.results.length > raw.order.length) return null;

    const c = raw.config;
    const userTeams = Array.isArray(c.userTeams) ? [...new Set(c.userTeams.filter((t): t is string => typeof t === 'string' && !!getTeam(t)).map((t) => getTeam(t)!.abbr))] : [];
    if (userTeams.length === 0) return null;
    const randomness = RANDOMNESS_LEVELS.includes(c.randomness as Randomness) ? (c.randomness as Randomness) : 'realistic';
    const config: DraftConfig = { rounds: clampRounds(c.rounds), userTeams, randomness, seed: typeof c.seed === 'number' && Number.isFinite(c.seed) ? c.seed >>> 0 : 1 };

    const order: DraftPick[] = [];
    let last = 0;
    for (const o of raw.order) {
      if (!isRecord(o) || !Number.isInteger(o.pick) || !Number.isInteger(o.round) || typeof o.team !== 'string') return null;
      const team = getTeam(o.team);
      if (!team || (o.pick as number) <= last) return null;
      last = o.pick as number;
      const slot: DraftPick = { pick: o.pick as number, round: o.round as number, team: team.abbr };
      if (typeof o.from === 'string' && getTeam(o.from)) slot.from = getTeam(o.from)!.abbr;
      order.push(slot);
    }

    const pool: Player[] = [];
    const ids = new Set<string>();
    for (const p of raw.pool) {
      const player = sanitizePlayer(p);
      if (!player || ids.has(player.id)) return null;
      ids.add(player.id);
      pool.push(player);
    }

    const results: PickResult[] = [];
    const taken = new Set<string>();
    for (let i = 0; i < raw.results.length; i++) {
      const r = raw.results[i];
      if (!isRecord(r) || typeof r.playerId !== 'string' || !ids.has(r.playerId) || taken.has(r.playerId) || r.pick !== order[i].pick) return null;
      taken.add(r.playerId);
      results.push(r.auto === true ? { pick: order[i].pick, playerId: r.playerId, auto: true } : { pick: order[i].pick, playerId: r.playerId });
    }

    const needs: NeedsMap = {};
    for (const [team, list] of Object.entries(raw.needs)) {
      if (Array.isArray(list)) needs[team] = list.filter((p): p is string => typeof p === 'string').slice(0, 8);
    }

    const base: DraftSession = {
      format: SESSION_FORMAT,
      version: SESSION_VERSION,
      id: typeof raw.id === 'string' && raw.id ? raw.id : `d-${config.seed.toString(36)}`,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
      year: typeof raw.year === 'number' && Number.isFinite(raw.year) ? raw.year : null,
      config,
      order,
      pool,
      needs,
      results,
      status: 'running',
    };
    return settle(base);
  } catch {
    return null;
  }
}
