import { nudge } from '../draft/controller';
import { MAX_ROUNDS, MIN_ROUNDS, RANDOMNESS_LEVELS, TEMPOS } from '../draft/engine';
import { prefsStore, updatePrefs } from '../draft/prefs';
import { useT } from '../i18n';
import { useStore } from '../store';

/** Tempo-Regler (langsam / normal / sofort). Wirkt auch mitten im Draft ab dem nächsten Pick. */
export function TempoControl() {
  const t = useT();
  const prefs = useStore(prefsStore);
  return (
    <div class="segmented" role="group" aria-label={t('setup.tempo')} data-testid="opt-tempo">
      {TEMPOS.map((tempo) => (
        <button
          key={tempo}
          type="button"
          class={prefs.tempo === tempo ? 'seg active' : 'seg'}
          aria-pressed={prefs.tempo === tempo}
          data-testid={`opt-tempo-${tempo}`}
          onClick={() => {
            void updatePrefs({ tempo });
            nudge();
          }}
        >
          {t(`tempo.${tempo}`)}
        </button>
      ))}
    </div>
  );
}

export function RandomnessControl() {
  const t = useT();
  const prefs = useStore(prefsStore);
  return (
    <div class="segmented" role="group" aria-label={t('setup.random')} data-testid="opt-random">
      {RANDOMNESS_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          class={prefs.randomness === level ? 'seg active' : 'seg'}
          aria-pressed={prefs.randomness === level}
          data-testid={`opt-random-${level}`}
          onClick={() => void updatePrefs({ randomness: level })}
        >
          {t(`random.${level}`)}
        </button>
      ))}
    </div>
  );
}

export function RoundsControl() {
  const t = useT();
  const prefs = useStore(prefsStore);
  const rounds = Array.from({ length: MAX_ROUNDS - MIN_ROUNDS + 1 }, (_, i) => MIN_ROUNDS + i);
  return (
    <div class="segmented" role="group" aria-label={t('setup.rounds')} data-testid="opt-rounds">
      {rounds.map((n) => (
        <button
          key={n}
          type="button"
          class={prefs.rounds === n ? 'seg active' : 'seg'}
          aria-pressed={prefs.rounds === n}
          data-testid={`opt-rounds-${n}`}
          onClick={() => void updatePrefs({ rounds: n })}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
