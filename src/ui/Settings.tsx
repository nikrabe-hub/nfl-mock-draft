import { useEffect, useRef, useState } from 'preact/hooks';
import { useT, type MessageKey, type Params } from '../i18n';
import { installState, isIos, isStandalone, promptInstall } from '../pwa';
import { applyBackup, backupFileName, createBackup, validateBackup, type Backup } from '../storage/backup';
import { getStorage, readPersistence, storageInfo } from '../storage/db';
import { LANGS, loadSettings, settingsStore, THEMES, updateSettings } from '../storage/settings';
import { useStore } from '../store';

interface Msg {
  kind: 'ok' | 'error';
  key: MessageKey;
  params?: Params;
}

export function Settings() {
  const t = useT();
  const settings = useStore(settingsStore);
  const info = useStore(storageInfo);
  const install = useStore(installState);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void readPersistence();
  }, []);

  async function exportBackup() {
    try {
      const backup = await createBackup(await getStorage());
      const name = backupFileName();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMsg({ kind: 'ok', key: 'settings.backup.exported', params: { name } });
    } catch {
      setMsg({ kind: 'error', key: 'backup.error.read' });
    }
  }

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    setPending(null);
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setMsg({ kind: 'error', key: 'backup.error.read' });
      return;
    }
    const result = validateBackup(text);
    if (!result.ok) {
      setMsg({ kind: 'error', key: `backup.error.${result.code}`, params: { detail: result.detail ?? '' } });
      return;
    }
    setMsg(null);
    setPending(result.backup);
  }

  async function restore() {
    if (!pending) return;
    try {
      const { written } = await applyBackup(await getStorage(), pending);
      await loadSettings();
      setMsg({ kind: 'ok', key: 'settings.backup.restored', params: { count: written } });
    } catch {
      setMsg({ kind: 'error', key: 'settings.backup.failed' });
    }
    setPending(null);
  }

  const persistent =
    info.persistent === null ? 'unknown' : info.persistent ? 'yes' : 'no';

  return (
    <section aria-labelledby="settings-title">
      <h1 id="settings-title" class="title">
        {t('settings.title')}
      </h1>

      <div class="card">
        <h2>{t('settings.appearance')}</h2>
        <div class="field">
          <span class="label" id="lbl-theme">
            {t('settings.theme')}
          </span>
          <div class="segmented" role="radiogroup" aria-labelledby="lbl-theme">
            {THEMES.map((th) => (
              <button
                key={th}
                type="button"
                role="radio"
                aria-checked={settings.theme === th}
                data-testid={`theme-${th}`}
                class={settings.theme === th ? 'seg active' : 'seg'}
                onClick={() => void updateSettings({ theme: th })}
              >
                {t(`settings.theme.${th}`)}
              </button>
            ))}
          </div>
        </div>
        <div class="field">
          <span class="label" id="lbl-lang">
            {t('settings.language')}
          </span>
          <div class="segmented" role="radiogroup" aria-labelledby="lbl-lang">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={settings.lang === l}
                data-testid={`lang-${l}`}
                class={settings.lang === l ? 'seg active' : 'seg'}
                onClick={() => void updateSettings({ lang: l })}
              >
                {l === 'de' ? 'Deutsch' : 'English'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div class="card">
        <h2>{t('settings.data.title')}</h2>
        <p data-testid="data-status">{t('settings.data.none')}</p>
      </div>

      <div class="card">
        <h2>{t('settings.storage.title')}</h2>
        <p>
          {t('status.storage')}: <strong>{t(`status.storage.${info.backend}`)}</strong>
        </p>
        <p>
          {t('settings.storage.persistent')}: {t(`settings.storage.persistent.${persistent}`)}
        </p>
      </div>

      <div class="card">
        <h2>{t('settings.backup.title')}</h2>
        <p class="muted">{t('settings.backup.hint')}</p>
        <div class="row">
          <button type="button" class="btn" data-testid="backup-export" onClick={() => void exportBackup()}>
            {t('settings.backup.export')}
          </button>
          <button type="button" class="btn btn-secondary" data-testid="backup-import" onClick={() => fileInput.current?.click()}>
            {t('settings.backup.import')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="backup-file"
            onChange={(e) => void onFile(e)}
          />
        </div>

        {pending && (
          <div class="notice" data-testid="backup-preview">
            <p>
              {t('settings.backup.preview', {
                date: pending.createdAt ? new Date(pending.createdAt).toLocaleString(settings.lang) : t('settings.backup.preview.nodate'),
                count: Object.keys(pending.data).length,
              })}
            </p>
            <div class="row">
              <button type="button" class="btn" data-testid="backup-restore" onClick={() => void restore()}>
                {t('settings.backup.restore')}
              </button>
              <button type="button" class="btn btn-secondary" onClick={() => setPending(null)}>
                {t('settings.backup.cancel')}
              </button>
            </div>
          </div>
        )}

        {msg && (
          <p class={msg.kind === 'ok' ? 'msg msg-ok' : 'msg msg-error'} role={msg.kind === 'error' ? 'alert' : 'status'} data-testid="backup-message">
            {t(msg.key, msg.params)}
          </p>
        )}
      </div>

      <div class="card">
        <h2>{t('settings.install.title')}</h2>
        {isStandalone() ? (
          <p>{t('settings.install.installed')}</p>
        ) : (
          <>
            {install.canPrompt && (
              <button type="button" class="btn" data-testid="install-button" onClick={() => void promptInstall()}>
                {t('settings.install.button')}
              </button>
            )}
            <p class="muted">{isIos() ? t('settings.install.ios') : t('settings.install.android')}</p>
          </>
        )}
      </div>

      <div class="card">
        <h2>{t('settings.about.title')}</h2>
        <p>
          {t('settings.about.version')}: {__APP_VERSION__}
        </p>
        <p>
          {t('settings.about.sources')}: <span class="muted">{t('settings.about.sources.none')}</span>
        </p>
      </div>
    </section>
  );
}
