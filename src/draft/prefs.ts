// Zuletzt gewählte Draft-Optionen (Teams, Runden, Tempo, Zufallsgrad). Standard: Realistisch.

import { getTeam } from '../data/teams';
import { getStorage } from '../storage/db';
import { KEYS } from '../storage/keys';
import { createStore } from '../store';
import { clampRounds, RANDOMNESS_LEVELS, TEMPOS, type Randomness, type Tempo } from './engine';

export interface DraftPrefs {
  userTeams: string[];
  rounds: number;
  tempo: Tempo;
  randomness: Randomness;
}

export const DEFAULT_PREFS: DraftPrefs = { userTeams: [], rounds: 1, tempo: 'normal', randomness: 'realistic' };

export function sanitizePrefs(raw: unknown): DraftPrefs {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const teams = Array.isArray(r.userTeams) ? r.userTeams.filter((t): t is string => typeof t === 'string').map((t) => getTeam(t)?.abbr).filter((t): t is string => !!t) : [];
  return {
    userTeams: [...new Set(teams)],
    rounds: r.rounds === undefined ? DEFAULT_PREFS.rounds : clampRounds(r.rounds),
    tempo: TEMPOS.includes(r.tempo as Tempo) ? (r.tempo as Tempo) : DEFAULT_PREFS.tempo,
    randomness: RANDOMNESS_LEVELS.includes(r.randomness as Randomness) ? (r.randomness as Randomness) : DEFAULT_PREFS.randomness,
  };
}

export const prefsStore = createStore<DraftPrefs>({ ...DEFAULT_PREFS });

export async function loadPrefs(): Promise<void> {
  try {
    const raw = await (await getStorage()).get(KEYS.draftPrefs);
    if (raw !== undefined) prefsStore.set(sanitizePrefs(raw));
  } catch {
    /* Standardwerte bleiben */
  }
}

export async function updatePrefs(patch: Partial<DraftPrefs>): Promise<void> {
  const next = sanitizePrefs({ ...prefsStore.get(), ...patch });
  prefsStore.set(next);
  try {
    await (await getStorage()).set(KEYS.draftPrefs, next);
  } catch {
    /* egal: Die Auswahl gilt trotzdem für diese Sitzung */
  }
}
