// Gemeinsame Ergebnis-Bausteine für das Abschluss-Fenster und den Verlauf.

import { teamLabel } from '../data/teams';
import { gradeIndex, stealsAndReaches } from '../draft/grades';
import type { MockPick, MockRecord } from '../draft/history';
import type { TradeEntry } from '../draft/tradeTypes';
import { assetLabel } from './assets';
import type { Recap } from '../export/recap';
import { useT } from '../i18n';
import { GradeBadge } from './GradeBadge';
import { RecapExport } from './RecapExport';
import { TeamLogo } from './TeamLogo';

export function ResultBlock({ recap }: { recap: Recap }) {
  const t = useT();
  const team = recap.team;
  return (
    <div class="mine-block" data-testid={`result-${team}`}>
      <div class="result-head">
        <TeamLogo abbr={team} size={44} />
        <div class="result-title">
          <strong>{teamLabel(team)}</strong>
          <span class="small muted">
            {t('grade.needs60')}: {recap.needScore} · {t('grade.value40')}: {recap.valueScore}
          </span>
        </div>
        <div class="result-grade">
          <GradeBadge grade={recap.grade} size="lg" testid={`grade-team-${team}`} />
          <span class="small muted">{t('grade.team')}</span>
        </div>
      </div>
      <ul class="result-picks">
        {recap.rows.map((r) => (
          <li key={r.pick} data-testid="result-pick">
            <span class="rp-no">{r.pick}</span>
            <span class="rp-main">
              <strong>{r.name}</strong>
              <span class="small muted">
                {r.pos} · {r.college}
                {r.rank != null ? ` · Rank ${r.rank}` : ''}
                {r.needPos ? ` · Need ${r.needPos}` : ''}
              </span>
            </span>
            <GradeBadge grade={r.grade} size="md" testid="result-grade" />
          </li>
        ))}
      </ul>
      <p class="small muted">
        {t('grade.covered')}: {recap.covered.length ? recap.covered.join(', ') : '–'} · {t('grade.open')}: {recap.open.length ? recap.open.join(', ') : '–'}
      </p>
      <RecapExport recap={recap} />
    </div>
  );
}

export function AllTeamsList({ record }: { record: MockRecord }) {
  const t = useT();
  const list = Object.entries(record.teams)
    .map(([team, tg]) => ({ team, ...tg }))
    .sort((a, b) => gradeIndex(a.grade) - gradeIndex(b.grade) || b.score - a.score);
  return (
    <details class="all-grades" data-testid="all-grades">
      <summary>{t('grade.allTeams')}</summary>
      <ol class="plain-list">
        {list.map((tg) => (
          <li key={tg.team} class="all-row" data-testid="all-grade-row">
            <TeamLogo abbr={tg.team} size={28} />
            <span>{teamLabel(tg.team)}</span>
            <GradeBadge grade={tg.grade} size="sm" />
          </li>
        ))}
      </ol>
    </details>
  );
}

function Line({ p, kind }: { p: MockPick; kind: 'steal' | 'reach' }) {
  const t = useT();
  const n = Math.abs(p.delta ?? 0);
  return (
    <li class="sr-row" data-testid={`${kind}-row`}>
      <TeamLogo abbr={p.team} size={28} />
      <span class="sr-main">
        <strong>{p.name}</strong>
        <span class="small muted">
          {p.pos} · {t('draft.pickLabelShort', { pick: p.pick })} · Rank {p.rank ?? '–'}
        </span>
      </span>
      <span class={kind === 'steal' ? 'sr-delta good' : 'sr-delta bad'}>{kind === 'steal' ? `+${n}` : `−${n}`}</span>
    </li>
  );
}

/** Die größten Steals und Reaches des ganzen Drafts. */
export function StealsReaches({ picks }: { picks: readonly MockPick[] }) {
  const t = useT();
  const { steals, reaches } = stealsAndReaches(picks, 5);
  if (steals.length === 0 && reaches.length === 0) return null;
  return (
    <details class="all-grades" data-testid="steals-reaches" open>
      <summary>{t('analysis.sr.title')}</summary>
      <h4 class="sub">{t('analysis.steals')}</h4>
      {steals.length ? (
        <ul class="sr-list">
          {steals.map((p) => (
            <Line key={p.pick} p={p} kind="steal" />
          ))}
        </ul>
      ) : (
        <p class="muted small">–</p>
      )}
      <h4 class="sub">{t('analysis.reaches')}</h4>
      {reaches.length ? (
        <ul class="sr-list">
          {reaches.map((p) => (
            <Line key={p.pick} p={p} kind="reach" />
          ))}
        </ul>
      ) : (
        <p class="muted small">–</p>
      )}
      <p class="muted small">{t('analysis.sr.explain')}</p>
    </details>
  );
}

/** Liste der ausgeführten Trades eines Drafts. */
export function TradeLog({ trades }: { trades: readonly TradeEntry[] }) {
  const t = useT();
  if (trades.length === 0) return null;
  return (
    <details class="all-grades" data-testid="trade-log">
      <summary>
        {t('trade.log.title')} ({trades.length})
      </summary>
      <ul class="sr-list">
        {trades.map((tr, i) => (
          <li key={i} class="sr-row" data-testid="trade-log-row">
            <TeamLogo abbr={tr.a} size={24} />
            <TeamLogo abbr={tr.b} size={24} />
            <span class="sr-main small">
              {t('trade.log.line', {
                a: tr.a,
                aGives: tr.aGives.map((x) => assetLabel(x, t)).join(' + '),
                b: tr.b,
                bGives: tr.bGives.map((x) => assetLabel(x, t)).join(' + '),
              })}
              {tr.offer ? ` (${t('trade.log.offer')})` : ''}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
