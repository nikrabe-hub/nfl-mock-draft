import { useState } from 'preact/hooks';
import { teamLabel } from '../data/teams';
import { clearHistory, deleteMock, historyStore, MAX_MOCKS, type MockRecord } from '../draft/history';
import { recapFromMock } from '../export/recap';
import { useT } from '../i18n';
import { settingsStore } from '../storage/settings';
import { useStore } from '../store';
import { GradeBadge } from './GradeBadge';
import { AllTeamsList, ResultBlock, StealsReaches, TradeLog } from './Results';
import { TeamLogo } from './TeamLogo';

type View = { kind: 'list' } | { kind: 'detail'; id: string } | { kind: 'compare'; a: string; b: string };

function formatDate(iso: string, lang: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function MockSummary({ m }: { m: MockRecord }) {
  const t = useT();
  const { lang } = useStore(settingsStore);
  const teams = m.userTeams.filter((x) => m.teams[x]);
  return (
    <div class="mock-sum">
      <strong>{formatDate(m.savedAt, lang)}</strong>
      <span class="small muted">
        {t('history.rounds', { n: m.rounds })} · {t(`random.${m.randomness as 'predictable' | 'realistic' | 'chaos'}`)}
        {m.complete ? '' : ` · ${t('history.incomplete')}`}
      </span>
      <span class="mock-grades">
        {teams.length === 0 ? <span class="small muted">{t('history.noTeams')}</span> : null}
        {teams.map((x) => (
          <span key={x} class="mock-grade">
            <TeamLogo abbr={x} size={24} />
            <GradeBadge grade={m.teams[x].grade} size="sm" />
          </span>
        ))}
      </span>
    </div>
  );
}

function Detail({ m, onBack }: { m: MockRecord; onBack: () => void }) {
  const t = useT();
  const teams = m.userTeams.filter((x) => m.teams[x]);
  return (
    <div data-testid="history-detail">
      <button type="button" class="link-btn back-btn" data-testid="history-back" onClick={onBack}>
        ← {t('history.back')}
      </button>
      <div class="card">
        <MockSummary m={m} />
        {teams.map((team) => {
          const recap = recapFromMock(m, team);
          return recap ? <ResultBlock key={team} recap={recap} /> : null;
        })}
        <StealsReaches picks={m.picks} />
        <TradeLog trades={m.trades} />
        <AllTeamsList record={m} />
      </div>
    </div>
  );
}

function CompareCol({ label, m, team, other }: { label: string; m: MockRecord; team: string; other: MockRecord }) {
  const t = useT();
  const { lang } = useStore(settingsStore);
  const tg = m.teams[team];
  const picks = m.picks.filter((p) => p.team === team);
  const otherIds = new Set(other.picks.filter((p) => p.team === team).map((p) => p.playerId));
  return (
    <div class="cmp-col" data-testid="compare-col">
      <div class="cmp-head">
        <div>
          <strong>{label}</strong>
          <div class="small muted">{formatDate(m.savedAt, lang)}</div>
        </div>
        {tg && <GradeBadge grade={tg.grade} size="lg" />}
      </div>
      {picks.length === 0 ? (
        <p class="muted small">{t('history.noPicks')}</p>
      ) : (
        <ul class="result-picks">
          {picks.map((p) => (
            <li key={p.pick} class={otherIds.has(p.playerId) ? 'same' : ''} data-testid="compare-pick" data-same={otherIds.has(p.playerId) ? 'true' : undefined}>
              <span class="rp-no">{p.pick}</span>
              <span class="rp-main">
                <strong>{p.name}</strong>
                <span class="small muted">
                  {p.pos} · {p.college}
                  {otherIds.has(p.playerId) ? ` · ${t('history.same')}` : ''}
                </span>
              </span>
              <GradeBadge grade={p.grade} size="md" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Compare({ a, b, onBack }: { a: MockRecord; b: MockRecord; onBack: () => void }) {
  const t = useT();
  // Teams, die in mindestens einem der beiden Mocks gespielt wurden
  const teams = [...new Set([...a.userTeams, ...b.userTeams])].filter((x) => a.teams[x] || b.teams[x]);
  const fallback = [...new Set([...Object.keys(a.teams)].filter((x) => b.teams[x]))];
  const options = teams.length ? teams : fallback;
  const [team, setTeam] = useState(options[0] ?? '');
  const cur = options.includes(team) ? team : options[0];
  return (
    <div data-testid="history-compare">
      <button type="button" class="link-btn back-btn" data-testid="history-back" onClick={onBack}>
        ← {t('history.back')}
      </button>
      <div class="card">
        <h2>{t('history.compare.title')}</h2>
        {options.length === 0 ? (
          <p class="muted">{t('history.compare.none')}</p>
        ) : (
          <>
            <div class="chips" role="group" aria-label={t('history.compare.team')}>
              {options.map((x) => (
                <button key={x} type="button" class={cur === x ? 'chip-btn active' : 'chip-btn'} aria-pressed={cur === x} data-testid={`compare-team-${x}`} onClick={() => setTeam(x)}>
                  {x}
                </button>
              ))}
            </div>
            <p class="small muted">{cur ? teamLabel(cur) : ''}</p>
            <div class="cmp-grid">
              <CompareCol label={t('history.mockA')} m={a} team={cur} other={b} />
              <CompareCol label={t('history.mockB')} m={b} team={cur} other={a} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function History() {
  const t = useT();
  const hist = useStore(historyStore);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [sel, setSel] = useState<string[]>([]);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const byId = new Map(hist.mocks.map((m) => [m.id, m]));

  if (view.kind === 'detail') {
    const m = byId.get(view.id);
    if (m) return <Detail m={m} onBack={() => setView({ kind: 'list' })} />;
  }
  if (view.kind === 'compare') {
    const a = byId.get(view.a);
    const b = byId.get(view.b);
    if (a && b) return <Compare a={a} b={b} onBack={() => setView({ kind: 'list' })} />;
  }

  const toggleSel = (id: string) => setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-2)));
  const valid = sel.filter((id) => byId.has(id));

  return (
    <section aria-labelledby="history-title">
      <h1 id="history-title" class="title">
        {t('history.title')}
      </h1>
      {hist.mocks.length === 0 ? (
        <p class="notice" data-testid="history-empty">
          {t('history.empty')}
        </p>
      ) : (
        <>
          <p class="muted small">{t('history.hint', { max: MAX_MOCKS })}</p>
          {valid.length === 2 && (
            <div class="row">
              <button type="button" class="btn" data-testid="history-compare-go" onClick={() => setView({ kind: 'compare', a: valid[0], b: valid[1] })}>
                {t('history.compare.go')}
              </button>
            </div>
          )}
          <ul class="mock-list" data-testid="history-list">
            {hist.mocks.map((m) => (
              <li key={m.id} class="card mock-card" data-testid="history-item">
                <MockSummary m={m} />
                <div class="row mock-actions">
                  <button type="button" class="btn" data-testid="history-open" onClick={() => setView({ kind: 'detail', id: m.id })}>
                    {t('history.open')}
                  </button>
                  <label class="check">
                    <input type="checkbox" checked={valid.includes(m.id)} data-testid="history-select" onChange={() => toggleSel(m.id)} />
                    <span>{t('history.compare')}</span>
                  </label>
                  {confirmDel === m.id ? (
                    <>
                      <button
                        type="button"
                        class="btn btn-danger"
                        data-testid="history-delete-yes"
                        onClick={() => {
                          void deleteMock(m.id);
                          setConfirmDel(null);
                          setSel((cur) => cur.filter((x) => x !== m.id));
                        }}
                      >
                        {t('history.delete.yes')}
                      </button>
                      <button type="button" class="btn btn-secondary" onClick={() => setConfirmDel(null)}>
                        {t('resume.confirm.no')}
                      </button>
                    </>
                  ) : (
                    <button type="button" class="btn btn-secondary" data-testid="history-delete" onClick={() => setConfirmDel(m.id)}>
                      {t('history.delete')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {confirmClear ? (
            <div class="notice" role="alertdialog" aria-label={t('history.clear.confirm')}>
              <p>{t('history.clear.confirm')}</p>
              <div class="row">
                <button
                  type="button"
                  class="btn btn-danger"
                  data-testid="history-clear-yes"
                  onClick={() => {
                    void clearHistory();
                    setConfirmClear(false);
                    setSel([]);
                  }}
                >
                  {t('history.delete.yes')}
                </button>
                <button type="button" class="btn btn-secondary" onClick={() => setConfirmClear(false)}>
                  {t('resume.confirm.no')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" class="link-btn" data-testid="history-clear" onClick={() => setConfirmClear(true)}>
              {t('history.clear')}
            </button>
          )}
        </>
      )}
    </section>
  );
}
