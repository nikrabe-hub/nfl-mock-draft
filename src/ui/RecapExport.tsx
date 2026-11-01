import { useState } from 'preact/hooks';
import { useT } from '../i18n';
import type { Recap } from '../export/recap';
import { recapFileName } from '../export/recap';
import { canShareFiles, downloadBlob, renderRecapPng, shareBlob } from '../export/recapPng';

type Status = 'idle' | 'busy' | 'done' | 'failed';

/** Buttons "Als PNG speichern" (und "Teilen", wenn das Gerät es kann) für die Übersicht eines Teams. */
export function RecapExport({ recap }: { recap: Recap }) {
  const t = useT();
  const [status, setStatus] = useState<Status>('idle');
  const file = recapFileName(recap);
  const title = t('export.for', { team: `${recap.city} ${recap.name}`.trim() });

  const run = async (mode: 'save' | 'share') => {
    if (status === 'busy') return;
    setStatus('busy');
    try {
      const blob = await renderRecapPng(recap, t);
      if (mode === 'share' && (await shareBlob(blob, file, title))) setStatus('idle');
      else {
        downloadBlob(blob, file);
        setStatus('done');
      }
    } catch {
      setStatus('failed');
    }
  };

  return (
    <div class="export-row">
      <div class="row">
        <button type="button" class="btn" data-testid={`export-png-${recap.team}`} disabled={status === 'busy'} onClick={() => run('save')}>
          {status === 'busy' ? t('export.busy') : t('export.png')}
        </button>
        {canShareFiles() && (
          <button type="button" class="btn btn-secondary" data-testid={`export-share-${recap.team}`} disabled={status === 'busy'} onClick={() => run('share')}>
            {t('export.share')}
          </button>
        )}
      </div>
      <p class="small muted" role="status" data-testid={`export-status-${recap.team}`}>
        {status === 'done' ? t('export.done', { file }) : status === 'failed' ? t('export.failed') : ''}
      </p>
    </div>
  );
}
