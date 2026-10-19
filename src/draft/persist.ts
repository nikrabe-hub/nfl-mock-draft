// Autosave: Nach jedem Pick wird der Draft gespeichert (IndexedDB, Ersatz localStorage – siehe storage/db.ts).
//
// Die Schreibvorgänge laufen nacheinander. Kommen schnell mehrere Picks (Tempo "sofort"), wird nur der
// jeweils neueste Stand geschrieben – der ältere wäre ohnehin sofort überholt. Der letzte Pick geht nie verloren.

import { getStorage, type KVStorage } from '../storage/db';
import { KEYS } from '../storage/keys';
import { sanitizeSession, type DraftSession } from './engine';

type Job = { session: DraftSession | null };

let latest: Job | undefined;
let flushing: Promise<void> | null = null;
let failed = false;
let storageOverride: KVStorage | undefined;

/** Nur für Tests. */
export function useStorageForTests(storage: KVStorage | undefined): void {
  storageOverride = storage;
}

async function flush(): Promise<void> {
  while (latest) {
    const job = latest;
    latest = undefined;
    try {
      const storage = storageOverride ?? (await getStorage());
      if (job.session) await storage.set(KEYS.activeDraft, job.session);
      else await storage.remove(KEYS.activeDraft);
      failed = false;
    } catch {
      failed = true; // Anzeige und Draft laufen trotzdem weiter
    }
  }
}

/** Fordert das Speichern an (null = gespeicherten Draft löschen). Gibt ein Versprechen zurück, das erfüllt ist, sobald alles geschrieben ist. */
export function saveSession(session: DraftSession | null): Promise<void> {
  latest = { session };
  if (!flushing) {
    flushing = flush().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

export function whenSaved(): Promise<void> {
  return flushing ?? Promise.resolve();
}

export function lastSaveFailed(): boolean {
  return failed;
}

export type LoadResult = { kind: 'none' } | { kind: 'ok'; session: DraftSession } | { kind: 'invalid' };

export async function loadSession(): Promise<LoadResult> {
  try {
    const storage = storageOverride ?? (await getStorage());
    const raw = await storage.get(KEYS.activeDraft);
    if (raw === undefined) return { kind: 'none' };
    const session = sanitizeSession(raw);
    return session ? { kind: 'ok', session } : { kind: 'invalid' };
  } catch {
    return { kind: 'none' };
  }
}
