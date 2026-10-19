import { useState } from 'preact/hooks';
import { dataStore } from '../data/loader';
import { discardDraft, draftStore } from '../draft/controller';
import { getTeam } from '../data/teams';
import { useT } from '../i18n';
import { pwaState } from '../pwa';
import { storageInfo } from '../storage/db';
import { useStore } from '../store';
import { Setup } from './Setup';

export function Home({ onOpenDraft }: { onOpenDraft: () => void }) {
  const t = useT();
  const pwa = useStore(pwaState);
  const storage = useStore(storageInfo);
  const data = useStore(dataStore);
  const draft = useStore(draftStore);
  const [confirm, setConfirm] = useState(false);
  const s = draft.session;

  const teams = s ? s.config.userTeams.map((a) => getTeam(a)?.name ?? a).join(', ') : '';

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
        <span class="chip" data-testid="home-data">
          {t('home.data', { players: data.players.filter((p) => !p.notListed).length, picks: data.picks.length })}
        </span>
      </div>

      {draft.invalidSaved && (
        <p class="msg msg-error" role="alert" data-testid="draft-invalid">
          {t('resume.invalid')}
        </p>
      )}

      {s ? (
        <div class="card" data-testid="resume-card">
          <h2>{t('resume.title')}</h2>
          <p data-testid="resume-info">
            {t(s.status === 'finished' ? 'resume.finished' : 'resume.running', { teams, done: s.results.length, total: s.order.length })}
          </p>
          <div class="row">
            <button type="button" class="btn" data-testid="resume-open" onClick={onOpenDraft}>
              {t('resume.open')}
            </button>
            {!confirm && (
              <button type="button" class="btn btn-secondary" data-testid="resume-new" onClick={() => setConfirm(true)}>
                {t('resume.new')}
              </button>
            )}
          </div>
          {confirm && (
            <div class="notice" role="alertdialog" aria-label={t('resume.confirm')}>
              <p>{t('resume.confirm')}</p>
              <div class="row">
                <button
                  type="button"
                  class="btn"
                  data-testid="resume-discard"
                  onClick={() => {
                    discardDraft();
                    setConfirm(false);
                  }}
                >
                  {t('resume.confirm.yes')}
                </button>
                <button type="button" class="btn btn-secondary" onClick={() => setConfirm(false)}>
                  {t('resume.confirm.no')}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <Setup onStarted={onOpenDraft} />
      )}
    </section>
  );
}
