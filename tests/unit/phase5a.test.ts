import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyAiPick, createSession, type DraftSession } from '../../src/draft/engine';
import { gradeDraft, stealsAndReaches } from '../../src/draft/grades';
import { MAX_MOCKS, addMock, recordFromSession, sanitizeMock, sanitizeMocks, type MockRecord } from '../../src/draft/history';
import { resolveNeeds } from '../../src/draft/needs';
import { useStorageForTests } from '../../src/draft/persist';
import { MAX_WATCH, loadWatchlist, sanitizeWatchlist, toggleWatch, watchStore, whenWatchSaved } from '../../src/draft/watchlist';
import { recapFromMock } from '../../src/export/recap';
import { createStorage } from '../../src/storage/db';
import { KEYS } from '../../src/storage/keys';
import { makeBoard, makeDraftOrder } from './helpers';

function finished(rounds = 2, seed = 11): DraftSession {
  const r = createSession({
    order: makeDraftOrder().picks,
    players: makeBoard(300).players,
    needs: resolveNeeds(undefined),
    year: 2027,
    config: { rounds, userTeams: ['LAC', 'NYJ'], randomness: 'realistic', seed },
    now: new Date('2026-11-01T10:00:00Z'),
  });
  if (!r.ok) throw new Error(r.error);
  let s = r.session;
  for (let g = 0; g < 1000 && s.status === 'running'; g++) s = applyAiPick(s);
  return s;
}

describe('Watchlist', () => {
  beforeEach(async () => {
    useStorageForTests(await createStorage({ prefer: 'memory' }));
    watchStore.set({ ids: [] });
  });
  it('Stern setzen/entfernen und speichern', async () => {
    expect(toggleWatch('a')).toBe(true);
    expect(toggleWatch('b')).toBe(true);
    expect(toggleWatch('a')).toBe(false);
    expect(watchStore.get().ids).toEqual(['b']);
    await whenWatchSaved();
    watchStore.set({ ids: [] });
    await loadWatchlist();
    expect(watchStore.get().ids).toEqual(['b']);
  });
  it('ignoriert Müll im Speicher und doppelte Einträge', () => {
    expect(sanitizeWatchlist(['x', 'x', 5, null, '', 'y'])).toEqual(['x', 'y']);
    expect(sanitizeWatchlist('kaputt')).toEqual([]);
    expect(sanitizeWatchlist(Array.from({ length: MAX_WATCH + 50 }, (_, i) => `p${i}`))).toHaveLength(MAX_WATCH);
  });
  it('liegt unter dem Backup-Schlüssel "watchlist"', () => {
    expect(KEYS.watchlist).toBe('watchlist');
  });
});

describe('Steals & Reaches', () => {
  it('sortiert nach Abweichung und trennt Steals von Reaches', () => {
    const lines = [
      { pick: 1, delta: 0 },
      { pick: 2, delta: 15 },
      { pick: 3, delta: -20 },
      { pick: 4, delta: 30 },
      { pick: 5, delta: -5 },
      { pick: 6, delta: null },
    ];
    const r = stealsAndReaches(lines, 2);
    expect(r.steals.map((x) => x.pick)).toEqual([4, 2]);
    expect(r.reaches.map((x) => x.pick)).toEqual([3, 5]);
  });
  it('liefert bei einem echten Draft nur passende Vorzeichen', () => {
    const s = finished();
    const rec = recordFromSession(s);
    const r = stealsAndReaches(rec.picks, 5);
    expect(r.steals.every((p) => (p.delta ?? 0) > 0)).toBe(true);
    expect(r.reaches.every((p) => (p.delta ?? 0) < 0)).toBe(true);
  });
});

describe('Mock-Verlauf', () => {
  it('recordFromSession fasst Picks, Teams und Noten kompakt zusammen', () => {
    const s = finished();
    const g = gradeDraft(s);
    const rec = recordFromSession(s, g);
    expect(rec.id).toBe(s.id);
    expect(rec.picks).toHaveLength(s.results.length);
    expect(rec.userTeams).toEqual(['LAC', 'NYJ']);
    expect(rec.teams.LAC.grade).toBe(g.teams.LAC.grade);
    expect(rec.complete).toBe(true);
    // übersteht JSON (Speicher/Backup) unverändert
    expect(sanitizeMock(JSON.parse(JSON.stringify(rec)))).toEqual(rec);
  });
  it('recapFromMock liefert dieselbe Übersicht wie für den laufenden Draft', () => {
    const s = finished();
    const rec = recordFromSession(s);
    const recap = recapFromMock(rec, 'LAC')!;
    expect(recap.grade).toBe(rec.teams.LAC.grade);
    expect(recap.rows.map((r) => r.pick)).toEqual(rec.picks.filter((p) => p.team === 'LAC').map((p) => p.pick));
    expect(recapFromMock(rec, 'XXX')).toBeNull();
  });
  it('verwirft kaputte Einträge, ohne abzustürzen', () => {
    const good = recordFromSession(finished());
    const list = sanitizeMocks([good, null, 5, 'x', { id: 'a' }, { ...good, id: 'b', picks: [] }, { ...good, id: 'c', picks: [{ nope: 1 }] }, good]);
    expect(list).toHaveLength(1);
    expect(sanitizeMocks('kaputt')).toEqual([]);
    expect(sanitizeMock({ ...good, teams: { LAC: { grade: 'Z' } } })!.teams).toEqual({});
  });
  it('behält höchstens MAX_MOCKS und ersetzt gleiche IDs', () => {
    const base = recordFromSession(finished());
    let list: MockRecord[] = [];
    for (let i = 0; i < MAX_MOCKS + 5; i++) list = addMock(list, { ...base, id: `m${i}`, savedAt: new Date(2026, 10, 1, 10, i).toISOString() });
    expect(list).toHaveLength(MAX_MOCKS);
    expect(list[0].id).toBe(`m${MAX_MOCKS + 4}`); // neuester zuerst
    const again = addMock(list, { ...list[3], savedAt: new Date(2030, 0, 1).toISOString() });
    expect(again).toHaveLength(MAX_MOCKS);
    expect(again.filter((m) => m.id === list[3].id)).toHaveLength(1);
    expect(again[0].id).toBe(list[3].id);
  });
});
