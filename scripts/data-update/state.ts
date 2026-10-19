// Merkt sich zwischen den Läufen: ETag/Last-Modified je Seite, letzter Lauf und letzter manueller Start je Quelle.
// Liegt im Repository (data-state/state.json), damit der Job auf frischen GitHub-Runnern weiß, was zuletzt war.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SourceName } from './schedule';

export interface PageState {
  etag?: string;
  lastModified?: string;
  /** Berliner Datum des letzten Abrufs (YYYY-MM-DD). */
  fetchedOn?: string;
}

export interface SourceState {
  lastRun?: string;
  lastSuccess?: string;
  lastManual?: string;
  pages: Record<string, PageState>;
}

export type State = Partial<Record<SourceName, SourceState>>;

export function emptySource(): SourceState {
  return { pages: {} };
}

export async function readState(file: string): Promise<State> {
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as unknown;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as State;
  } catch {
    /* keine oder beschädigte Datei = leerer Zustand */
  }
  return {};
}

export async function writeState(file: string, state: State): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(state, null, 2) + '\n', 'utf8');
}
