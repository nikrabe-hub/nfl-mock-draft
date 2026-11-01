import { useMemo, useState } from 'preact/hooks';
import { tradeNow } from '../draft/controller';
import type { DraftSession } from '../draft/engine';
import { updatePrefs, prefsStore } from '../draft/prefs';
import { chartStore } from '../draft/tradeChart';
import { assetKey, assetValue, evaluateTrade, MAX_ASSETS_PER_SIDE, ownedAssets } from '../draft/trades';
import { acceptTradeOffer, declineTradeOffer } from '../draft/controller';
import type { Asset } from '../draft/tradeTypes';
import { isUserTeam } from '../draft/engine';
import { TEAMS, teamLabel } from '../data/teams';
import { useT } from '../i18n';
import { useStore } from '../store';
import { assetLabel } from './assets';
import { TeamLogo } from './TeamLogo';

function roundOf(s: DraftSession, a: Asset): number | undefined {
  return a.kind === 'pick' ? s.order.find((o) => o.pick === a.pick)?.round : a.round;
}

function AssetList({
  session,
  assets,
  chosen,
  onToggle,
  side,
}: {
  session: DraftSession;
  assets: Asset[];
  chosen: Set<string>;
  onToggle: (key: string) => void;
  side: 'give' | 'get';
}) {
  const t = useT();
  const chart = useStore(chartStore).chart;
  if (assets.length === 0) return <p class="muted small">{t('trade.noAssets')}</p>;
  return (
    <ul class="asset-list">
      {assets.map((a) => {
        const key = assetKey(a);
        const on = chosen.has(key);
        const disabled = !on && chosen.size >= MAX_ASSETS_PER_SIDE;
        return (
          <li key={key}>
            <label class={on ? 'asset on' : 'asset'}>
              <input type="checkbox" checked={on} disabled={disabled} data-testid={`trade-${side}-${key}`} onChange={() => onToggle(key)} />
              <span class="asset-name">
                {assetLabel(a, t, roundOf(session, a))}
                {a.kind === 'future' && a.origin ? <span class="small muted"> · {a.origin}</span> : null}
              </span>
              <span class="asset-val">{Math.round(assetValue(a, chart))}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/** Angebot eines Computer-Teams (über den Tabs, solange der Pick offen ist). */
export function OfferCard({ session }: { session: DraftSession }) {
  const t = useT();
  const chart = useStore(chartStore).chart;
  const o = session.offer;
  if (!o || o.at !== session.results.length) return null;
  const cpu = o.cpuGives.map((a) => assetLabel(a, t, roundOf(session, a))).join(' + ');
  const mine = o.userGives.map((a) => assetLabel(a, t, roundOf(session, a))).join(' + ');
  return (
    <div class="offer-card" role="region" aria-label={t('trade.offer.title')} data-testid="trade-offer">
      <div class="offer-head">
        <TeamLogo abbr={o.from} size={40} />
        <strong>{t('trade.offer.title')}</strong>
      </div>
      <p>
        {t('trade.offer.text', { team: teamLabel(o.from), give: cpu, get: mine })}
      </p>
      <p class="small muted">
        {t('trade.offer.values', { cpu: Math.round(o.cpuValue), mine: Math.round(o.userValue) })}
        {chart.approximate ? ` · ${t('trade.chart.approx')}` : ''}
      </p>
      <div class="row">
        <button type="button" class="btn" data-testid="offer-accept" onClick={() => acceptTradeOffer()}>
          {t('trade.offer.accept')}
        </button>
        <button type="button" class="btn btn-secondary" data-testid="offer-decline" onClick={() => declineTradeOffer()}>
          {t('trade.offer.decline')}
        </button>
      </div>
    </div>
  );
}

export function TradePanel({ session, team }: { session: DraftSession; team: string }) {
  const t = useT();
  const prefs = useStore(prefsStore);
  const chart = useStore(chartStore).chart;
  const [partner, setPartner] = useState('');
  const [give, setGive] = useState<Set<string>>(new Set());
  const [get, setGet] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const partners = useMemo(
    () => TEAMS.filter((x) => !isUserTeam(session, x.abbr)).sort((a, b) => a.city.localeCompare(b.city)),
    [session.config.userTeams],
  );
  const mine = useMemo(() => ownedAssets(session, team), [session, team]);
  const theirs = useMemo(() => (partner ? ownedAssets(session, partner) : []), [session, partner]);
  const giveAssets = mine.filter((a) => give.has(assetKey(a)));
  const getAssets = theirs.filter((a) => get.has(assetKey(a)));
  const check = evaluateTrade(giveAssets, getAssets, chart);
  const ready = giveAssets.length > 0 && getAssets.length > 0;

  const flip = (set: Set<string>, setSet: (s: Set<string>) => void) => (key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSet(next);
    setConfirm(false);
    setDone(null);
  };

  function execute() {
    const r = tradeNow(team, partner, giveAssets, getAssets);
    setConfirm(false);
    setGive(new Set());
    setGet(new Set());
    setDone(r.ok ? t('trade.done', { team: teamLabel(partner) }) : t('trade.failed'));
  }

  const ratio = check.cpuGives > 0 ? Math.min(2, check.cpuGets / check.cpuGives) : 0;

  return (
    <div data-testid="trade-panel">
      {done && (
        <p class="notice" role="status" data-testid="trade-done">
          {done}
        </p>
      )}
      <label class="field">
        <span class="label">{t('trade.partner')}</span>
        <select
          class="select"
          data-testid="trade-partner"
          value={partner}
          onChange={(e) => {
            setPartner((e.currentTarget as HTMLSelectElement).value);
            setGet(new Set());
            setConfirm(false);
            setDone(null);
          }}
        >
          <option value="">{t('trade.partner.choose')}</option>
          {partners.map((x) => (
            <option key={x.abbr} value={x.abbr}>
              {x.city} {x.name}
            </option>
          ))}
        </select>
      </label>

      {partner && (
        <>
          <div class="trade-cols">
            <div>
              <h4 class="sub">{t('trade.give', { team })}</h4>
              <AssetList session={session} assets={mine} chosen={give} onToggle={flip(give, setGive)} side="give" />
            </div>
            <div>
              <h4 class="sub">{t('trade.get', { team: partner })}</h4>
              <AssetList session={session} assets={theirs} chosen={get} onToggle={flip(get, setGet)} side="get" />
            </div>
          </div>

          <div class={ready ? (check.accept ? 'trade-live ok' : 'trade-live no') : 'trade-live'} data-testid="trade-live" aria-live="polite">
            <div class="trade-values">
              <span>
                {t('trade.value.give')}: <strong data-testid="trade-value-give">{Math.round(check.cpuGets)}</strong>
              </span>
              <span>
                {t('trade.value.get')}: <strong data-testid="trade-value-get">{Math.round(check.cpuGives)}</strong>
              </span>
            </div>
            <div class="trade-bar" aria-hidden="true">
              <div class="trade-bar-fill" style={{ width: `${Math.round((ratio / 2) * 100)}%` }} />
              <div class="trade-bar-mid" />
            </div>
            <p class="trade-verdict" data-testid="trade-verdict">
              {!ready
                ? t('trade.verdict.pick')
                : check.accept
                  ? t('trade.verdict.yes', { team: teamLabel(partner) })
                  : t('trade.verdict.no', { team: teamLabel(partner), n: Math.max(1, Math.ceil(check.shortfall)) })}
            </p>
          </div>

          {confirm ? (
            <div class="notice" role="alertdialog" aria-label={t('trade.confirm')}>
              <p>{t('trade.confirm')}</p>
              <div class="row">
                <button type="button" class="btn" data-testid="trade-confirm" onClick={execute}>
                  {t('trade.confirm.yes')}
                </button>
                <button type="button" class="btn btn-secondary" onClick={() => setConfirm(false)}>
                  {t('players.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" class="btn" data-testid="trade-execute" disabled={!ready || !check.accept} onClick={() => setConfirm(true)}>
              {t('trade.execute')}
            </button>
          )}
        </>
      )}

      <p class="small muted hint" data-testid="trade-chart-note">
        {chart.approximate ? t('trade.chart.approx.long') : t('trade.chart.custom', { name: chart.name })}
      </p>
      <label class="check">
        <input type="checkbox" checked={prefs.tradeOffers} data-testid="offers-toggle" onChange={() => void updatePrefs({ tradeOffers: !prefs.tradeOffers })} />
        <span>{t('trade.offers.toggle')}</span>
      </label>
    </div>
  );
}
