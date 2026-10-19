import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { isUserTeam, needStatus, type DraftSession } from '../draft/engine';
import { useT } from '../i18n';
import { TeamLogo } from './TeamLogo';

type View = 'full' | 'mine';

export function Board({ session, lastIndex }: { session: DraftSession; lastIndex: number }) {
  const t = useT();
  const [view, setView] = useState<View>('full');
  const box = useRef<HTMLDivElement>(null);
  const current = session.status === 'running' ? session.results.length : -1;

  const byId = useMemo(() => new Map(session.pool.map((p) => [p.id, p])), [session.pool]);
  const rows = session.order.map((slot, index) => ({ slot, index })).filter((r) => view === 'full' || isUserTeam(session, r.slot.team));

  // Zum aktuellen Pick scrollen – nur innerhalb des Boards, nie die ganze Seite.
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[data-current="true"]');
    const c = box.current;
    if (!el || !c) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    c.scrollTo({ top: Math.max(0, el.offsetTop - c.clientHeight / 3), behavior: reduced ? 'auto' : 'smooth' });
  }, [current, view]);

  let lastRound = 0;
  const items = [];
  for (const { slot, index } of rows) {
    if (slot.round !== lastRound) {
      lastRound = slot.round;
      items.push(
        <li key={`r${slot.round}`} class="round-head" data-testid="round-head">
          {t('draft.round', { round: slot.round })}
        </li>,
      );
    }
    const res = session.results[index];
    const player = res ? byId.get(res.playerId) : undefined;
    const isCurrent = index === current;
    const mine = isUserTeam(session, slot.team);
    const needs = !res && !isCurrent ? needStatus(session, slot.team).slice(0, 3) : [];
    const classes = ['pick-row', mine ? 'mine' : '', isCurrent ? 'current' : '', index === lastIndex ? 'pick-new' : ''].filter(Boolean).join(' ');
    items.push(
      <li key={slot.pick} class={classes} data-testid="pick-row" data-pick={slot.pick} data-current={isCurrent ? 'true' : undefined} data-done={res ? 'true' : undefined}>
        <span class="pn">{slot.pick}</span>
        <TeamLogo abbr={slot.team} size={32} />
        <span class="pt">
          <strong>{slot.team}</strong>
          {slot.from && <span class="traded" title={t('draft.tradedFrom', { team: slot.from })}> ↔ {slot.from}</span>}
        </span>
        <span class="ps">
          {player ? (
            <>
              <strong class="ps-name" data-testid="picked-name">{player.name}</strong>
              <span class="small muted">
                {player.pos} · {player.college || '–'}
                {res?.auto ? ` · ${t('draft.status.auto')}` : ''}
              </span>
            </>
          ) : isCurrent ? (
            <strong class="clock">{t('draft.status.clock')}</strong>
          ) : session.status === 'finished' ? (
            <span class="small muted">{t('draft.status.empty')}</span>
          ) : (
            <>
              <span class="small muted">{t('draft.status.upcoming')}</span>
              {needs.length > 0 && (
                <span class="small muted">
                  {t('draft.needs')}: {needs.map((n) => n.pos).join(', ')}
                </span>
              )}
            </>
          )}
        </span>
      </li>,
    );
  }

  return (
    <section class="board" aria-label="Draft Board">
      <div class="segmented" role="group" aria-label={t('draft.tabs')}>
        <button type="button" class={view === 'full' ? 'seg active' : 'seg'} aria-pressed={view === 'full'} data-testid="board-tab-full" onClick={() => setView('full')}>
          {t('draft.tab.full')}
        </button>
        <button type="button" class={view === 'mine' ? 'seg active' : 'seg'} aria-pressed={view === 'mine'} data-testid="board-tab-mine" onClick={() => setView('mine')}>
          {t('draft.tab.mine')}
        </button>
      </div>
      <div class="board-scroll" ref={box} data-testid="board-scroll">
        {items.length === 0 ? <p class="notice">{t('draft.mine.empty')}</p> : <ol class="pick-list">{items}</ol>}
      </div>
    </section>
  );
}
