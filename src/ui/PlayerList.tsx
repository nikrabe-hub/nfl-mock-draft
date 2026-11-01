import { memo } from 'preact/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { dataStore } from '../data/loader';
import { formatHeight } from '../data/names';
import { POSITIONS } from '../data/positions';
import type { Player } from '../data/types';
import type { ComponentChildren } from 'preact';
import { toggleWatch, watchStore } from '../draft/watchlist';
import { useT } from '../i18n';
import { useStore } from '../store';

const dash = '–';
const show = (v: unknown) => (v === undefined || v === null || v === '' ? dash : String(v));
/** So viele Zeilen werden zuerst gezeichnet; beim Scrollen kommen weitere dazu. Hält Suche und Filter flüssig. */
const PAGE = 40;

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

interface RowProps {
  p: Player;
  open: boolean;
  confirm: boolean;
  canDraft: boolean;
  starred: boolean;
  onToggle: (id: string) => void;
  onAsk: (id: string) => void;
  onConfirm: (id: string) => void;
  onCancel: () => void;
}

const PlayerRow = memo(function PlayerRow({ p, open, confirm, canDraft, starred, onToggle, onAsk, onConfirm, onCancel }: RowProps) {
  const t = useT();
  return (
    <li class="player" data-testid="player-row" data-id={p.id}>
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
          <button
            type="button"
            class={starred ? 'star-btn on' : 'star-btn'}
            aria-pressed={starred}
            aria-label={starred ? t('watch.remove', { name: p.name }) : t('watch.add', { name: p.name })}
            data-testid="player-star"
            onClick={() => toggleWatch(p.id)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linejoin="round">
              <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
            </svg>
          </button>
          <button type="button" class="btn btn-secondary btn-compact" aria-expanded={open} data-testid="player-more" onClick={() => onToggle(p.id)}>
            {open ? t('players.less') : t('players.more')}
          </button>
          {canDraft && (
            <button type="button" class="btn btn-compact" data-testid="player-draft" onClick={() => onAsk(p.id)}>
              {t('players.draft')}
            </button>
          )}
        </div>
      </div>
      {open && <Details player={p} />}
      {confirm && (
        <div class="confirm" role="alertdialog" aria-label={t('players.confirm', { name: p.name })}>
          <span>{t('players.confirm', { name: p.name })}</span>
          <div class="row">
            <button type="button" class="btn" data-testid="draft-confirm" onClick={() => onConfirm(p.id)}>
              {t('players.yes')}
            </button>
            <button type="button" class="btn btn-secondary" onClick={onCancel}>
              {t('players.cancel')}
            </button>
          </div>
        </div>
      )}
    </li>
  );
});

export function PlayerList({ players, canDraft, onDraft, extra }: { players: readonly Player[]; canDraft: boolean; onDraft: (id: string) => void; extra?: ComponentChildren }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<string>('ALL');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const watch = useStore(watchStore);
  const watchSet = useMemo(() => new Set(watch.ids), [watch.ids]);
  const list = useRef<HTMLUListElement>(null);
  const draftRef = useRef(onDraft);
  draftRef.current = onDraft;

  const positions = useMemo(() => {
    const present = new Set(players.map((p) => p.pos));
    return POSITIONS.filter((p) => present.has(p));
  }, [players]);

  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      players.filter(
        (p) =>
          (pos === 'ALL' || (pos === 'WATCH' ? watchSet.has(p.id) : p.pos === pos || p.altPos?.includes(pos))) &&
          (!q || p.name.toLowerCase().includes(q) || p.college.toLowerCase().includes(q)),
      ),
    [players, pos, q, watchSet],
  );

  // Bei neuer Suche/neuem Filter wieder oben anfangen
  useEffect(() => {
    setLimit(PAGE);
    if (list.current) list.current.scrollTop = 0;
  }, [pos, q]);

  const onToggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const onAsk = useCallback((id: string) => setConfirmId((cur) => (cur === id ? null : id)), []);
  const onCancel = useCallback(() => setConfirmId(null), []);
  const onConfirm = useCallback((id: string) => {
    setConfirmId(null);
    draftRef.current(id);
  }, []);

  // Ein unsichtbarer Marker am Listenende lädt weitere Zeilen nach, kurz bevor man ihn erreicht (Seiten- und Listen-Scrollen).
  const sentinel = useRef<HTMLLIElement>(null);
  const more = limit < rows.length;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more) return;
    if (typeof IntersectionObserver === 'undefined') {
      setLimit(rows.length);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE);
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, more, rows.length]);

  const shown = rows.slice(0, limit);

  return (
    <div class="players">
      <input class="search" type="search" inputMode="search" autocomplete="off" placeholder={t('players.search')} aria-label={t('players.search')} data-testid="player-search" value={query} onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
      <div class="chips pos-filter" role="group" aria-label={t('players.filter')}>
        {['ALL', 'WATCH', ...positions].map((p) => (
          <button key={p} type="button" class={pos === p ? 'chip-btn active' : 'chip-btn'} aria-pressed={pos === p} data-testid={`pos-${p}`} onClick={() => setPos(p)}>
            {p === 'ALL' ? t('players.filter.all') : p === 'WATCH' ? `★ ${t('watch.filter')}${watchSet.size ? ` (${watchSet.size})` : ''}` : p}
          </button>
        ))}
      </div>
      <div class="count-line">
        <p class="muted small" data-testid="player-count">
          {t('players.count', { count: rows.length })}
        </p>
        {extra}
      </div>
      {rows.length === 0 && <p class="notice">{pos === 'WATCH' && !q ? t('watch.empty') : t('players.none')}</p>}
      <ul class="player-list" data-testid="player-list" ref={list}>
        {shown.map((p) => (
          <PlayerRow key={p.id} p={p} open={open.has(p.id)} confirm={confirmId === p.id} canDraft={canDraft} starred={watchSet.has(p.id)} onToggle={onToggle} onAsk={onAsk} onConfirm={onConfirm} onCancel={onCancel} />
        ))}
        {more && <li class="sentinel" ref={sentinel} aria-hidden="true" />}
      </ul>
    </div>
  );
}
