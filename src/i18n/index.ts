import { de, type MessageKey } from './de';
import { en } from './en';
import { settingsStore, type Lang } from '../storage/settings';
import { useStore } from '../store';

export type { MessageKey };

const DICTS: Record<Lang, Record<MessageKey, string>> = { de, en };

export type Params = Record<string, string | number>;

export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  let text: string = DICTS[lang][key] ?? de[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

/** Für Code außerhalb von Komponenten. */
export function t(key: MessageKey, params?: Params): string {
  return translate(settingsStore.get().lang, key, params);
}

/** In Komponenten: rendert neu, wenn die Sprache wechselt. */
export function useT(): (key: MessageKey, params?: Params) => string {
  const { lang } = useStore(settingsStore);
  return (key, params) => translate(lang, key, params);
}
