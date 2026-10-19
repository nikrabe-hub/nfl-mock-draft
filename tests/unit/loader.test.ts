import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { clearOverlay, composePlayers, dataStore, loadData, saveOverlay, type LoaderDeps } from '../../src/data/loader';
import { createStorage } from '../../src/storage/db';
import { makeBoard, makeDraftOrder, META } from './helpers';

const jsonRes = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

/** Baut eine Fake-fetch: Antworten je Dateiname, getrennt nach "?t=" (online) und ohne (bundled). */
function fakeFetch(files: Record<string, { fresh?: unknown; bundled?: unknown }>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const m = /data\/([a-z-]+)\.json(\?t=.*)?$/.exec(url);
    if (!m) throw new Error('unbekannte URL');
    const entry = files[m[1]];
    const body = m[2] ? entry?.fresh : entry?.bundled;
    if (body === undefined) throw new TypeError('offline');
    return jsonRes(body);
  }) as unknown as typeof fetch;
}

async function deps(fetchFn: typeof fetch, preload?: Record<string, unknown>): Promise<LoaderDeps> {
  const storage = await createStorage({ prefer: 'memory' });
  for (const [k, v] of Object.entries(preload ?? {})) await storage.set(k, v);
  return { fetchFn, storage, baseUrl: '/', timeoutMs: 500, now: () => Date.parse('2026-10-18T12:00:00Z') };
}

const newerMeta = { ...META, abgerufenAm: '2026-10-19T08:00:00.000Z', version: 2 };

describe('Daten laden', () => {
  it('nutzt die mitgelieferten Dateien, wenn der Server nichts Neueres hat', async () => {
    const d = await deps(fakeFetch({ 'draft-order': { bundled: makeDraftOrder() }, 'big-board': { bundled: makeBoard() } }));
    await loadData(d);
    const s = dataStore.get();
    expect(s.loaded).toBe(true);
    expect(s.players).toHaveLength(220);
    expect(s.picks).toHaveLength(224);
    expect(s.draftYear).toBe(2027);
    const board = s.sources.find((x) => x.id === 'big-board')!;
    expect(board.origin).toBe('bundled');
    expect(s.sources.find((x) => x.id === 'college-stats')!.info).toBeNull();
  });

  it('bevorzugt die neuere Datei vom Server und merkt sie sich als letzten gültigen Stand', async () => {
    const fresh = { ...makeBoard(230), ...newerMeta };
    const d = await deps(fakeFetch({ 'big-board': { fresh, bundled: makeBoard() } }));
    await loadData(d);
    expect(dataStore.get().players).toHaveLength(230);
    expect(dataStore.get().sources.find((x) => x.id === 'big-board')!.origin).toBe('online');
    expect(await d.storage!.get('cache:big-board')).toMatchObject({ version: 2 });
  });

  it('verwirft eine ungültige Datei und behält den letzten gültigen Stand', async () => {
    const broken = { ...makeBoard(), ...newerMeta, players: [{ name: 'Kaputt' }] };
    const d = await deps(fakeFetch({ 'big-board': { fresh: broken, bundled: makeBoard() } }));
    await loadData(d);
    const src = dataStore.get().sources.find((x) => x.id === 'big-board')!;
    expect(src.origin).toBe('bundled');
    expect(src.info!.version).toBe(1);
    expect(src.issues.length).toBeGreaterThan(0); // Problem wird gemeldet
    expect(dataStore.get().players).toHaveLength(220);
  });

  it('funktioniert offline mit der gespeicherten Kopie', async () => {
    const stored = { ...makeBoard(240), ...newerMeta };
    const d = await deps(fakeFetch({}), { 'cache:big-board': stored });
    await loadData(d);
    const src = dataStore.get().sources.find((x) => x.id === 'big-board')!;
    expect(src.origin).toBe('stored');
    expect(dataStore.get().players).toHaveLength(240);
  });

  it('ignoriert eine beschädigte gespeicherte Kopie', async () => {
    const d = await deps(fakeFetch({ 'big-board': { bundled: makeBoard() } }), { 'cache:big-board': { quatsch: true } });
    await loadData(d);
    expect(dataStore.get().sources.find((x) => x.id === 'big-board')!.origin).toBe('bundled');
  });

  it('stürzt nicht ab, wenn gar keine Daten da sind', async () => {
    const d = await deps(fakeFetch({}));
    await loadData(d);
    const s = dataStore.get();
    expect(s.loaded).toBe(true);
    expect(s.players).toEqual([]);
    expect(s.picks).toEqual([]);
    expect(s.sources.every((x) => x.origin === 'none')).toBe(true);
  });

  it('behandelt Antworten ohne JSON (z.B. HTML-Fehlerseite) wie "nicht vorhanden"', async () => {
    const htmlFetch = vi.fn(async () => ({ ok: true, json: async () => { throw new SyntaxError('kein JSON'); } }) as unknown as Response) as unknown as typeof fetch;
    const d = await deps(htmlFetch);
    await loadData(d);
    expect(dataStore.get().sources.every((x) => x.origin === 'none')).toBe(true);
  });

  it('wartet nicht ewig auf einen hängenden Server', async () => {
    const hang = vi.fn((_u: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('abort'))))) as unknown as typeof fetch;
    const d = await deps(hang, { 'cache:big-board': makeBoard() });
    d.timeoutMs = 50;
    await loadData(d);
    expect(dataStore.get().players).toHaveLength(220);
  });
});

describe('Eigene Importe (Overlay)', () => {
  it('werden über das Big Board gelegt, überleben neue Daten und lassen sich zurücksetzen', async () => {
    const d = await deps(fakeFetch({ 'big-board': { bundled: makeBoard() } }));
    await loadData(d);
    const first = dataStore.get().players[0];
    await saveOverlay([{ name: first.name, college: first.college, adp: 1.5 }, { name: 'Neu Neu', pos: 'QB', college: 'Utah', rank: 300 }], d);
    expect(dataStore.get().players.find((p) => p.id === first.id)!.adp).toBe(1.5);
    expect(dataStore.get().players).toHaveLength(221);
    expect(dataStore.get().sources.some((s) => s.id === 'overlay')).toBe(true);

    // neuere Server-Daten ersetzen das Board, der Import bleibt aber erhalten
    const d2 = { ...d, fetchFn: fakeFetch({ 'big-board': { fresh: { ...makeBoard(230), ...newerMeta }, bundled: makeBoard() } }) };
    await loadData(d2);
    expect(dataStore.get().players.find((p) => p.id === first.id)!.adp).toBe(1.5);
    expect(dataStore.get().players).toHaveLength(231);

    await clearOverlay(d2);
    expect(dataStore.get().players).toHaveLength(230);
    expect(dataStore.get().players.find((p) => p.id === first.id)!.adp).toBeUndefined();
  });

  it('berechnet Position-Ranks beim Zusammensetzen', () => {
    const ps = composePlayers(makeBoard().players, null);
    expect(ps.every((p) => typeof p.posRank === 'number')).toBe(true);
  });
});
