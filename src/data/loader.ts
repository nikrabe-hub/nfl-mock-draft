// Lädt die Datendateien (draft-order, big-board, college-stats).
//
// Quellen je Datei, die neueste gültige gewinnt:
//   1. online:  frisch vom Server (mit ?t=, damit der Service Worker den Cache umgeht)
//   2. bundled: die mit der App ausgelieferte Datei (im Offline-Cache des Service Workers)
//   3. stored:  die zuletzt gespeicherte gültige Kopie (IndexedDB)
// Ungültige Dateien werden verworfen, der letzte gültige Stand bleibt. Offline reichen 2 oder 3.

import { createStore } from '../store';
import { getStorage, type KVStorage } from '../storage/db';
import { CACHE_PREFIX, KEYS } from '../storage/keys';
import { mergePlayers, withPosRanks } from './merge';
import { collegeKey, normalizeName } from './names';
import type { BigBoardFile, CollegeStatsFile, DataSourceId, DraftOrderFile, DraftPick, IncomingPlayer, Player, SourceInfo } from './types';
import { validateBigBoard, validateCollegeStats, validateDraftOrder, type Issue, type Result } from './validate';

export type Origin = 'online' | 'bundled' | 'stored' | 'none';

export interface SourceStatus {
  id: DataSourceId | 'overlay';
  info: SourceInfo | null;
  count: number;
  origin: Origin;
  /** Meldung, wenn eine geladene Datei verworfen wurde. */
  issues: Issue[];
}

export interface Overlay extends SourceInfo {
  players: IncomingPlayer[];
}

export interface DataState {
  loaded: boolean;
  players: Player[];
  picks: DraftPick[];
  draftYear: number | null;
  stats: Record<string, Record<string, number>>;
  statsSeason: number | null;
  sources: SourceStatus[];
}

export const dataStore = createStore<DataState>({
  loaded: false,
  players: [],
  picks: [],
  draftYear: null,
  stats: {},
  statsSeason: null,
  sources: [],
});

export interface LoaderDeps {
  fetchFn?: typeof fetch;
  storage?: KVStorage;
  baseUrl?: string;
  now?: () => number;
  timeoutMs?: number;
}

const ORIGIN_RANK: Record<Origin, number> = { online: 3, bundled: 2, stored: 1, none: 0 };

function newer(a: SourceInfo, b: SourceInfo): boolean {
  const ta = Date.parse(a.abgerufenAm);
  const tb = Date.parse(b.abgerufenAm);
  return ta !== tb ? ta > tb : a.version > b.version;
}

async function fetchJson(fetchFn: typeof fetch, url: string, timeoutMs: number): Promise<unknown | undefined> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { signal: ctl.signal, cache: 'no-cache' });
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined; // offline, Zeitüberschreitung oder keine JSON-Datei
  } finally {
    clearTimeout(timer);
  }
}

async function loadSource<T extends SourceInfo>(
  name: DataSourceId,
  validate: (raw: unknown) => Result<T>,
  deps: Required<Pick<LoaderDeps, 'fetchFn' | 'baseUrl' | 'timeoutMs'>> & { storage: KVStorage; now: () => number },
): Promise<{ data: T | null; origin: Origin; issues: Issue[] }> {
  const candidates: { data: T; origin: Origin }[] = [];
  const issues: Issue[] = [];
  const consider = (raw: unknown, origin: Origin) => {
    if (raw === undefined) return;
    const r = validate(raw);
    if (r.ok) candidates.push({ data: r.data, origin });
    else issues.push(...r.issues);
  };

  const url = `${deps.baseUrl}data/${name}.json`;
  const [fresh, bundled, stored] = await Promise.all([
    fetchJson(deps.fetchFn, `${url}?t=${deps.now()}`, deps.timeoutMs),
    fetchJson(deps.fetchFn, url, deps.timeoutMs),
    deps.storage.get(`${CACHE_PREFIX}${name}`).catch(() => undefined),
  ]);
  consider(fresh, 'online');
  consider(bundled, 'bundled');
  consider(stored, 'stored');

  if (candidates.length === 0) return { data: null, origin: 'none', issues };
  const best = candidates.reduce((a, b) => (newer(b.data, a.data) || (!newer(a.data, b.data) && ORIGIN_RANK[b.origin] > ORIGIN_RANK[a.origin]) ? b : a));

  // Eine neuere gültige Fassung als gespeichert -> als letzten gültigen Stand merken
  const storedValid = candidates.find((c) => c.origin === 'stored');
  if (best.origin !== 'stored' && (!storedValid || newer(best.data, storedValid.data))) {
    try {
      await deps.storage.set(`${CACHE_PREFIX}${name}`, best.data);
    } catch {
      /* Zwischenspeicher ist optional */
    }
  }
  return { data: best.data, origin: best.origin, issues };
}

/** Wendet die eigenen Importe (Overlay) auf das Big Board an und berechnet die Position-Ranks. */
export function composePlayers(board: Player[], overlay: Overlay | null): Player[] {
  const merged = overlay && overlay.players.length ? mergePlayers(board, overlay.players, 'overlay').players : board;
  return withPosRanks(merged);
}

export async function readOverlay(storage: KVStorage): Promise<Overlay | null> {
  const raw = await storage.get<Overlay>(KEYS.dataOverlay).catch(() => undefined);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.players)) return null;
  return raw;
}

export async function loadData(deps: LoaderDeps = {}): Promise<void> {
  const storage = deps.storage ?? (await getStorage());
  const d = {
    fetchFn: deps.fetchFn ?? fetch.bind(globalThis),
    baseUrl: deps.baseUrl ?? import.meta.env.BASE_URL,
    timeoutMs: deps.timeoutMs ?? 8000,
    storage,
    now: deps.now ?? Date.now,
  };

  const [order, board, stats, overlay] = await Promise.all([
    loadSource<DraftOrderFile>('draft-order', (r) => validateDraftOrder(r), d),
    loadSource<BigBoardFile>('big-board', (r) => validateBigBoard(r), d),
    loadSource<CollegeStatsFile>('college-stats', (r) => validateCollegeStats(r), d),
    readOverlay(storage),
  ]);

  const players = composePlayers(board.data?.players ?? [], overlay);
  const sources: SourceStatus[] = [
    { id: 'draft-order', info: order.data, count: order.data?.picks.length ?? 0, origin: order.origin, issues: order.issues },
    { id: 'big-board', info: board.data, count: players.filter((p) => !p.notListed).length, origin: board.origin, issues: board.issues },
    { id: 'college-stats', info: stats.data, count: stats.data ? Object.keys(stats.data.stats).length : 0, origin: stats.origin, issues: stats.issues },
  ];
  if (overlay && overlay.players.length) {
    sources.push({ id: 'overlay', info: overlay, count: overlay.players.length, origin: 'stored', issues: [] });
  }

  dataStore.set({
    loaded: true,
    players,
    picks: order.data?.picks ?? [],
    draftYear: order.data?.year ?? null,
    stats: stats.data?.stats ?? {},
    statsSeason: stats.data?.season ?? null,
    sources,
  });
}

/** Speichert einen Import als Overlay und lädt die Daten neu. */
export async function saveOverlay(incoming: IncomingPlayer[], deps: LoaderDeps = {}): Promise<void> {
  const storage = deps.storage ?? (await getStorage());
  const existing = await readOverlay(storage);
  const merged = mergeOverlay(existing?.players ?? [], incoming);
  const overlay: Overlay = { quelle: 'Eigener Import', abgerufenAm: new Date((deps.now ?? Date.now)()).toISOString(), version: 1, players: merged };
  await storage.set(KEYS.dataOverlay, overlay);
  await loadData(deps);
}

export async function clearOverlay(deps: LoaderDeps = {}): Promise<void> {
  const storage = deps.storage ?? (await getStorage());
  await storage.remove(KEYS.dataOverlay);
  await loadData(deps);
}

/** Mehrere Importe nacheinander: gleiche Spieler werden Feld für Feld zusammengeführt, der neuere Import gewinnt. */
export function mergeOverlay(existing: IncomingPlayer[], incoming: IncomingPlayer[]): IncomingPlayer[] {
  const out = [...existing];
  const sameDude = (a: IncomingPlayer, b: IncomingPlayer) =>
    normalizeName(a.name) === normalizeName(b.name) && (!a.college || !b.college || collegeKey(a.college) === collegeKey(b.college));
  for (const p of incoming) {
    const i = out.findIndex((o) => sameDude(o, p));
    if (i < 0) {
      out.push(p);
      continue;
    }
    const old = out[i];
    const profile = old.profile || p.profile ? { ...(old.profile ?? {}), ...(p.profile ?? {}) } : undefined;
    out[i] = { ...old, ...p, ...(profile ? { profile } : {}) };
  }
  return out;
}
