import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { dataStore } from '../../src/data/loader';
import { autoPickNow, discardDraft, draftStore, resumeDraft, startDraft, userPick, whenIdle } from '../../src/draft/controller';
import { currentSlot, isUserTurn } from '../../src/draft/engine';
import { DEFAULT_PREFS, prefsStore, sanitizePrefs } from '../../src/draft/prefs';
import { loadSession, saveSession, useStorageForTests, whenSaved } from '../../src/draft/persist';
import { createStorage } from '../../src/storage/db';
import { KEYS } from '../../src/storage/keys';
import { makeBoard, makeDraftOrder } from './helpers';

async function setup(opts: { players?: number; teams?: string[]; rounds?: number } = {}) {
  const storage = await createStorage({ prefer: 'memory' });
  useStorageForTests(storage);
  const board = makeBoard(opts.players ?? 300);
  dataStore.set({ loaded: true, players: board.players, picks: makeDraftOrder().picks, draftYear: 2027 });
  prefsStore.set({ ...DEFAULT_PREFS, userTeams: opts.teams ?? ['LAC'], rounds: opts.rounds ?? 2, tempo: 'instant' });
  discardDraft();
  await whenSaved();
  return storage;
}

describe('Draft-Steuerung', () => {
  beforeEach(async () => {
    await setup();
  });

  it('startet, lässt die KI bis zum eigenen Pick ziehen und wartet dann', async () => {
    const r = await startDraft({ seed: 1 });
    expect(r).toEqual({ ok: true });
    await whenIdle();
    const s = draftStore.get().session!;
    expect(s.status).toBe('running');
    expect(isUserTurn(s)).toBe(true);
    expect(currentSlot(s)!.team).toBe('LAC');
    expect(draftStore.get().cpuRunning).toBe(false);
  });

  it('speichert nach jedem Pick und setzt nach "Neuladen" am selben Pick fort', async () => {
    await startDraft({ seed: 2 });
    await whenIdle();
    const before = draftStore.get().session!;
    const pick = before.pool.find((p) => !before.results.some((x) => x.playerId === p.id))!;
    expect(userPick(pick.id)).toEqual({ ok: true });
    await whenSaved();
    const saved = await loadSession();
    expect(saved.kind).toBe('ok');

    // "Neuladen": Zustand der Oberfläche zurücksetzen und aus dem Speicher laden
    await whenIdle();
    const atReload = draftStore.get().session!;
    draftStore.set({ session: null, loaded: false });
    await resumeDraft();
    await whenIdle();
    const resumed = draftStore.get().session!;
    expect(resumed.results.slice(0, atReload.results.length)).toEqual(atReload.results);
    expect(draftStore.get().loaded).toBe(true);
  });

  it('läuft nach dem Neuladen mitten im KI-Zug von selbst weiter', async () => {
    await startDraft({ seed: 3 });
    await whenIdle();
    const s = draftStore.get().session!;
    const first = s.results.length;
    expect(userPick(s.pool.find((p) => !s.results.some((x) => x.playerId === p.id))!.id).ok).toBe(true);
    await whenSaved();
    draftStore.set({ session: null, cpuRunning: false });
    await resumeDraft();
    await whenIdle();
    expect(draftStore.get().session!.results.length).toBeGreaterThan(first + 1);
  });

  it('Auto-Pick wählt für das eigene Team und läuft weiter', async () => {
    await startDraft({ seed: 4 });
    await whenIdle();
    const n = draftStore.get().session!.results.length;
    expect(autoPickNow()).toBe(true);
    await whenIdle();
    const s = draftStore.get().session!;
    expect(s.results[n].auto).toBe(true);
    expect(s.results.length).toBeGreaterThan(n + 1);
  });

  it('lehnt Picks ab, wenn kein eigenes Team dran ist oder der Spieler weg ist', async () => {
    await startDraft({ seed: 5 });
    await whenIdle();
    const s = draftStore.get().session!;
    expect(userPick('gibt-es-nicht')).toEqual({ ok: false, error: 'unknown_player' });
    expect(userPick(s.results[0].playerId)).toEqual({ ok: false, error: 'already_drafted' });
    // Computer-Team an der Reihe -> nicht erlaubt (Tempo "langsam", damit der Zug nicht sofort passiert)
    prefsStore.set({ tempo: 'slow' });
    const free = s.pool.find((p) => !s.results.some((x) => x.playerId === p.id))!;
    expect(userPick(free.id).ok).toBe(true);
    expect(draftStore.get().cpuRunning).toBe(true);
    expect(userPick(s.pool.find((p) => p.id !== free.id && !s.results.some((x) => x.playerId === p.id))!.id)).toEqual({ ok: false, error: 'not_your_turn' });
    discardDraft();
    prefsStore.set({ tempo: 'instant' });
  });

  it('ein Draft mit allen 32 Teams als eigene Teams läuft ohne Hänger bis zum Ende', async () => {
    const all = makeDraftOrder().picks.slice(0, 32).map((p) => p.team);
    await setup({ teams: all, rounds: 7 });
    await startDraft({ seed: 6 });
    for (let guard = 0; guard < 300 && draftStore.get().session!.status === 'running'; guard++) {
      await whenIdle();
      expect(autoPickNow()).toBe(true);
    }
    const s = draftStore.get().session!;
    expect(s.status).toBe('finished');
    expect(s.results).toHaveLength(224);
  });

  it('ein reiner KI-Draft (Tempo sofort) läuft in einem Rutsch bis zum Ende', async () => {
    await setup({ teams: ['LAC'], rounds: 7 });
    await startDraft({ seed: 7 });
    await whenIdle();
    for (let guard = 0; guard < 20 && draftStore.get().session!.status === 'running'; guard++) {
      expect(autoPickNow()).toBe(true);
      await whenIdle();
    }
    expect(draftStore.get().session!.status).toBe('finished');
  });

  it('meldet fehlende Daten, statt zu starten', async () => {
    dataStore.set({ players: [], picks: [] });
    expect(await startDraft()).toEqual({ ok: false, error: 'no_data' });
    dataStore.set({ players: makeBoard(50).players, picks: makeDraftOrder().picks });
    prefsStore.set({ userTeams: [] });
    expect(await startDraft()).toEqual({ ok: false, error: 'no_teams' });
  });

  it('verwirft den Draft samt Speicherstand', async () => {
    await startDraft({ seed: 8 });
    await whenIdle();
    discardDraft();
    await whenSaved();
    expect(draftStore.get().session).toBeNull();
    expect(await loadSession()).toEqual({ kind: 'none' });
  });

  it('ignoriert einen beschädigten Speicherstand und meldet es', async () => {
    const storage = await setup();
    await storage.set(KEYS.activeDraft, { format: 'nfl-mock-draft-session', version: 1, kaputt: true });
    draftStore.set({ session: null, loaded: false, invalidSaved: false });
    await resumeDraft();
    expect(draftStore.get().session).toBeNull();
    expect(draftStore.get().invalidSaved).toBe(true);
    expect(draftStore.get().loaded).toBe(true);
  });

  it('wenn nur wenige Spieler da sind, endet der Draft sauber ohne Hänger', async () => {
    await setup({ players: 40, teams: ['LAC'], rounds: 2 });
    await startDraft({ seed: 9 });
    for (let guard = 0; guard < 100 && draftStore.get().session!.status === 'running'; guard++) {
      await whenIdle();
      if (!autoPickNow()) break;
    }
    const s = draftStore.get().session!;
    expect(s.status).toBe('finished');
    expect(s.endReason).toBe('pool_empty');
    expect(s.results).toHaveLength(40);
  });
});

describe('Autosave', () => {
  it('schreibt bei vielen schnellen Änderungen immer den neuesten Stand', async () => {
    const storage = await setup();
    await startDraft({ seed: 10 });
    await whenIdle();
    const s = draftStore.get().session!;
    for (let i = 0; i < 20; i++) void saveSession({ ...s, id: `x${i}` });
    await whenSaved();
    const raw = (await storage.get(KEYS.activeDraft)) as { id: string };
    expect(raw.id).toBe('x19');
  });
});

describe('Voreinstellungen', () => {
  it('ersetzt ungültige Werte durch Standardwerte', () => {
    expect(sanitizePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs({ userTeams: ['LAC', 'XXX', 'WSH', 'LAC'], rounds: 99, tempo: 'rasant', randomness: 'wild' })).toEqual({
      userTeams: ['LAC', 'WAS'],
      rounds: 7,
      tempo: 'normal',
      randomness: 'realistic',
    });
    expect(sanitizePrefs({ rounds: 0 }).rounds).toBe(1);
  });
});
