import { useMemo, useState } from 'preact/hooks';
import { dataStore } from '../data/loader';
import { TEAMS } from '../data/teams';
import { startDraft, type StartError } from '../draft/controller';
import { prefsStore, updatePrefs } from '../draft/prefs';
import { useT } from '../i18n';
import { useStore } from '../store';
import { RandomnessControl, RoundsControl, TempoControl } from './DraftOptions';
import { TeamLogo } from './TeamLogo';

export function Setup({ onStarted }: { onStarted: () => void }) {
  const t = useT();
  const data = useStore(dataStore);
  const prefs = useStore(prefsStore);
  const [error, setError] = useState<StartError | null>(null);
  const [starting, setStarting] = useState(false);

  const firstPick = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of data.picks) if (!m.has(p.team) || p.pick < m.get(p.team)!) m.set(p.team, p.pick);
    return m;
  }, [data.picks]);

  const sorted = useMemo(
    () => [...TEAMS].sort((a, b) => (firstPick.get(a.abbr) ?? 9999) - (firstPick.get(b.abbr) ?? 9999) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name)),
    [firstPick],
  );

  const selected = new Set(prefs.userTeams);
  const allSelected = selected.size === TEAMS.length;
  const toggle = (abbr: string) =>
    void updatePrefs({ userTeams: selected.has(abbr) ? prefs.userTeams.filter((x) => x !== abbr) : [...prefs.userTeams, abbr] });

  const players = data.players.filter((p) => !p.notListed).length;
  const picks = data.picks.filter((p) => p.round <= prefs.rounds).length;
  const short = data.loaded && players > 0 && picks > players;

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const r = await startDraft();
      if (r.ok) onStarted();
      else setError(r.error);
    } finally {
      setStarting(false);
    }
  }

  return (
    <section aria-labelledby="setup-title">
      <h2 id="setup-title" class="section-title">
        {t('setup.title')}
      </h2>
      <p class="muted small">{t('setup.teams.hint')}</p>

      <div class="row team-toolbar">
        <button
          type="button"
          class={allSelected ? 'seg-toggle active' : 'seg-toggle'}
          aria-pressed={allSelected}
          data-testid="team-all"
          onClick={() => void updatePrefs({ userTeams: allSelected ? [] : TEAMS.map((x) => x.abbr) })}
        >
          {t('setup.all')}
        </button>
        <span class="muted small" data-testid="team-count" aria-live="polite">
          {t('setup.selected', { count: selected.size })}
        </span>
      </div>

      <ul class="team-grid" data-testid="team-grid">
        {sorted.map((team) => {
          const fp = firstPick.get(team.abbr);
          const on = selected.has(team.abbr);
          return (
            <li key={team.abbr}>
              <button type="button" class={on ? 'team-tile selected' : 'team-tile'} aria-pressed={on} data-testid="team-tile" data-team={team.abbr} onClick={() => toggle(team.abbr)}>
                <TeamLogo abbr={team.abbr} size={40} />
                <span class="team-text">
                  <span class="team-name">{team.name}</span>
                  <span class="team-city">{fp ? t('setup.firstPick', { pick: fp }) : t('setup.noPick')}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div class="card">
        <div class="field">
          <span class="label">{t('setup.rounds')}</span>
          <RoundsControl />
        </div>
        <div class="field">
          <span class="label">{t('setup.tempo')}</span>
          <TempoControl />
          <p class="muted small hint">{t('tempo.hint')}</p>
        </div>
        <div class="field">
          <span class="label">{t('setup.random')}</span>
          <RandomnessControl />
          <p class="muted small hint">{t('random.hint')}</p>
        </div>

        {data.loaded && players > 0 && (
          <p class="muted small hint" data-testid="setup-pool">
            {t('setup.pool', { players, picks })}
          </p>
        )}
        {short && (
          <p class="notice" role="note" data-testid="setup-pool-short">
            {t('setup.pool.short', { players, picks, missing: picks - players })}
          </p>
        )}

        <div class="row">
          <button type="button" class="btn btn-big" data-testid="start-draft" disabled={starting || selected.size === 0 || !data.loaded} onClick={() => void start()}>
            {t('setup.start')}
          </button>
        </div>
        {selected.size === 0 && <p class="muted small hint">{t('setup.needTeam')}</p>}
        {error && (
          <p class="msg msg-error" role="alert" data-testid="setup-error">
            {t('setup.error', { reason: t(`setup.error.${error}`) })}
          </p>
        )}
      </div>
    </section>
  );
}
