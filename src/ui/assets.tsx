import type { MessageKey, Params } from '../i18n';
import type { Asset } from '../draft/tradeTypes';

type T = (key: MessageKey, params?: Params) => string;

/** Kurzer Text für einen Tausch-Gegenstand, z.B. "Pick 18" oder "2028 Runde 2". */
export function assetLabel(a: Asset, t: T, round?: number): string {
  if (a.kind === 'pick') return round ? t('trade.asset.pickRound', { pick: a.pick, round }) : t('trade.asset.pick', { pick: a.pick });
  return t('trade.asset.future', { year: a.year, round: a.round });
}
