import { useRef, useState } from 'preact/hooks';
import { clearOverlay, dataStore, saveOverlay, type SourceStatus } from '../data/loader';
import { parseImportText, planImport, type ImportPlan } from '../data/importer';
import type { Issue } from '../data/validate';
import { useT, type MessageKey, type Params } from '../i18n';
import { settingsStore } from '../storage/settings';
import { useStore } from '../store';

const MAX_LISTED = 8;

/** Datenstand je Quelle: Herkunft, Abrufdatum, Anzahl, ggf. verworfene Dateien. */
export function DataStatus() {
  const t = useT();
  const data = useStore(dataStore);
  const { lang } = useStore(settingsStore);

  if (!data.loaded) return <p data-testid="data-status">{t('data.loading')}</p>;
  const anyData = data.sources.some((s) => s.origin !== 'none');

  return (
    <>
      {!anyData && <p data-testid="data-status">{t('settings.data.none')}</p>}
      <ul class="source-list" data-testid="data-sources">
        {data.sources.map((s) => (
          <SourceRow key={s.id} s={s} lang={lang} />
        ))}
      </ul>
      <p class="muted small">{t('data.hint')}</p>
    </>
  );
}

function SourceRow({ s, lang }: { s: SourceStatus; lang: string }) {
  const t = useT();
  const date = s.info ? new Date(s.info.abgerufenAm).toLocaleString(lang) : null;
  return (
    <li class="source-item" data-testid={`source-${s.id}`}>
      <strong>
        {t(`data.source.${s.id}` as MessageKey)}
        {s.origin !== 'none' && s.id !== 'overlay' ? ` · ${t(`data.origin.${s.origin}` as MessageKey)}` : ''}
        {s.origin === 'none' ? ` · ${t('data.origin.none')}` : ''}
      </strong>
      {s.info ? (
        <>
          <span class="small muted">{t(`data.count.${s.id}` as MessageKey, { count: s.count })}</span>
          <span class="small muted">{t('data.from', { quelle: s.info.quelle })}</span>
          <span class="small muted">{t('data.fetched', { date: date ?? t('data.empty') })}</span>
        </>
      ) : (
        <span class="small muted">{t('data.empty')}</span>
      )}
      {s.issues.length > 0 && (
        <span class="small msg-error" role="status" data-testid={`source-issue-${s.id}`}>
          {t('data.rejected', { detail: issueText(t, s.issues[0]) })}
        </span>
      )}
    </li>
  );
}

function issueText(t: (k: MessageKey, p?: Params) => string, issue: Issue): string {
  const base = t(`issue.${issue.code}` as MessageKey);
  return issue.detail ? `${base} ${issue.detail}` : base;
}

const show = (v: unknown) => (v === undefined || v === null || v === '' ? '–' : typeof v === 'object' ? JSON.stringify(v) : String(v));

interface Msg {
  kind: 'ok' | 'error';
  key: MessageKey;
  params?: Params;
}

/** Import per Datei oder eingefügtem Text, mit Vorschau. Gespeichert wird erst nach Bestätigung. */
export function ImportCard() {
  const t = useT();
  const data = useStore(dataStore);
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const hasOverlay = data.sources.some((s) => s.id === 'overlay');

  function check(raw: string) {
    setPlan(null);
    const parsed = parseImportText(raw);
    if (!parsed.ok) {
      setMsg({ kind: 'error', key: `import.error.${parsed.code}` as MessageKey });
      return;
    }
    const p = planImport(data.players, parsed);
    if (p.accepted.length === 0 && p.rejected.length === 0) {
      setMsg({ kind: 'error', key: 'import.nothing' });
      return;
    }
    setMsg(null);
    setPlan(p);
  }

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2_100_000) {
      setPlan(null);
      setMsg({ kind: 'error', key: 'import.error.too_large' });
      return;
    }
    try {
      check(await file.text());
    } catch {
      setPlan(null);
      setMsg({ kind: 'error', key: 'backup.error.read' });
    }
  }

  async function confirm() {
    if (!plan) return;
    try {
      await saveOverlay(plan.accepted);
      setMsg({ kind: 'ok', key: 'import.done', params: { added: plan.added.length, updated: plan.updated.length } });
      setText('');
    } catch {
      setMsg({ kind: 'error', key: 'import.failed' });
    }
    setPlan(null);
  }

  async function reset() {
    try {
      await clearOverlay();
      setMsg({ kind: 'ok', key: 'import.reset.done' });
    } catch {
      setMsg({ kind: 'error', key: 'import.failed' });
    }
  }

  const changes = plan?.updated.flatMap((u) => u.changes.map((c) => ({ name: u.name, ...c }))) ?? [];

  return (
    <div class="card">
      <h2>{t('import.title')}</h2>
      <p class="muted">{t('import.hint')}</p>
      <div class="row">
        <button type="button" class="btn btn-secondary" data-testid="import-pick-file" onClick={() => fileInput.current?.click()}>
          {t('import.file')}
        </button>
        <input ref={fileInput} type="file" accept=".json,.csv,.tsv,.txt,text/*,application/json" hidden data-testid="import-file" onChange={(e) => void onFile(e)} />
      </div>
      <label class="label" for="import-text" style="display:block;margin-top:12px">
        {t('import.paste')}
      </label>
      <textarea
        id="import-text"
        class="import-text"
        data-testid="import-text"
        value={text}
        spellcheck={false}
        onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
      />
      <div class="row" style="margin-top:8px">
        <button type="button" class="btn" data-testid="import-check" disabled={!text.trim()} onClick={() => check(text)}>
          {t('import.paste.button')}
        </button>
        {hasOverlay && (
          <button type="button" class="btn btn-secondary" data-testid="import-reset" onClick={() => void reset()}>
            {t('import.reset')}
          </button>
        )}
      </div>

      {plan && (
        <div class="notice" data-testid="import-preview">
          <strong>{t('import.preview.title')}</strong>
          <ul class="plain-list">
            <li data-testid="import-count-added">{t('import.preview.added', { count: plan.added.length })}</li>
            <li data-testid="import-count-updated">{t('import.preview.updated', { count: plan.updated.length })}</li>
            <li>{t('import.preview.unchanged', { count: plan.unchanged })}</li>
            <li data-testid="import-count-rejected">{t('import.preview.rejected', { count: plan.rejected.length })}</li>
          </ul>
          {changes.length > 0 && (
            <ul class="plain-list">
              {changes.slice(0, MAX_LISTED).map((c, i) => (
                <li key={i}>{t('import.preview.change', { name: c.name, field: c.field, from: show(c.from), to: show(c.to) })}</li>
              ))}
              {changes.length > MAX_LISTED && <li>{t('import.preview.more', { count: changes.length - MAX_LISTED })}</li>}
            </ul>
          )}
          {plan.rejected.length > 0 && (
            <ul class="plain-list" data-testid="import-rejected">
              {plan.rejected.slice(0, MAX_LISTED).map((r, i) => (
                <li key={i}>
                  {t('import.preview.rejectedRow', {
                    row: r.row,
                    name: r.name ? ` (${r.name})` : '',
                    reason: t(`import.row.${r.code}` as MessageKey),
                  })}
                </li>
              ))}
              {plan.rejected.length > MAX_LISTED && <li>{t('import.preview.more', { count: plan.rejected.length - MAX_LISTED })}</li>}
            </ul>
          )}
          <div class="row" style="margin-top:12px">
            <button type="button" class="btn" data-testid="import-confirm" disabled={plan.accepted.length === 0} onClick={() => void confirm()}>
              {t('import.confirm')}
            </button>
            <button type="button" class="btn btn-secondary" data-testid="import-cancel" onClick={() => setPlan(null)}>
              {t('import.cancel')}
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p class={msg.kind === 'ok' ? 'msg msg-ok' : 'msg msg-error'} role={msg.kind === 'error' ? 'alert' : 'status'} data-testid="import-message">
          {t(msg.key, msg.params)}
        </p>
      )}
    </div>
  );
}
