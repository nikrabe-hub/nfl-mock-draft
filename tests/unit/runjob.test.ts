// @vitest-environment node
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { StopError } from '../../scripts/data-update/politeFetch';
import { runSource, type Parsers, type RunDeps } from '../../scripts/data-update/run';
import { makeBoard, makeDraftOrder } from './helpers';

const TUE_MORNING = new Date('2026-12-01T07:00:00Z'); // Dienstag 08:00 MEZ
const BOARD_TIME = new Date('2026-12-01T07:30:00Z'); // Dienstag 08:30 MEZ (Sollzeit 08:20)
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'nmd-job-'));
});

const okFetcher = (body = '<html>seite</html>') => ({ get: async () => ({ status: 'ok' as const, body, etag: '"e1"' }) });

function deps(over: Partial<RunDeps> & { parsers: Parsers }): RunDeps {
  return { root, now: TUE_MORNING, trigger: 'schedule', fetcher: okFetcher(), ...over };
}

const read = async (f: string) => JSON.parse(await readFile(join(root, f), 'utf8'));

describe('Daten-Job: Draft-Reihenfolge', () => {
  it('schreibt die Datei, wenn alle Prüfungen bestehen, und merkt sich ETag und Lauf', async () => {
    const o = makeDraftOrder();
    const r = await runSource('tankathon-order', deps({ parsers: { 'tankathon-order': () => ({ year: 2027, picks: o.picks }) } }));
    expect(r.status).toBe('updated');
    const file = await read('public/data/draft-order.json');
    expect(file).toMatchObject({ year: 2027, version: 1, quelle: expect.stringContaining('Tankathon') });
    expect(file.abgerufenAm).toBe(TUE_MORNING.toISOString());
    const st = await read('data-state/state.json');
    expect(st['tankathon-order'].lastRun).toBe('2026-12-01');
    expect(Object.values(st['tankathon-order'].pages)[0]).toMatchObject({ etag: '"e1"' });
  });

  it('lässt die alte Datei unverändert, wenn die Prüfung fehlschlägt', async () => {
    const good = makeDraftOrder();
    await runSource('tankathon-order', deps({ parsers: { 'tankathon-order': () => ({ year: 2027, picks: good.picks }) } }));
    const before = await readFile(join(root, 'public/data/draft-order.json'), 'utf8');

    const broken = good.picks.slice(0, 30); // viel zu wenige Picks
    const r = await runSource('tankathon-order', deps({ now: new Date('2026-12-08T07:00:00Z'), parsers: { 'tankathon-order': () => ({ year: 2027, picks: broken }) } }));
    expect(r.status).toBe('failed');
    expect(r.message).toContain('Plausibilitätsprüfung');
    expect(await readFile(join(root, 'public/data/draft-order.json'), 'utf8')).toBe(before);
  });

  it('meldet "unverändert" und erhöht die Version nicht, wenn sich nichts geändert hat', async () => {
    const o = makeDraftOrder();
    const p: Parsers = { 'tankathon-order': () => ({ year: 2027, picks: o.picks }) };
    await runSource('tankathon-order', deps({ parsers: p }));
    const r = await runSource('tankathon-order', deps({ now: new Date('2026-12-08T07:00:00Z'), parsers: p }));
    expect(r.status).toBe('unchanged');
    expect((await read('public/data/draft-order.json')).version).toBe(1);
  });

  it('behandelt HTTP 304 als unverändert', async () => {
    const r = await runSource('tankathon-order', deps({ fetcher: { get: async () => ({ status: 'not-modified' as const }) }, parsers: { 'tankathon-order': () => { throw new Error('darf nicht aufgerufen werden'); } } }));
    expect(r.status).toBe('unchanged');
  });

  it('bricht bei Sperre sofort ab, ändert keine Datei und merkt sich den Versuch', async () => {
    const r = await runSource('tankathon-order', deps({
      fetcher: { get: async () => { throw new StopError('Zugriff abgelehnt (HTTP 429)', 'blocked'); } },
      parsers: { 'tankathon-order': () => ({ year: 2027, picks: [] }) },
    }));
    expect(r.status).toBe('failed');
    expect(r.message).toContain('429');
    await expect(readFile(join(root, 'public/data/draft-order.json'))).rejects.toThrow();
    expect((await read('data-state/state.json'))['tankathon-order'].lastRun).toBe('2026-12-01');
  });

  it('fängt Fehler im Parser ab (z.B. geänderte Seitenstruktur)', async () => {
    const r = await runSource('tankathon-order', deps({ parsers: { 'tankathon-order': () => { throw new Error('Tabelle nicht gefunden'); } } }));
    expect(r.status).toBe('failed');
    expect(r.message).toContain('Tabelle nicht gefunden');
  });

  it('fehlt der Parser, schlägt der Lauf sichtbar fehl', async () => {
    expect((await runSource('tankathon-order', deps({ parsers: {} }))).status).toBe('failed');
  });
});

describe('Daten-Job: Big Board', () => {
  it('führt neue Daten mit dem Bestand zusammen (ADP bleibt, Verschwundene werden markiert)', async () => {
    const board = makeBoard(220);
    board.players[0].adp = 1.5;
    await mkdir(join(root, 'public/data'), { recursive: true });
    await writeFile(join(root, 'public/data/big-board.json'), JSON.stringify(board));

    const incoming = board.players.slice(1).map((p) => ({ name: p.name, college: p.college, pos: p.pos, rank: p.rank, heightIn: p.heightIn })); // erster Spieler fehlt
    incoming.push({ name: 'Neuer Mann', college: 'Utah', pos: 'WR', rank: 500, heightIn: 74 });
    const r = await runSource('tankathon-board', deps({ now: BOARD_TIME, parsers: { 'tankathon-board': () => ({ players: incoming, stats: { [board.players[1].id]: { rec: 5 } } }) } }));
    expect(r.status).toBe('updated');
    const file = await read('public/data/big-board.json');
    expect(file.players).toHaveLength(221);
    expect(file.players.find((p: { name: string }) => p.name === board.players[0].name).notListed).toBe(true);
    expect(file.players.find((p: { name: string }) => p.name === 'Neuer Mann')).toBeTruthy();
    expect(file.version).toBe(2);
    // Statistiken von derselben Seite
    const stats = await read('public/data/college-stats.json');
    expect(stats).toMatchObject({ season: 2026, version: 1, stats: { [board.players[1].id]: { rec: 5 } } });
  });

  it('bricht ab, wenn die Liste plötzlich stark schrumpft (Verdacht auf kaputten Abruf)', async () => {
    const board = makeBoard(162);
    await mkdir(join(root, 'public/data'), { recursive: true });
    await writeFile(join(root, 'public/data/big-board.json'), JSON.stringify(board));
    const before = await readFile(join(root, 'public/data/big-board.json'), 'utf8');
    const few = board.players.slice(0, 105).map((p) => ({ ...p })); // 105 >= 100, aber nur 65 % von 162
    const r = await runSource('tankathon-board', deps({ now: BOARD_TIME, parsers: { 'tankathon-board': () => ({ players: few, stats: {} }) } }));
    expect(r.status).toBe('failed');
    expect(r.message).toContain('fehlerhaften Abruf');
    expect(await readFile(join(root, 'public/data/big-board.json'), 'utf8')).toBe(before);
  });

  it('lehnt ein Board mit zu wenigen Spielern ab und behält die alte Datei', async () => {
    const r = await runSource('tankathon-board', deps({ now: BOARD_TIME, parsers: { 'tankathon-board': () => ({ players: makeBoard(50).players, stats: {} }) } }));
    expect(r.status).toBe('failed');
    await expect(readFile(join(root, 'public/data/big-board.json'))).rejects.toThrow();
  });
});

describe('Daten-Job: Zeitsteuerung', () => {
  const p: Parsers = { 'tankathon-order': () => ({ year: 2027, picks: makeDraftOrder().picks }) };

  it('überspringt planmäßige Läufe zur falschen Zeit, ohne etwas abzurufen', async () => {
    let fetched = false;
    const r = await runSource('tankathon-order', deps({ now: new Date('2026-12-02T07:00:00Z'), fetcher: { get: async () => { fetched = true; return { status: 'ok' as const, body: '' }; } }, parsers: p }));
    expect(r.status).toBe('skipped');
    expect(fetched).toBe(false);
  });

  it('der zweite Cron-Start am selben Tag wird übersprungen', async () => {
    await runSource('tankathon-order', deps({ parsers: p }));
    const r = await runSource('tankathon-order', deps({ now: new Date('2026-12-01T08:00:00Z'), parsers: p }));
    expect(r.status).toBe('skipped');
  });

  it('manuell: einmal pro Tag erlaubt, unabhängig von Wochentag und Uhrzeit', async () => {
    const now = new Date('2026-12-03T15:00:00Z');
    expect((await runSource('tankathon-order', deps({ now, trigger: 'manual', parsers: p }))).status).toBe('updated');
    const again = await runSource('tankathon-order', deps({ now: new Date('2026-12-03T16:00:00Z'), trigger: 'manual', parsers: p }));
    expect(again.status).toBe('skipped');
    expect(again.message).toContain('manuell');
  });
});
