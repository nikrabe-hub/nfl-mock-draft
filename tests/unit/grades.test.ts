import { describe, expect, it } from 'vitest';
import { applyAiPick, applyPick, createSession, type DraftSession } from '../../src/draft/engine';
import { GRADES, WEIGHT_NEED, WEIGHT_VALUE, gradeDraft, gradeFor, gradeIndex, gradeTone, valueScore } from '../../src/draft/grades';
import { resolveNeeds } from '../../src/draft/needs';
import { makeBoard, makeDraftOrder } from './helpers';

function make(rounds = 1, seed = 5): DraftSession {
  const r = createSession({
    order: makeDraftOrder().picks,
    players: makeBoard(300).players,
    needs: resolveNeeds(undefined),
    year: 2027,
    config: { rounds, userTeams: ['LAC'], randomness: 'realistic', seed },
    now: new Date('2026-10-19T10:00:00Z'),
  });
  if (!r.ok) throw new Error(r.error);
  return r.session;
}
function playAll(s: DraftSession): DraftSession {
  let cur = s;
  for (let g = 0; g < 1000 && cur.status === 'running'; g++) cur = applyAiPick(cur);
  return cur;
}

describe('Noten-Skala', () => {
  it('hat 15 Stufen von A+ bis F-', () => {
    expect(GRADES).toHaveLength(15);
    expect(GRADES[0]).toBe('A+');
    expect(GRADES[14]).toBe('F-');
  });
  it('ordnet Punkte monoton den Noten zu', () => {
    let last = -1;
    for (let s = 100; s >= 0; s -= 0.5) {
      const i = gradeIndex(gradeFor(s));
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
    expect(gradeFor(100)).toBe('A+');
    expect(gradeFor(0)).toBe('F-');
    expect(gradeFor(Number.NaN)).toBe('F-');
  });
  it('Gewichte ergeben 100 %', () => {
    expect(WEIGHT_NEED + WEIGHT_VALUE).toBeCloseTo(1, 10);
    expect(WEIGHT_NEED).toBeCloseTo(0.6, 10);
  });
  it('Farbton: A/B gut, C mittel, D/F schwach', () => {
    expect(gradeTone('A-')).toBe('good');
    expect(gradeTone('B+')).toBe('good');
    expect(gradeTone('C')).toBe('ok');
    expect(gradeTone('D+')).toBe('bad');
    expect(gradeTone('F-')).toBe('bad');
  });
});

describe('Value-Wert', () => {
  it('Rank = Pick ist fair, Steal besser, Reach schlechter', () => {
    expect(valueScore(20, 20)).toBeCloseTo(82, 5);
    expect(valueScore(5, 20)).toBeGreaterThan(valueScore(20, 20));
    expect(valueScore(60, 20)).toBeLessThan(valueScore(20, 20));
  });
  it('bleibt zwischen 0 und 100, auch bei unsinnigen Werten', () => {
    for (const [r, p] of [[1, 250], [250, 1], [0, 10], [-3, 10], [Number.NaN, 4]] as const) {
      const v = valueScore(r, p);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('gradeDraft', () => {
  it('bewertet jeden gemachten Pick und jedes Team mit Picks', () => {
    const s = playAll(make(2));
    const g = gradeDraft(s);
    expect(g.picks).toHaveLength(s.results.length);
    expect(g.picks.every((p) => p !== undefined)).toBe(true);
    const teams = new Set(s.order.slice(0, s.results.length).map((o) => o.team));
    expect(Object.keys(g.teams).sort()).toEqual([...teams].sort());
  });

  it('ist ein reiner Vergleich ohne Zufall: gleicher Draft, gleiche Noten', () => {
    const s = playAll(make(1));
    expect(gradeDraft(s)).toEqual(gradeDraft(s));
  });

  it('Pick auf das erste Need schlägt Pick auf eine Position ohne Need (bei gleichem Value)', () => {
    const base = make(1);
    const slot = base.order[0];
    const need = base.needs[slot.team][0];
    const forNeed = base.pool.find((p) => p.pos === need);
    const noNeed = base.pool.find((p) => !base.needs[slot.team].includes(p.pos) && p.altPos === undefined);
    expect(forNeed && noNeed).toBeTruthy();
    // Beide Spieler bekommen denselben Rank, damit nur das Need den Unterschied macht.
    const pool = base.pool.map((p) => (p.id === forNeed!.id || p.id === noNeed!.id ? { ...p, rank: 10 } : p));
    const a = applyPick({ ...base, pool }, forNeed!.id);
    const b = applyPick({ ...base, pool }, noNeed!.id);
    if (!a.ok || !b.ok) throw new Error('Pick fehlgeschlagen');
    const ga = gradeDraft(a.session).picks[0]!;
    const gb = gradeDraft(b.session).picks[0]!;
    expect(ga.needScore).toBe(100);
    expect(ga.needPos).toBe(need);
    expect(gb.needPos).toBeNull();
    expect(ga.score).toBeGreaterThan(gb.score);
    expect(gradeIndex(ga.grade)).toBeLessThan(gradeIndex(gb.grade));
  });

  it('Steal (Rank deutlich vor dem Pick) bekommt einen höheren Value-Wert als ein Reach', () => {
    const base = make(1);
    const slot = base.order[5];
    const need = base.needs[slot.team][0];
    const cands = base.pool.filter((p) => p.pos === need);
    expect(cands.length).toBeGreaterThan(1);
    const [x, y] = cands;
    const pool = base.pool.map((p) => (p.id === x.id ? { ...p, rank: 1 } : p.id === y.id ? { ...p, rank: 120 } : p));
    // bis kurz vor Pick 6 mit der KI spielen, dann gezielt wählen
    let s: DraftSession = { ...base, pool };
    while (s.results.length < 5) s = applyAiPick(s);
    if (s.results.some((r) => r.playerId === x.id || r.playerId === y.id)) return; // KI hat einen schon genommen – Test nicht aussagekräftig
    const steal = applyPick(s, x.id);
    const reach = applyPick(s, y.id);
    if (!steal.ok || !reach.ok) throw new Error('Pick fehlgeschlagen');
    const gs = gradeDraft(steal.session).picks[5]!;
    const gr = gradeDraft(reach.session).picks[5]!;
    expect(gs.delta).toBeGreaterThan(0);
    expect(gr.delta).toBeLessThan(0);
    expect(gs.valueScore).toBeGreaterThan(gr.valueScore);
  });

  it('ein zweiter Spieler derselben Position zählt weniger als der erste', () => {
    const s = playAll(make(7));
    const g = gradeDraft(s);
    for (const t of Object.values(g.teams)) {
      const seen = new Map<string, number>();
      for (const p of t.picks) {
        if (p.needPos) {
          const n = seen.get(p.needPos) ?? 0;
          if (n === 0) expect(p.needScore).toBeGreaterThanOrEqual(60);
          else expect(p.needScore).toBeLessThanOrEqual(55);
          seen.set(p.needPos, n + 1);
        }
      }
    }
  });

  it('Noten sind überall im erlaubten Bereich und über viele Drafts nicht degeneriert', () => {
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 6; seed++) {
      const g = gradeDraft(playAll(make(3, seed)));
      for (const t of Object.values(g.teams)) {
        expect(t.score).toBeGreaterThanOrEqual(0);
        expect(t.score).toBeLessThanOrEqual(100);
        expect(GRADES).toContain(t.grade);
        counts.set(t.grade, (counts.get(t.grade) ?? 0) + 1);
      }
    }
    // Nicht alle Teams dieselbe Note, und nicht alles extrem.
    expect(counts.size).toBeGreaterThanOrEqual(4);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const extreme = (counts.get('A+') ?? 0) + (counts.get('F-') ?? 0) + (counts.get('F') ?? 0);
    expect(extreme / total).toBeLessThan(0.2);
  });

  it('covered/open teilen die Needs vollständig auf', () => {
    const s = playAll(make(3));
    const g = gradeDraft(s);
    for (const t of Object.values(g.teams)) {
      const needs = s.needs[t.team];
      expect([...t.covered, ...t.open].sort()).toEqual([...needs].sort());
    }
  });

  it('unfertiger Draft: nur gemachte Picks werden bewertet', () => {
    let s = make(1);
    for (let i = 0; i < 4; i++) s = applyAiPick(s);
    const g = gradeDraft(s);
    expect(g.picks).toHaveLength(4);
    expect(Object.values(g.teams).reduce((a, t) => a + t.picks.length, 0)).toBe(4);
  });
});
