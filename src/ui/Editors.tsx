import { useEffect, useMemo, useState } from 'preact/hooks';
import { dataStore } from '../data/loader';
import { POSITIONS } from '../data/positions';
import { getTeam, TEAMS, teamLabel } from '../data/teams';
import { DEFAULT_NEEDS, resolveNeeds } from '../draft/needs';
import { MAX_NEEDS, MIN_NEEDS, overridesStore, resetAllNeeds, resetOrder, resetTeamNeeds, setPickOwner, setTeamNeeds } from '../draft/overrides';
import { useT, type MessageKey } from '../i18n';
import { useStore } from '../store';
import { TeamLogo } from './TeamLogo';

const TEAMS_SORTED = [...TEAMS].sort((a, b) => a.city.localeCompare(b.city));

/** Needs eines Teams ändern (3–5 Positionen, wichtigste zuerst). */
export function NeedsEditor() {
  const t = useT();
  const ov = useStore(overridesStore);
  const [team, setTeam] = useState(TEAMS_SORTED[0].abbr);
  const current = useMemo(() => resolveNeeds(ov.needs)[team] ?? [], [ov.needs, team]);
  const [slots, setSlots] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    setSlots(Array.from({ length: MAX_NEEDS }, (_, i) => current[i] ?? ''));
  }, [current, team]);

  const changed = !!ov.needs[team];
  const count = Object.keys(ov.needs).length;

  function save() {
    const r = setTeamNeeds(team, slots.filter(Boolean));
    setMsg(r.ok ? { kind: 'ok', text: t('needs.saved', { team: teamLabel(team) }) } : { kind: 'error', text: t(`needs.error.${r.error}` as MessageKey, { min: MIN_NEEDS, max: MAX_NEEDS }) });
  }

  return (
    <div class="card" data-testid="needs-editor">
      <h2>{t('needs.title')}</h2>
      <p class="muted small">{t('needs.explain', { min: MIN_NEEDS, max: MAX_NEEDS })}</p>
      <label class="field">
        <span class="label">{t('trade.partner.team')}</span>
        <select class="select" data-testid="needs-team" value={team} onChange={(e) => { setTeam((e.currentTarget as HTMLSelectElement).value); setMsg(null); }}>
          {TEAMS_SORTED.map((x) => (
            <option key={x.abbr} value={x.abbr}>
              {x.city} {x.name}
              {ov.needs[x.abbr] ? ' •' : ''}
            </option>
          ))}
        </select>
      </label>
      <div class="need-slots">
        {slots.map((pos, i) => (
          <label key={i} class="need-slot">
            <span class="small muted">{t('needs.priority', { n: i + 1 })}</span>
            <select
              class="select"
              data-testid={`needs-slot-${i + 1}`}
              value={pos}
              onChange={(e) => {
                const next = [...slots];
                next[i] = (e.currentTarget as HTMLSelectElement).value;
                setSlots(next);
                setMsg(null);
              }}
            >
              <option value="">–</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p class="small muted" data-testid="needs-default">
        {changed ? t('needs.changed', { list: (DEFAULT_NEEDS[team] ?? []).join(', ') }) : t('needs.default')}
      </p>
      <div class="row">
        <button type="button" class="btn" data-testid="needs-save" onClick={save}>
          {t('needs.save')}
        </button>
        {changed && (
          <button
            type="button"
            class="btn btn-secondary"
            data-testid="needs-reset"
            onClick={() => {
              resetTeamNeeds(team);
              setMsg(null);
            }}
          >
            {t('needs.reset')}
          </button>
        )}
      </div>
      {msg && (
        <p class={msg.kind === 'ok' ? 'msg msg-ok' : 'msg msg-error'} role={msg.kind === 'ok' ? 'status' : 'alert'} data-testid="needs-msg">
          {msg.text}
        </p>
      )}
      {count > 0 &&
        (confirmAll ? (
          <div class="notice" role="alertdialog" aria-label={t('needs.resetAll.confirm')}>
            <p>{t('needs.resetAll.confirm')}</p>
            <div class="row">
              <button type="button" class="btn btn-danger" data-testid="needs-reset-all-yes" onClick={() => { resetAllNeeds(); setConfirmAll(false); setMsg(null); }}>
                {t('history.delete.yes')}
              </button>
              <button type="button" class="btn btn-secondary" onClick={() => setConfirmAll(false)}>
                {t('resume.confirm.no')}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" class="link-btn" data-testid="needs-reset-all" onClick={() => setConfirmAll(true)}>
            {t('needs.resetAll', { n: count })}
          </button>
        ))}
    </div>
  );
}

/** Pick-Besitzer ändern, runde für Runde. */
export function OrderEditor() {
  const t = useT();
  const ov = useStore(overridesStore);
  const data = useStore(dataStore);
  const [round, setRound] = useState(1);
  const [confirmAll, setConfirmAll] = useState(false);
  const rounds = useMemo(() => [...new Set(data.picks.map((p) => p.round))].sort((a, b) => a - b), [data.picks]);
  const picks = useMemo(() => data.picks.filter((p) => p.round === round).sort((a, b) => a.pick - b.pick), [data.picks, round]);
  const count = Object.keys(ov.order).length;

  if (data.picks.length === 0) return null;

  return (
    <div class="card" data-testid="order-editor">
      <h2>{t('order.title')}</h2>
      <p class="muted small">{t('order.explain')}</p>
      <div class="segmented" role="group" aria-label={t('order.round')}>
        {rounds.map((r) => (
          <button key={r} type="button" class={round === r ? 'seg active' : 'seg'} aria-pressed={round === r} data-testid={`order-round-${r}`} onClick={() => setRound(r)}>
            {r}
          </button>
        ))}
      </div>
      <ul class="order-list">
        {picks.map((p) => {
          const owner = ov.order[String(p.pick)] ?? p.team;
          const changed = owner !== p.team;
          return (
            <li key={p.pick} class={changed ? 'order-row changed' : 'order-row'} data-testid="order-row" data-pick={p.pick}>
              <span class="rp-no">{p.pick}</span>
              <TeamLogo abbr={owner} size={32} />
              <select
                class="select"
                aria-label={t('order.owner', { pick: p.pick })}
                data-testid={`order-owner-${p.pick}`}
                value={owner}
                onChange={(e) => setPickOwner(p.pick, (e.currentTarget as HTMLSelectElement).value, p.team)}
              >
                {TEAMS_SORTED.map((x) => (
                  <option key={x.abbr} value={x.abbr}>
                    {x.abbr} – {x.city} {x.name}
                  </option>
                ))}
              </select>
              {changed && (
                <span class="small muted order-was">
                  {t('order.was', { team: getTeam(p.team)?.abbr ?? p.team })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {count > 0 &&
        (confirmAll ? (
          <div class="notice" role="alertdialog" aria-label={t('order.resetAll.confirm')}>
            <p>{t('order.resetAll.confirm')}</p>
            <div class="row">
              <button type="button" class="btn btn-danger" data-testid="order-reset-all-yes" onClick={() => { resetOrder(); setConfirmAll(false); }}>
                {t('history.delete.yes')}
              </button>
              <button type="button" class="btn btn-secondary" onClick={() => setConfirmAll(false)}>
                {t('resume.confirm.no')}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" class="link-btn" data-testid="order-reset-all" onClick={() => setConfirmAll(true)}>
            {t('order.resetAll', { n: count })}
          </button>
        ))}
    </div>
  );
}
