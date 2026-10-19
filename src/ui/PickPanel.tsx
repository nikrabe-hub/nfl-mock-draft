import { useState } from 'preact/hooks';
import { autoPickNow, discardDraft, draftStore, userPick } from '../draft/controller';
import { availablePlayers, currentSlot, isUserTeam, needStatus, remainingPicks, teamDrafted, type DraftSession } from '../draft/engine';
import { getTeam, teamLabel } from '../data/teams';
import { useT } from '../i18n';
import { useStore } from '../store';
import { PlayerList } from './PlayerList';
import { TeamLogo } from './TeamLogo';

type Tab = 'draft' | 'trade' | 'analysis';

function NeedChips({ session, team }: { session: DraftSession; team: string }) {
  const t = useT();
  const needs = needStatus(session, team);
  return (
    <div class="need-chips" data-testid="need-chips">
      <span class="small muted">{t('draft.needs')}:</span>
      {needs.map((n) => (
        <span key={n.pos} class={n.filled > 0 ? 'chip need done' : 'chip need'} title={n.filled > 0 ? t('panel.analysis.filled', { count: n.filled }) : t('panel.analysis.open')}>
          {n.pos}
        </span>
      ))}
    </div>
  );
}

function Analysis({ session, team }: { session: DraftSession; team: string }) {
  const t = useT();
  const drafted = teamDrafted(session, team);
  return (
    <div data-testid="analysis">
      <h3 class="sub">{t('panel.analysis.needs')}</h3>
      <ul class="plain-list">
        {needStatus(session, team).map((n) => (
          <li key={n.pos}>
            {n.pos}: {n.filled > 0 ? t('panel.analysis.filled', { count: n.filled }) : t('panel.analysis.open')}
          </li>
        ))}
      </ul>
      <p class="muted small hint">{t('draft.needs.estimated')}</p>
      <h3 class="sub">{t('panel.analysis.picks')}</h3>
      {drafted.length === 0 ? (
        <p class="muted small">{t('panel.analysis.none')}</p>
      ) : (
        <ul class="plain-list">
          {drafted.map((p) => (
            <li key={p.id}>
              {p.name} ({p.pos}, {p.college || '–'})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Finished({ session, onNew }: { session: DraftSession; onNew: () => void }) {
  const t = useT();
  const mine = session.config.userTeams;
  return (
    <div class="card panel" data-testid="finished-panel">
      <h2>{t('finished.title')}</h2>
      <p>{session.endReason === 'pool_empty' ? t('finished.poolEmpty', { count: session.results.length }) : t('finished.complete', { count: session.results.length })}</p>
      <h3 class="sub">{t('finished.mine')}</h3>
      {mine.every((team) => teamDrafted(session, team).length === 0) ? (
        <p class="muted small">{t('finished.none')}</p>
      ) : (
        mine.map((team) => {
          const picks = teamDrafted(session, team);
          if (picks.length === 0) return null;
          return (
            <div key={team} class="mine-block">
              <strong>{teamLabel(team)}</strong>
              <ul class="plain-list">
                {picks.map((p) => (
                  <li key={p.id}>
                    {p.name} ({p.pos}, {p.college || '–'})
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
      <div class="row">
        <button type="button" class="btn" data-testid="finished-new" onClick={onNew}>
          {t('finished.new')}
        </button>
      </div>
    </div>
  );
}

export function PickPanel({ session, onLeave }: { session: DraftSession; onLeave: () => void }) {
  const t = useT();
  const ui = useStore(draftStore);
  const [tab, setTab] = useState<Tab>('draft');
  const slot = currentSlot(session);

  if (session.status === 'finished' || !slot) {
    return (
      <Finished
        session={session}
        onNew={() => {
          discardDraft();
          onLeave();
        }}
      />
    );
  }

  const team = getTeam(slot.team);
  const mine = isUserTeam(session, slot.team);

  if (!mine) {
    return (
      <div class="card panel waiting" data-testid="waiting-panel" aria-live="polite">
        <div class="clock-head">
          <TeamLogo abbr={slot.team} size={48} />
          <div>
            <strong>{t('panel.waiting', { team: team ? team.name : slot.team, pick: slot.pick })}</strong>
            <div class="small muted">{t('draft.pickLabel', { round: slot.round, pick: slot.pick })}</div>
          </div>
        </div>
        <NeedChips session={session} team={slot.team} />
        {!ui.cpuRunning && <p class="muted small">…</p>}
      </div>
    );
  }

  return (
    <div class="card panel" data-testid="clock-panel">
      <div class="clock-banner">{t('panel.clock')}</div>
      <div class="clock-head">
        <TeamLogo abbr={slot.team} size={52} />
        <div>
          <strong class="clock-team">{team ? `${team.city} ${team.name}` : slot.team}</strong>
          <div class="small muted" data-testid="clock-pick">
            {t('draft.pickLabel', { round: slot.round, pick: slot.pick })}
            {slot.from ? ` · ↔ ${slot.from}` : ''}
          </div>
          <div class="small muted">{t('panel.remaining', { count: remainingPicks(session, slot.team) })}</div>
        </div>
      </div>
      <NeedChips session={session} team={slot.team} />

      <div class="segmented tabs" role="group" aria-label={t('panel.tabs')}>
        {(['draft', 'trade', 'analysis'] as const).map((x) => (
          <button key={x} type="button" class={tab === x ? 'seg active' : 'seg'} aria-pressed={tab === x} data-testid={`panel-tab-${x}`} onClick={() => setTab(x)}>
            {t(`panel.tab.${x}`)}
          </button>
        ))}
      </div>

      {tab === 'draft' && (
        <>
          <div class="row">
            <button type="button" class="btn btn-secondary" data-testid="auto-pick" onClick={() => autoPickNow()}>
              {t('panel.auto')}
            </button>
          </div>
          <PlayerList players={availablePlayers(session)} canDraft onDraft={(id) => userPick(id)} />
        </>
      )}
      {tab === 'trade' && <p class="notice">{t('panel.trade.soon')}</p>}
      {tab === 'analysis' && <Analysis session={session} team={slot.team} />}
    </div>
  );
}
