// Watchlist: Spieler mit Stern markieren. Wird automatisch gespeichert und ist Teil des Backups.

import { getStorage } from '../storage/db';
import { KEYS } from '../storage/keys';
import { createStore } from '../store';

export const MAX_WATCH = 500;

export interface WatchState {
  ids: string[];
}

export const watchStore = createStore<WatchState>({ ids: [] });

export function sanitizeWatchlist(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of list) {
    if (typeof v !== 'string' || !v || v.length > 200 || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= MAX_WATCH) break;
  }
  return out;
}

export async function loadWatchlist(): Promise<void> {
  try {
    const raw = await (await getStorage()).get(KEYS.watchlist);
    watchStore.set({ ids: sanitizeWatchlist(raw) });
  } catch {
    /* leer lassen */
  }
}

let chain: Promise<void> = Promise.resolve();

function persist(ids: string[]): void {
  chain = chain
    .then(async () => {
      await (await getStorage()).set(KEYS.watchlist, ids);
    })
    .catch(() => {
      /* Die Liste gilt trotzdem für diese Sitzung */
    });
}

/** Stern an/aus. Gibt zurück, ob der Spieler jetzt auf der Watchlist steht. */
export function toggleWatch(id: string): boolean {
  const cur = watchStore.get().ids;
  const has = cur.includes(id);
  const next = has ? cur.filter((x) => x !== id) : [...cur, id].slice(-MAX_WATCH);
  watchStore.set({ ids: next });
  persist(next);
  return !has;
}

export function whenWatchSaved(): Promise<void> {
  return chain;
}
