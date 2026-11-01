import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { dataStore } from '../../src/data/loader';
import { discardDraft, draftStore, startDraft, whenIdle } from '../../src/draft/controller';
import { DEFAULT_PREFS, prefsStore } from '../../src/draft/prefs';
import { useStorageForTests, whenSaved } from '../../src/draft/persist';
import {
  applyOrderOverride,
  loadOverrides,
  overrideCounts,
  overridesStore,
  resetAllNeeds,
  resetOrder,
  resetTeamNeeds,
  sanitizeOrderOverride,
  setPickOwner,
  setTeamNeeds,
  whenOverridesSaved,
} from '../../src/draft/overrides';
import { createStorage } from '../../src/storage/db';
import { KEYS } from '../../src/storage/keys';
import { makeBoard, makeDraftOrder } from './helpers';

describe('Pick-Besitzer ändern', () => {
  it('prüft Eingaben streng', () => {
    expect(sanitizeOrderOverride({ '1': 'LAC', '2': 'XXX', abc: 'DAL', '3.5': 'DAL', '0': 'DAL', '5': 5 })).toEqual({ '1': 'LAC' });
    expect(sanitizeOrderOverride(null)).toEqual({});
    expect(sanitizeOrderOverride(['LAC'])).toEqual({});
    expect(sanitizeOrderOverride({ '7': 'WSH' })).toEqual({ '7': 'WAS' }); // Alias wird normalisiert
  });
  it('wendet Änderungen an und behält die Herkunft nachvollziehbar', () => {
    const picks = [
      { pick: 1, round: 1, team: 'LAC' },
      { pick: 2, round: 1, team: 'MIA', from: 'DAL' },
      { pick: 3, round: 1, team: 'TEN' },
    ];
    const out = applyOrderOverride(picks, { '1': 'NYJ', '2': 'DAL', '3': 'TEN', '99': 'LAC' });
    expect(out[0]).toEqual({ pick: 1, round: 1, team: 'NYJ', from: 'LAC' });
    expect(out[1]).toEqual({ pick: 2, round: 1, team: 'DAL' }); // zurück zum Ursprungsteam: Herkunft entfällt
    expect(out[2]).toEqual(picks[2]);
    expect(picks[0].team).toBe('LAC'); // Eingabe bleibt unverändert
  });
});

describe('Overrides speichern', () => {
  beforeEach(async () => {
    useStorageForTests(await createStorage({ prefer: 'memory' }));
    resetAllNeeds();
    resetOrder();
    await whenOverridesSaved();
  });

  it('Needs: 3–5 verschiedene gültige Positionen', () => {
    expect(setTeamNeeds('LAC', ['QB', 'WR'])).toEqual({ ok: false, error: 'count' });
    expect(setTeamNeeds('LAC', ['QB', 'WR', 'TE', 'OT', 'S', 'CB'])).toEqual({ ok: false, error: 'count' });
    expect(setTeamNeeds('LAC', ['QB', 'QB', 'TE'])).toEqual({ ok: false, error: 'duplicate' });
    expect(setTeamNeeds('LAC', ['QB', 'XX', 'TE'])).toEqual({ ok: false, error: 'invalid_position' });
    expect(setTeamNeeds('ZZZ', ['QB', 'WR', 'TE'])).toEqual({ ok: false, error: 'unknown_team' });
    expect(overridesStore.get().needs).toEqual({});
    expect(setTeamNeeds('LAC', ['QB', 'WR', 'TE'])).toEqual({ ok: true });
    expect(overridesStore.get().needs.LAC).toEqual(['QB', 'WR', 'TE']);
    resetTeamNeeds('LAC');
    expect(overridesStore.get().needs).toEqual({});
  });

  it('bleibt nach "Neuladen" erhalten und lässt sich zurücksetzen (Key wird entfernt)', async () => {
    const storage = await createStorage({ prefer: 'memory' });
    useStorageForTests(storage);
    setTeamNeeds('NYJ', ['CB', 'S', 'LB']);
    setPickOwner(5, 'NYJ', 'WAS');
    await whenOverridesSaved();
    expect(await storage.get(KEYS.needsOverride)).toEqual({ NYJ: ['CB', 'S', 'LB'] });
    expect(await storage.get(KEYS.orderOverride)).toEqual({ '5': 'NYJ' });
    overridesStore.set({ needs: {}, order: {} });
    await loadOverrides();
    expect(overrideCounts(overridesStore.get())).toEqual({ needs: 1, picks: 1 });
    setPickOwner(5, 'WAS', 'WAS'); // zurück zum Besitzer aus den Daten
    resetAllNeeds();
    await whenOverridesSaved();
    expect(await storage.get(KEYS.needsOverride)).toBeUndefined();
    expect(await storage.get(KEYS.orderOverride)).toBeUndefined();
  });

  it('ein neuer Draft nutzt eigene Needs und die geänderte Reihenfolge', async () => {
    const storage = await createStorage({ prefer: 'memory' });
    useStorageForTests(storage);
    dataStore.set({ loaded: true, players: makeBoard(300).players, picks: makeDraftOrder().picks, draftYear: 2027 });
    prefsStore.set({ ...DEFAULT_PREFS, userTeams: ['NYJ'], rounds: 1, tempo: 'instant', tradeOffers: false });
    discardDraft();
    await whenSaved();
    const first = makeDraftOrder().picks[0];
    setTeamNeeds('NYJ', ['LB', 'S', 'TE']);
    setPickOwner(first.pick, 'NYJ', first.team);
    await whenOverridesSaved();
    expect(await startDraft({ seed: 9 })).toEqual({ ok: true });
    await whenIdle();
    const s = draftStore.get().session!;
    expect(s.needs.NYJ).toEqual(['LB', 'S', 'TE']);
    expect(s.order[0].team).toBe('NYJ');
    expect(s.order[0].from).toBe(first.team);
    // Die Daten selbst bleiben unberührt
    expect(dataStore.get().picks[0].team).toBe(first.team);
  });
});
