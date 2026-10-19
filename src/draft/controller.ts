// Steuert den laufenden Draft: Start, Fortsetzen, eigene Picks, KI-Picks im gewählten Tempo, Autosave.

import { dataStore } from '../data/loader';
import { getStorage } from '../storage/db';
import { KEYS } from '../storage/keys';
import { createStore } from '../store';
import {
  applyAiPick,
  applyPick,
  createSession,
  currentSlot,
  isUserTurn,
  type CreateError,
  type DraftSession,
  type PickError,
} from './engine';
import { resolveNeeds } from './needs';
import { prefsStore } from './prefs';
import { loadSession, saveSession } from './persist';

export interface DraftUi {
  /** Wurde der gespeicherte Draft schon gelesen? */
  loaded: boolean;
  session: DraftSession | null;
  /** Ein gespeicherter Draft war unbrauchbar und wurde ignoriert. */
  invalidSaved: boolean;
  /** Die KI zieht gerade Picks. */
  cpuRunning: boolean;
  /** Anzahl Picks beim letzten Zug (für die Animation neuer Picks). */
  lastIndex: number;
}

export const draftStore = createStore<DraftUi>({ loaded: false, session: null, invalidSaved: false, cpuRunning: false, lastIndex: -1 });

export const DELAY_MS = { slow: 1200, normal: 400, instant: 0 } as const;
/** Bei Tempo "sofort" gibt die App alle so viele Picks kurz die Kontrolle ab, damit die Oberfläche bedienbar bleibt. */
const YIELD_EVERY = 12;

let epoch = 0; // erhöht sich, wenn ein Draft beendet/verworfen/neu gestartet wird -> laufende Schleife bricht ab
let idle: Promise<void> = Promise.resolve();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function commit(session: DraftSession | null, extra: Partial<DraftUi> = {}): void {
  draftStore.set({ session, lastIndex: session ? session.results.length - 1 : -1, ...extra });
  void saveSession(session);
}

/** Wartet, bis keine KI-Picks mehr laufen (für Tests). */
export function whenIdle(): Promise<void> {
  return idle;
}

/** Lässt die Computer-Teams ziehen, bis ein eigenes Team an der Reihe ist oder der Draft endet. */
function drive(): void {
  if (draftStore.get().cpuRunning) return;
  const myEpoch = epoch;
  draftStore.set({ cpuRunning: true });
  idle = (async () => {
    let sinceYield = 0;
    try {
      for (;;) {
        const s = draftStore.get().session;
        if (myEpoch !== epoch || !s || s.status !== 'running' || isUserTurn(s)) return;
        const ms = DELAY_MS[prefsStore.get().tempo];
        if (ms > 0) {
          await sleep(ms);
        } else if (++sinceYield >= YIELD_EVERY) {
          sinceYield = 0;
          await sleep(0);
        }
        const now = draftStore.get().session;
        if (myEpoch !== epoch || now !== s) continue; // zwischenzeitlich verändert: neu bewerten
        commit(applyAiPick(s));
      }
    } catch {
      /* Ein Fehler in der KI darf die App nie lahmlegen: Der Draft bleibt am letzten gespeicherten Stand stehen. */
    } finally {
      if (myEpoch === epoch) draftStore.set({ cpuRunning: false });
    }
  })();
}

export type StartError = CreateError | 'no_data';

export async function startDraft(opts: { seed?: number; now?: Date } = {}): Promise<{ ok: true } | { ok: false; error: StartError }> {
  const data = dataStore.get();
  const prefs = prefsStore.get();
  if (data.picks.length === 0 || data.players.length === 0) return { ok: false, error: 'no_data' };
  let override: unknown;
  try {
    override = await (await getStorage()).get(KEYS.needsOverride);
  } catch {
    override = undefined;
  }
  const seed = opts.seed ?? randomSeed();
  const created = createSession({
    order: data.picks,
    players: data.players,
    needs: resolveNeeds(override),
    year: data.draftYear,
    config: { rounds: prefs.rounds, userTeams: prefs.userTeams, randomness: prefs.randomness, seed },
    now: opts.now,
  });
  if (!created.ok) return { ok: false, error: created.error };
  epoch++;
  commit(created.session, { cpuRunning: false, invalidSaved: false });
  drive();
  return { ok: true };
}

/** Beim App-Start: gespeicherten Draft lesen und, wenn nötig, an derselben Stelle weiterlaufen lassen. */
export async function resumeDraft(): Promise<void> {
  const r = await loadSession();
  if (r.kind === 'ok') {
    epoch++;
    draftStore.set({ loaded: true, session: r.session, invalidSaved: false, cpuRunning: false, lastIndex: r.session.results.length - 1 });
    drive();
  } else {
    draftStore.set({ loaded: true, session: null, invalidSaved: r.kind === 'invalid', cpuRunning: false, lastIndex: -1 });
  }
}

export function userPick(playerId: string, opts: { auto?: boolean } = {}): { ok: true } | { ok: false; error: PickError | 'not_your_turn' } {
  const s = draftStore.get().session;
  if (!s || s.status !== 'running') return { ok: false, error: 'finished' };
  if (!isUserTurn(s)) return { ok: false, error: 'not_your_turn' };
  const r = applyPick(s, playerId, opts);
  if (!r.ok) return r;
  commit(r.session);
  drive();
  return { ok: true };
}

/** Die KI wählt jetzt für das eigene Team. */
export function autoPickNow(): boolean {
  const s = draftStore.get().session;
  if (!s || s.status !== 'running' || !isUserTurn(s)) return false;
  const next = applyAiPick(s, { auto: true });
  if (next === s) return false;
  commit(next);
  drive();
  return true;
}

/** Verwirft den Draft (auch den gespeicherten). */
export function discardDraft(): void {
  epoch++;
  commit(null, { cpuRunning: false, invalidSaved: false });
}

/** Tempo wurde geändert: Läuft die KI gerade, übernimmt sie das neue Tempo beim nächsten Pick. */
export function nudge(): void {
  const s = draftStore.get().session;
  if (s && s.status === 'running' && !isUserTurn(s)) drive();
}

export function nextSlotInfo(): ReturnType<typeof currentSlot> {
  const s = draftStore.get().session;
  return s ? currentSlot(s) : null;
}

function randomSeed(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0];
  } catch {
    return Math.floor(Math.random() * 0xffffffff);
  }
}
