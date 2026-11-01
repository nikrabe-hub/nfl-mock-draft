// Mock-Verlauf: Abgeschlossene Drafts werden als kompakter Schnappschuss lokal gespeichert
// (mit Spielernamen und Noten, damit sie auch nach einem Daten-Update unverändert bleiben).

import { getStorage } from '../storage/db';
import { KEYS } from '../storage/keys';
import { createStore } from '../store';
import { getTeam } from '../data/teams';
import type { DraftSession } from './engine';
import { GRADES, gradeDraft, type DraftGrades, type Grade } from './grades';
import { sanitizeTrades, type TradeEntry } from './tradeTypes';

export const MAX_MOCKS = 25;

export interface MockPick {
  pick: number;
  round: number;
  team: string;
  from?: string;
  playerId: string;
  name: string;
  pos: string;
  college: string;
  rank: number | null;
  grade: Grade;
  delta: number | null;
  needPos: string | null;
  auto?: boolean;
}

export interface MockTeam {
  grade: Grade;
  score: number;
  needScore: number;
  valueScore: number;
  covered: string[];
  open: string[];
}

export interface MockRecord {
  id: string;
  savedAt: string;
  year: number;
  userTeams: string[];
  rounds: number;
  randomness: string;
  /** false, wenn der Pool vorzeitig leer war. */
  complete: boolean;
  picks: MockPick[];
  teams: Record<string, MockTeam>;
  /** Ausgeführte Trades dieses Mocks. */
  trades: TradeEntry[];
}

export function recordFromSession(s: DraftSession, grades: DraftGrades = gradeDraft(s)): MockRecord {
  const byId = new Map(s.pool.map((p) => [p.id, p]));
  const picks: MockPick[] = [];
  s.results.forEach((res, index) => {
    const pg = grades.picks[index];
    const slot = s.order[index];
    const player = byId.get(res.playerId);
    if (!pg || !slot || !player) return;
    const finite = Number.isFinite(player.rank);
    const mp: MockPick = {
      pick: slot.pick,
      round: slot.round,
      team: slot.team,
      playerId: player.id,
      name: player.name,
      pos: player.pos,
      college: player.college || '–',
      rank: finite ? player.rank : null,
      grade: pg.grade,
      delta: finite ? pg.delta : null,
      needPos: pg.needPos,
    };
    if (slot.from) mp.from = slot.from;
    if (res.auto) mp.auto = true;
    picks.push(mp);
  });
  const teams: Record<string, MockTeam> = {};
  for (const [team, tg] of Object.entries(grades.teams)) {
    teams[team] = { grade: tg.grade, score: tg.score, needScore: tg.needScore, valueScore: tg.valueScore, covered: tg.covered, open: tg.open };
  }
  return {
    id: s.id,
    savedAt: s.updatedAt || s.createdAt,
    year: s.year ?? 2027,
    userTeams: [...s.config.userTeams],
    rounds: s.config.rounds,
    randomness: s.config.randomness,
    complete: s.endReason !== 'pool_empty',
    picks,
    teams,
    trades: s.trades ? [...s.trades] : [],
  };
}

// ---------------------------------------------------------------------------------------------
// Prüfen geladener Daten (Backup-Import kann beliebigen Inhalt liefern)

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isGrade = (v: unknown): v is Grade => typeof v === 'string' && (GRADES as readonly string[]).includes(v);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length <= 20).slice(0, 12) : []);

function sanitizePick(v: unknown): MockPick | null {
  if (!isRecord(v)) return null;
  const pick = num(v.pick);
  const round = num(v.round);
  const team = str(v.team, 6);
  const playerId = str(v.playerId);
  const name = str(v.name);
  const pos = str(v.pos, 8);
  if (pick === null || round === null || !team || !playerId || !name || !pos || !isGrade(v.grade)) return null;
  const out: MockPick = {
    pick,
    round,
    team,
    playerId,
    name,
    pos,
    college: typeof v.college === 'string' ? v.college.slice(0, 80) : '–',
    rank: num(v.rank),
    grade: v.grade,
    delta: num(v.delta),
    needPos: str(v.needPos, 8),
  };
  const from = str(v.from, 6);
  if (from) out.from = from;
  if (v.auto === true) out.auto = true;
  return out;
}

function sanitizeTeam(v: unknown): MockTeam | null {
  if (!isRecord(v) || !isGrade(v.grade)) return null;
  const score = num(v.score);
  const needScore = num(v.needScore);
  const valueScore = num(v.valueScore);
  if (score === null || needScore === null || valueScore === null) return null;
  return { grade: v.grade, score, needScore, valueScore, covered: strList(v.covered), open: strList(v.open) };
}

export function sanitizeMock(v: unknown): MockRecord | null {
  if (!isRecord(v)) return null;
  const id = str(v.id);
  const savedAt = str(v.savedAt, 40);
  if (!id || !savedAt || !Array.isArray(v.picks) || !isRecord(v.teams)) return null;
  const picks = v.picks.slice(0, 300).map(sanitizePick).filter((p): p is MockPick => p !== null);
  if (picks.length === 0) return null;
  const teams: Record<string, MockTeam> = {};
  for (const [k, tv] of Object.entries(v.teams).slice(0, 40)) {
    const abbr = getTeam(k)?.abbr;
    const team = sanitizeTeam(tv);
    if (abbr && team) teams[abbr] = team;
  }
  const userTeams = strList(v.userTeams).map((t) => getTeam(t)?.abbr).filter((t): t is string => !!t);
  return {
    id,
    savedAt,
    year: num(v.year) ?? 2027,
    userTeams,
    rounds: Math.max(1, Math.min(7, Math.round(num(v.rounds) ?? 1))),
    randomness: str(v.randomness, 20) ?? 'realistic',
    complete: v.complete !== false,
    picks: picks.sort((a, b) => a.pick - b.pick),
    teams,
    trades: sanitizeTrades(v.trades) ?? [],
  };
}

export function sanitizeMocks(raw: unknown): MockRecord[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: MockRecord[] = [];
  for (const v of list) {
    const m = sanitizeMock(v);
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, MAX_MOCKS);
}

/** Fügt einen Mock hinzu (gleiche ID ersetzt den alten Eintrag) und kürzt auf die neuesten MAX_MOCKS. */
export function addMock(list: readonly MockRecord[], rec: MockRecord): MockRecord[] {
  return [rec, ...list.filter((m) => m.id !== rec.id)].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, MAX_MOCKS);
}

// ---------------------------------------------------------------------------------------------
// Speicher

export interface HistoryState {
  loaded: boolean;
  mocks: MockRecord[];
}

export const historyStore = createStore<HistoryState>({ loaded: false, mocks: [] });

let chain: Promise<void> = Promise.resolve();

/** Alle Änderungen laufen nacheinander: lesen, ändern, schreiben. */
function update(fn: (cur: MockRecord[]) => MockRecord[]): Promise<void> {
  chain = chain
    .then(async () => {
      const storage = await getStorage();
      const cur = sanitizeMocks(await storage.get(KEYS.mocks));
      const next = fn(cur);
      historyStore.set({ loaded: true, mocks: next });
      await storage.set(KEYS.mocks, next);
    })
    .catch(() => {
      /* Speichern fehlgeschlagen: Der Verlauf gilt trotzdem für diese Sitzung */
    });
  return chain;
}

export async function loadHistory(): Promise<void> {
  try {
    const raw = await (await getStorage()).get(KEYS.mocks);
    historyStore.set({ loaded: true, mocks: sanitizeMocks(raw) });
  } catch {
    historyStore.set({ loaded: true });
  }
}

/** Speichert einen beendeten Draft im Verlauf (einmal je Draft-ID). */
export function archiveSession(s: DraftSession): Promise<void> {
  if (s.status !== 'finished' || s.results.length === 0) return Promise.resolve();
  let rec: MockRecord;
  try {
    rec = recordFromSession(s);
  } catch {
    return Promise.resolve();
  }
  if (rec.picks.length === 0) return Promise.resolve();
  return update((cur) => addMock(cur, rec));
}

export function deleteMock(id: string): Promise<void> {
  return update((cur) => cur.filter((m) => m.id !== id));
}

export function clearHistory(): Promise<void> {
  return update(() => []);
}

export function whenHistorySaved(): Promise<void> {
  return chain;
}
