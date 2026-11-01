// Eigene Änderungen an Team-Needs und Pick-Besitzern. Sie liegen getrennt von den Daten (Keys needsOverride und
// orderOverride) und werden so nie von einem Daten-Update überschrieben; sie gelten, bis der Nutzer sie zurücksetzt.

import { isPosition } from '../data/positions';
import { getTeam } from '../data/teams';
import type { DraftPick } from '../data/types';
import { getStorage } from '../storage/db';
import { KEYS } from '../storage/keys';
import { createStore } from '../store';
import { sanitizeNeeds, type NeedsMap } from './needs';

export const MIN_NEEDS = 3;
export const MAX_NEEDS = 5;

/** Pick-Nummer (als Text) -> Teamkürzel des neuen Besitzers. */
export type OrderOverride = Record<string, string>;

export interface Overrides {
  needs: NeedsMap;
  order: OrderOverride;
}

export const overridesStore = createStore<Overrides>({ needs: {}, order: {} });

export function sanitizeOrderOverride(raw: unknown): OrderOverride {
  const out: OrderOverride = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const pick = Number(k);
    const team = typeof v === 'string' ? getTeam(v)?.abbr : undefined;
    if (Number.isInteger(pick) && pick >= 1 && pick <= 1000 && team) out[String(pick)] = team;
  }
  return out;
}

/** Wendet geänderte Pick-Besitzer auf die Reihenfolge an. Die Herkunft ("↔ X") bleibt nachvollziehbar. */
export function applyOrderOverride(picks: readonly DraftPick[], override: OrderOverride): DraftPick[] {
  return picks.map((p) => {
    const team = override[String(p.pick)];
    if (!team || team === p.team) return { ...p };
    const next: DraftPick = { ...p, team, from: p.from ?? p.team };
    if (next.from === team) delete next.from;
    return next;
  });
}

export function overrideCounts(o: Overrides): { needs: number; picks: number } {
  return { needs: Object.keys(o.needs).length, picks: Object.keys(o.order).length };
}

export async function loadOverrides(): Promise<void> {
  try {
    const storage = await getStorage();
    overridesStore.set({ needs: sanitizeNeeds(await storage.get(KEYS.needsOverride)), order: sanitizeOrderOverride(await storage.get(KEYS.orderOverride)) });
  } catch {
    /* ohne eigene Änderungen weiter */
  }
}

let chain: Promise<void> = Promise.resolve();

function persist(key: string, value: unknown): void {
  chain = chain
    .then(async () => {
      const storage = await getStorage();
      if (value === undefined) await storage.remove(key);
      else await storage.set(key, value);
    })
    .catch(() => {
      /* gilt trotzdem für diese Sitzung */
    });
}

export function whenOverridesSaved(): Promise<void> {
  return chain;
}

export type NeedsError = 'unknown_team' | 'count' | 'duplicate' | 'invalid_position';

/** Speichert die Needs eines Teams (3–5 verschiedene Positionen, wichtigste zuerst). */
export function setTeamNeeds(team: string, positions: readonly string[]): { ok: true } | { ok: false; error: NeedsError } {
  const abbr = getTeam(team)?.abbr;
  if (!abbr) return { ok: false, error: 'unknown_team' };
  if (positions.some((p) => !isPosition(p))) return { ok: false, error: 'invalid_position' };
  if (new Set(positions).size !== positions.length) return { ok: false, error: 'duplicate' };
  if (positions.length < MIN_NEEDS || positions.length > MAX_NEEDS) return { ok: false, error: 'count' };
  const needs = { ...overridesStore.get().needs, [abbr]: [...positions] };
  overridesStore.set({ needs });
  persist(KEYS.needsOverride, needs);
  return { ok: true };
}

export function resetTeamNeeds(team: string): void {
  const { [team]: _removed, ...rest } = overridesStore.get().needs;
  void _removed;
  overridesStore.set({ needs: rest });
  persist(KEYS.needsOverride, Object.keys(rest).length ? rest : undefined);
}

export function resetAllNeeds(): void {
  overridesStore.set({ needs: {} });
  persist(KEYS.needsOverride, undefined);
}

/** Setzt den Besitzer eines Picks. Ist es der Besitzer aus den Daten, wird die Änderung entfernt. */
export function setPickOwner(pick: number, team: string, dataOwner: string): boolean {
  const abbr = getTeam(team)?.abbr;
  if (!abbr || !Number.isInteger(pick) || pick < 1) return false;
  const order = { ...overridesStore.get().order };
  if (abbr === dataOwner) delete order[String(pick)];
  else order[String(pick)] = abbr;
  overridesStore.set({ order });
  persist(KEYS.orderOverride, Object.keys(order).length ? order : undefined);
  return true;
}

export function resetOrder(): void {
  overridesStore.set({ order: {} });
  persist(KEYS.orderOverride, undefined);
}
