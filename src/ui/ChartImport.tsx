import { useState } from 'preact/hooks';
import { chartStore, parseChartText, saveChart } from '../draft/tradeChart';
import { useT, type MessageKey } from '../i18n';
import { useStore } from '../store';

/** Eigene Trade-Wertchart einfügen (ersetzt die eingebaute Näherung). */
export function ChartImport() {
  const t = useT();
  const { chart } = useStore(chartStore);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  function submit() {
    const r = parseChartText(text);
    if (!r.ok) {
      setMsg({ kind: 'error', text: t(`chart.error.${r.error}` as MessageKey, { detail: r.detail ?? '' }) });
      return;
    }
    void saveChart(r.chart);
    setText('');
    setMsg({ kind: 'ok', text: t('chart.ok', { n: r.chart.values.length }) });
  }

  return (
    <div class="card" data-testid="chart-import">
      <h2>{t('chart.title')}</h2>
      <p data-testid="chart-status">{chart.approximate ? t('chart.status.approx') : t('chart.status.custom', { name: chart.name, n: chart.values.length })}</p>
      <p class="muted small">{t('chart.explain')}</p>
      <textarea
        class="textarea"
        rows={5}
        placeholder={t('chart.placeholder')}
        aria-label={t('chart.title')}
        data-testid="chart-text"
        value={text}
        onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
      />
      <div class="row">
        <button type="button" class="btn" data-testid="chart-import-go" disabled={!text.trim()} onClick={submit}>
          {t('chart.import')}
        </button>
        {!chart.approximate && (
          <button
            type="button"
            class="btn btn-secondary"
            data-testid="chart-reset"
            onClick={() => {
              void saveChart(null);
              setMsg(null);
            }}
          >
            {t('chart.reset')}
          </button>
        )}
      </div>
      {msg && (
        <p class={msg.kind === 'ok' ? 'msg msg-ok' : 'msg msg-error'} role={msg.kind === 'ok' ? 'status' : 'alert'} data-testid="chart-msg">
          {msg.text}
        </p>
      )}
    </div>
  );
}
