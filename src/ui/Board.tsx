import type { VNode } from 'preact';
import { memo } from 'preact/compat';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { draftedByTeam, isUserTeam, needsFrom, type DraftSession } from '../draft/engine';
import { gradeDraft, type Grade } from '../draft/grades';
import { GradeBadge } from './GradeBadge';
import { useT } from '../i18n';
import { TeamLogo } from './TeamLogo';

type View = 'full' | 'mine';

interface RowProps {
  pick: number;
  team: string;
  from?: string;
  state: 'done' | 'clock' | 'upcoming' | 'empty';
  name?: string;
  sub?: string;
  needs: string;
  mine: boolean;
  isNew: boolean;
  grade?: Grade;
}

/** Eine Zeile des Boards. Nur Werte als Eigenschaften, damit eine unveränderte Zeile nicht neu gezeichnet wird. */
const PickRow = memo(function PickRow(p: RowProps) {
  const t = useT();
  const classes = ['pick-row', p.mine ? 'mine' : '', p.state === 'clock' ? 'current' : '', p.isNew ? 'pick-new' : ''].filter(Boolean).join(' ');
  return (
    <li class={classes} data-testid="pick-row" data-pick={p.pick} data-current={p.state === 'clock' ? 'true' : undefined} data-done={p.state === 'done' ? 'true' : undefined}>
      <span class="pn">{p.pick}</span>
      <TeamLogo abbr={p.team} size={36} />
      <span class="pt">
        <strong>{p.team}</strong>
        {p.from && (
          <span class="traded" title={t('draft.tradedFrom', { team: p.from })}>
            {' '}
            ↔ {p.from}
          </span>
        )}
      </span>
      <span class="ps">
        {p.state === 'done' ? (
          <>
            <strong class="ps-name" data-testid="picked-name">
              {p.name}
            </strong>
            <span class="small muted">{p.sub}</span>
          </>
        ) : p.state === 'clock' ? (
          <strong class="clock">{t('draft.status.clock')}</strong>
        ) : p.state === 'empty' ? (
          <span class="small muted">{t('draft.status.empty')}</span>
        ) : (
          <>
            <span class="small muted">{t('draft.status.upcoming')}</span>
            {p.needs && (
              <span class="small muted">
                {t('draft.needs')}: {p.needs}
              </span>
            )}
          </>
        )}
      </span>
      {p.grade && <GradeBadge grade={p.grade} size="sm" testid="pick-grade" />}
    </li>
  );
});

export function Board({ session, lastIndex, active }: { session: DraftSession; lastIndex: number; active: boolean }) {
  const t = useT();
  const [view, setView] = useState<View>('full');
  const box = useRef<HTMLDivElement>(null);
  const current = session.status === 'running' ? session.results.length : -1;
  const wasActive = useRef(false);

  const byId = useMemo(() => new Map(session.pool.map((p) => [p.id, p])), [session.pool]);
  const byTeam = draftedByTeam(session);
  const grades = useMemo(() => gradeDraft(session), [session.results, session.pool, session.order, session.needs]);

  // Zum aktuellen Pick scrollen – nur innerhalb des Boards, nie die ganze Seite.
  // Wird das Board erst sichtbar (Handy: Wechsel von "Pick" zu "Board"), springt es ohne Animation dorthin.
  useEffect(() => {
    const justShown = active && !wasActive.current;
    wasActive.current = active;
    if (!active) return;
    const c = box.current;
    if (!c) return;
    if (view === 'mine') {
      c.scrollTo({ top: 0 });
      return;
    }
    const el = c.querySelector<HTMLElement>('[data-current="true"]');
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    c.scrollTo({ top: Math.max(0, el.offsetTop - c.clientHeight / 3), behavior: reduced || justShown ? 'auto' : 'smooth' });
  }, [current, view, active]);

  const roundHasMine = new Set(session.order.filter((o) => isUserTeam(session, o.team)).map((o) => o.round));
  let lastRound = 0;
  const items: VNode[] = [];
  session.order.forEach((slot, index) => {
    const mine = isUserTeam(session, slot.team);
    if (slot.round !== lastRound) {
      lastRound = slot.round;
      items.push(
        <li key={`r${slot.round}`} class={roundHasMine.has(slot.round) ? 'round-head has-mine' : 'round-head'} data-testid="round-head">
          {t('draft.round', { round: slot.round })}
        </li>,
      );
    }
    const res = session.results[index];
    const player = res ? byId.get(res.playerId) : undefined;
    const isCurrent = index === current;
    let state: RowProps['state'] = 'upcoming';
    if (player) state = 'done';
    else if (isCurrent) state = 'clock';
    else if (session.status === 'finished') state = 'empty';
    const needs =
      state === 'upcoming'
        ? needsFrom(session.needs[slot.team] ?? [], byTeam.get(slot.team) ?? [])
            .filter((n) => n.filled === 0)
            .slice(0, 3)
            .map((n) => n.pos)
            .join(', ')
        : '';
    items.push(
      <PickRow
        key={slot.pick}
        pick={slot.pick}
        team={slot.team}
        from={slot.from}
        state={state}
        name={player?.name}
        sub={player ? `${player.pos} · ${player.college || '–'}${res?.auto ? ` · ${t('draft.status.auto')}` : ''}` : undefined}
        needs={needs}
        mine={mine}
        isNew={index === lastIndex}
        grade={player ? grades.picks[index]?.grade : undefined}
      />,
    );
  });

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
      <div class={view === 'mine' ? 'board-scroll view-mine' : 'board-scroll'} ref={box} data-testid="board-scroll">
        {roundHasMine.size === 0 && view === 'mine' && <p class="notice">{t('draft.mine.empty')}</p>}
        <ol class="pick-list">{items}</ol>
      </div>
    </section>
  );
}
