import { createStore } from '../store';
import { getStorage } from './db';
import { KEYS } from './keys';

export type Theme = 'system' | 'light' | 'dark';
export type Lang = 'de' | 'en';

export interface Settings {
  theme: Theme;
  lang: Lang;
}

export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
export const LANGS: readonly Lang[] = ['de', 'en'];

export function detectLang(): Lang {
  try {
    return navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
  } catch {
    return 'de';
  }
}

/** Macht aus beliebigen (evtl. kaputten) Daten gültige Einstellungen. */
export function sanitizeSettings(raw: unknown, fallbackLang: Lang = 'de'): Settings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    theme: THEMES.includes(r.theme as Theme) ? (r.theme as Theme) : 'system',
    lang: LANGS.includes(r.lang as Lang) ? (r.lang as Lang) : fallbackLang,
  };
}

function bootSettings(): Settings {
  let theme: unknown;
  let lang: unknown;
  try {
    theme = localStorage.getItem('nmd-theme');
    lang = localStorage.getItem('nmd-lang');
  } catch {
    /* kein localStorage */
  }
  return sanitizeSettings({ theme, lang }, detectLang());
}

export const settingsStore = createStore<Settings>(bootSettings());

const THEME_COLOR = { light: '#0b2a5b', dark: '#080d1a' };

export function applySettings(s: Settings): void {
  const root = document.documentElement;
  root.lang = s.lang;
  if (s.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', s.theme);

  const dark = s.theme === 'dark' || (s.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light);
  try {
    localStorage.setItem('nmd-theme', s.theme);
    localStorage.setItem('nmd-lang', s.lang);
  } catch {
    /* egal */
  }
}

export async function loadSettings(): Promise<void> {
  try {
    const raw = await (await getStorage()).get(KEYS.settings);
    if (raw !== undefined) settingsStore.set(sanitizeSettings(raw, settingsStore.get().lang));
  } catch {
    /* Standardwerte bleiben */
  }
  applySettings(settingsStore.get());
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const next = sanitizeSettings({ ...settingsStore.get(), ...patch }, settingsStore.get().lang);
  settingsStore.set(next);
  applySettings(next);
  try {
    await (await getStorage()).set(KEYS.settings, next);
  } catch {
    /* Anzeige funktioniert trotzdem weiter */
  }
}
