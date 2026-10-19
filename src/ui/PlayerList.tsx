import { useMemo, useState } from 'preact/hooks';
import { dataStore } from '../data/loader';
import { formatHeight } from '../data/names';
import { POSITIONS } from '../data/positions';
import type { Player } from '../data/types';
import { useT } from '../i18n';
import { useStore } from '../store';

const dash = '–';
const show = (v: unknown) => (v === undefined || v === null || v === '' ? dash : String(v));

function Details({ player }: { player: Player }) {
  const t = useT();
  const data = useStore(dataStore);
  const stats = data.stats[player.id];
  const entries = stats ? Object.entries(stats) : [];
  const profile = player.profile ?? {};
  return (
    <div class="player-details" data-testid="player-details">
      <dl class="facts">
        <div>
          <dt>{t('detail.height')}</dt>
          <dd>{player.heightIn ? formatHeight(player.heightIn) : dash}</dd>
        </div>
        <div>
          <dt>{t('detail.weight')}</dt>
          <dd>{player.weightLb ? `${player.weightLb} lbs` : dash}</dd>
        </div>
        <div>
          <dt>{t('detail.age')}</dt>
          <dd>{show(player.age)}</dd>
        </div>
        <div>
          <dt>{t('detail.klasse')}</dt>
          <dd>{show(player.klasse)}</dd>
        </div>
        <div>
          <dt>{t('detail.posRank')}</dt>
          <dd>{player.posRank ? `${player.pos}${player.posRank}` : dash}</dd>
        </div>
        <div>
          <dt>{t('players.adp')}</dt>
          <dd>{show(player.adp)}</dd>
        </div>
      </dl>
      <p>
        <strong>{t('detail.strengths')}:</strong> {show(profile.strengths)}
      </p>
      <p>
        <strong>{t('detail.weaknesses')}:</strong> {show(profile.weaknesses)}
      </p>
      <p>
        <strong>{t('detail.comparison')}:</strong> {show(profile.comparison)}
      </p>
      <p>
        <strong>{t('detail.stats', { season: data.statsSeason ?? dash })}:</strong>{' '}
        {entries.length ? entries.map(([k, v]) => `${k.replace(/_/g, ' ').toUpperCase()} ${v}`).join(' · ') : dash}
      </p>
    </div>
  );
}

export function PlayerList({ players, canDraft, onDraft }: { players: readonly Player[]; canDraft: boolean; onDraft: (id: string) => void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<string>('ALL');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const positions = useMemo(() => {
    const present = new Set(players.map((p) => p.pos));
    return POSITIONS.filter((p) => present.has(p));
  }, [players]);

  const q = query.trim().toLowerCase();
  const rows = players.filter((p) => (pos === 'ALL' || p.pos === pos || p.altPos?.includes(pos)) && (!q || p.name.toLowerCase().includes(q) || p.college.toLowerCase().includes(q)));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div class="players">
      <input class="search" type="search" inputMode="search" autocomplete="off" placeholder={t('players.search')} aria-label={t('players.search')} data-testid="player-search" value={query} onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
      <div class="chips pos-filter" role="group" aria-label={t('players.filter')}>
        {['ALL', ...positions].map((p) => (
          <button key={p} type="button" class={pos === p ? 'chip-btn active' : 'chip-btn'} aria-pressed={pos === p} data-testid={`pos-${p}`} onClick={() => setPos(p)}>
            {p === 'ALL' ? t('players.filter.all') : p}
          </button>
        ))}
      </div>
      <p class="muted small" data-testid="player-count">
        {t('players.count', { count: rows.length })}
      </p>
      {rows.length === 0 && <p class="notice">{t('players.none')}</p>}
      <ul class="player-list" data-testid="player-list">
        {rows.map((p) => (
          <li key={p.id} class="player" data-testid="player-row" data-id={p.id}>
            <div class="player-main">
              <span class="p-rank" title={t('players.rank')}>
                {p.rank}
              </span>
              <div class="p-info">
                <strong class="p-name">{p.name}</strong>
                <span class="small muted">
                  {p.pos}
                  {p.posRank ?? ''} · {p.college || dash} · {t('players.adp')} {show(p.adp)}
                </span>
              </div>
              <div class="p-actions">
                <button type="button" class="btn btn-secondary btn-compact" aria-expanded={open.has(p.id)} data-testid="player-more" onClick={() => toggle(p.id)}>
                  {open.has(p.id) ? t('players.less') : t('players.more')}
                </button>
                {canDraft && (
                  <button type="button" class="btn btn-compact" data-testid="player-draft" onClick={() => setConfirmId(confirmId === p.id ? null : p.id)}>
                    {t('players.draft')}
                  </button>
                )}
              </div>
            </div>
            {open.has(p.id) && <Details player={p} />}
            {confirmId === p.id && (
              <div class="confirm" role="alertdialog" aria-label={t('players.confirm', { name: p.name })}>
                <span>{t('players.confirm', { name: p.name })}</span>
                <div class="row">
                  <button
                    type="button"
                    class="btn"
                    data-testid="draft-confirm"
                    onClick={() => {
                      setConfirmId(null);
                      onDraft(p.id);
                    }}
                  >
                    {t('players.yes')}
                  </button>
                  <button type="button" class="btn btn-secondary" onClick={() => setConfirmId(null)}>
                    {t('players.cancel')}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
