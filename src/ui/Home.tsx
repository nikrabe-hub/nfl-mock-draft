import { TEAMS } from '../data/teams';
import { useT } from '../i18n';
import { pwaState } from '../pwa';
import { storageInfo } from '../storage/db';
import { useStore } from '../store';
import { TeamLogo } from './TeamLogo';

const SORTED = [...TEAMS].sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));

export function Home() {
  const t = useT();
  const pwa = useStore(pwaState);
  const storage = useStore(storageInfo);

  return (
    <section aria-labelledby="home-title">
      <h1 id="home-title" class="title">
        {t('app.title')}
      </h1>
      <p class="lead">{t('home.subtitle')}</p>

      <div class="chips" data-testid="status-chips">
        <span class={`chip ${pwa.offlineReady ? 'chip-ok' : ''}`} data-testid="offline-status">
          {pwa.offlineReady ? t('status.offlineReady') : t('status.offlinePending')}
        </span>
        <span class={`chip ${storage.backend === 'memory' ? 'chip-warn' : ''}`} data-testid="storage-status">
          {t('status.storage')}: {t(`status.storage.${storage.backend}`)}
        </span>
      </div>

      <div class="card">
        <h2>{t('home.wip.title')}</h2>
        <p>{t('home.wip.body')}</p>
      </div>

      <h2 class="section-title">{t('home.teams')}</h2>
      <p class="muted small">{t('home.teams.hint')}</p>
      <ul class="team-grid" data-testid="team-grid">
        {SORTED.map((team) => (
          <li key={team.abbr} class="team-tile" data-testid="team-tile">
            <TeamLogo abbr={team.abbr} size={40} />
            <span class="team-text">
              <span class="team-name">{team.name}</span>
              <span class="team-city">{team.city}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
