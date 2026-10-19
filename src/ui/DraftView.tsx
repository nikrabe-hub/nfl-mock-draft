import { useEffect, useRef, useState } from 'preact/hooks';
import { discardDraft, draftStore } from '../draft/controller';
import { isUserTurn } from '../draft/engine';
import { useT } from '../i18n';
import { useStore } from '../store';
import { Board } from './Board';
import { TempoControl } from './DraftOptions';
import { PickPanel } from './PickPanel';

export function DraftView({ onLeave }: { onLeave: () => void }) {
  const t = useT();
  const ui = useStore(draftStore);
  const s = ui.session;
  const turn = !!s && isUserTurn(s);
  const [view, setView] = useState<'pick' | 'board'>(turn ? 'pick' : 'board');
  const [confirm, setConfirm] = useState(false);
  const wasTurn = useRef(turn);

  // Kommt man an die Reihe, wechselt die Handy-Ansicht von selbst zur Spielerliste.
  useEffect(() => {
    if (turn && !wasTurn.current) setView('pick');
    wasTurn.current = turn;
  }, [turn]);

  if (!s) return null;
  const done = s.results.length;
  const total = s.order.length;
  const pct = Math.round((done / total) * 100);

  return (
    <section class="draft" aria-label="Mock Draft">
      <div class="draft-head">
        <div class="progress-line">
          <strong data-testid="draft-progress">{t('draft.progress', { done, total })}</strong>
          <button type="button" class="link-btn" data-testid="draft-discard" onClick={() => setConfirm(true)}>
            {t('draft.discard')}
          </button>
        </div>
        <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div class="progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <TempoControl />
        {confirm && (
          <div class="notice" role="alertdialog" aria-label={t('resume.confirm')}>
            <p>{t('resume.confirm')}</p>
            <div class="row">
              <button
                type="button"
                class="btn"
                data-testid="draft-discard-yes"
                onClick={() => {
                  discardDraft();
                  onLeave();
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

      <div class="segmented mobile-switch" role="group" aria-label={t('draft.view')}>
        <button type="button" class={view === 'pick' ? 'seg active' : 'seg'} aria-pressed={view === 'pick'} data-testid="view-pick" onClick={() => setView('pick')}>
          {t('draft.view.pick')}
        </button>
        <button type="button" class={view === 'board' ? 'seg active' : 'seg'} aria-pressed={view === 'board'} data-testid="view-board" onClick={() => setView('board')}>
          {t('draft.view.board')}
        </button>
      </div>

      <div class="draft-grid">
        <div class={view === 'board' ? 'pane pane-board' : 'pane pane-board mobile-hide'}>
          <Board session={s} lastIndex={ui.lastIndex} />
        </div>
        <div class={view === 'pick' ? 'pane pane-pick' : 'pane pane-pick mobile-hide'}>
          <PickPanel session={s} onLeave={onLeave} />
        </div>
      </div>
    </section>
  );
}
