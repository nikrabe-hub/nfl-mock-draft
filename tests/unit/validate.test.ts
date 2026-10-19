import { describe, expect, it } from 'vitest';
import { validateBigBoard, validateCollegeStats, validateDraftOrder } from '../../src/data/validate';
import { makeBoard, makeDraftOrder, META, NOW } from './helpers';

const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : r.issues!.map((i) => i.code));

describe('Draft-Reihenfolge prüfen', () => {
  it('akzeptiert eine gültige Reihenfolge', () => {
    const r = validateDraftOrder(makeDraftOrder(), NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.picks).toHaveLength(224);
      expect(r.data.picks[8].from).toBe('BUF');
    }
  });

  it('lässt "from" weg, wenn es dem Besitzer entspricht', () => {
    const o = makeDraftOrder();
    o.picks[0].from = o.picks[0].team;
    const r = validateDraftOrder(o, NOW);
    expect(r.ok && r.data.picks[0].from).toBeFalsy();
  });

  it('lehnt Nicht-Objekte und fehlende Metadaten ab', () => {
    expect(codes(validateDraftOrder(null))).toEqual(['not_object']);
    expect(codes(validateDraftOrder({ picks: [] }))).toContain('meta_missing');
    expect(codes(validateDraftOrder({ ...makeDraftOrder(), abgerufenAm: 'gestern' }))).toContain('meta_bad_date');
    expect(codes(validateDraftOrder({ ...makeDraftOrder(), version: 0 }))).toContain('meta_bad_version');
    expect(codes(validateDraftOrder({ ...makeDraftOrder(), abgerufenAm: '2030-01-01T00:00:00Z' }, NOW))).toContain('meta_bad_date');
  });

  it('lehnt doppelte Picknummern ab', () => {
    const o = makeDraftOrder();
    o.picks[5].pick = 4;
    expect(codes(validateDraftOrder(o, NOW))).toContain('dup_pick');
  });

  it('lehnt Lücken in der Nummerierung ab', () => {
    const o = makeDraftOrder();
    o.picks.splice(40, 1);
    o.picks.push({ pick: 300, round: 7, team: 'KC' });
    expect(codes(validateDraftOrder(o, NOW))).toContain('gap_pick');
  });

  it('lehnt unbekannte Teams und Runden ab', () => {
    const o = makeDraftOrder();
    o.picks[3].team = 'XXX';
    expect(codes(validateDraftOrder(o, NOW))).toContain('bad_team');
    const o2 = makeDraftOrder();
    o2.picks[3].round = 9;
    expect(codes(validateDraftOrder(o2, NOW))).toContain('bad_round');
  });

  it('lehnt zu wenige Picks oder fehlende Runden ab', () => {
    const o = makeDraftOrder();
    o.picks = o.picks.slice(0, 100);
    expect(codes(validateDraftOrder(o, NOW))).toContain('too_few');
    const o2 = makeDraftOrder();
    o2.picks = o2.picks.filter((p) => p.round !== 5).map((p, i) => ({ ...p, pick: i + 1 }));
    o2.picks = o2.picks.concat(Array.from({ length: 40 }, (_, i) => ({ pick: o2.picks.length + i + 1, round: 7, team: 'KC' })));
    expect(codes(validateDraftOrder(o2, NOW))).toContain('round_size');
  });

  it('verlangt, dass alle 32 Teams vorkommen', () => {
    const o = makeDraftOrder();
    o.picks = o.picks.map((p) => (p.team === 'KC' ? { ...p, team: 'DEN' } : p)).map((p) => (p.from === 'KC' ? { ...p, from: 'DEN' } : p));
    expect(codes(validateDraftOrder(o, NOW))).toContain('teams_incomplete');
  });

  it('lehnt Runden in falscher Reihenfolge ab', () => {
    const o = makeDraftOrder();
    o.picks[40].round = 1;
    expect(codes(validateDraftOrder(o, NOW))).toContain('round_order');
  });
});

describe('Big Board prüfen', () => {
  it('akzeptiert ein gültiges Board', () => {
    const r = validateBigBoard(makeBoard(), { now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.players).toHaveLength(220);
  });

  it('verlangt mindestens 100 Spieler (Tankathon listet derzeit 162)', () => {
    expect(codes(validateBigBoard(makeBoard(80), { now: NOW }))).toEqual(['too_few']);
    expect(validateBigBoard(makeBoard(162), { now: NOW }).ok).toBe(true);
    expect(validateBigBoard(makeBoard(80), { now: NOW, minPlayers: 50 }).ok).toBe(true);
  });

  it('prüft alternative Positionen und entfernt Doppelte', () => {
    const b = makeBoard();
    b.players[0].altPos = ['IOL', 'IOL', b.players[0].pos];
    const r = validateBigBoard(b, { now: NOW });
    expect(r.ok && r.data.players[0].altPos).toEqual(['IOL', ...(b.players[0].pos === 'IOL' ? [] : [])].filter((x) => x !== b.players[0].pos));
    const b2 = makeBoard();
    b2.players[0].altPos = ['QQ'];
    expect(codes(validateBigBoard(b2, { now: NOW }))).toContain('bad_pos');
  });

  it('lehnt doppelte Ränge ab', () => {
    const b = makeBoard();
    b.players[10].rank = 3;
    expect(codes(validateBigBoard(b, { now: NOW }))).toContain('dup_rank');
  });

  it('ignoriert nicht mehr gelistete Spieler bei den Rängen', () => {
    const b = makeBoard();
    b.players[10].rank = 3;
    b.players[10].notListed = true;
    expect(validateBigBoard(b, { now: NOW }).ok).toBe(true);
  });

  it('lehnt doppelte IDs, unbekannte Positionen und unplausible Werte ab', () => {
    const b = makeBoard();
    b.players[1].id = b.players[0].id;
    expect(codes(validateBigBoard(b, { now: NOW }))).toContain('dup_id');
    const b2 = makeBoard();
    b2.players[2].pos = 'XX';
    expect(codes(validateBigBoard(b2, { now: NOW }))).toContain('bad_pos');
    const b3 = makeBoard();
    b3.players[2].weightLb = 20;
    expect(codes(validateBigBoard(b3, { now: NOW }))).toContain('bad_value');
    const b4 = makeBoard();
    b4.players[2].adp = -5;
    expect(codes(validateBigBoard(b4, { now: NOW }))).toContain('bad_value');
  });

  it('lehnt Einträge ohne Namen oder College ab und füllt fehlende IDs', () => {
    const b = makeBoard();
    (b.players[0] as unknown as Record<string, unknown>).name = '';
    expect(codes(validateBigBoard(b, { now: NOW }))).toContain('bad_item');
    const b2 = makeBoard();
    delete (b2.players[0] as unknown as Record<string, unknown>).id;
    const r = validateBigBoard(b2, { now: NOW });
    expect(r.ok && r.data.players[0].id).toBeTruthy();
  });

  it('meldet höchstens 20 Probleme', () => {
    const b = makeBoard(300);
    b.players.forEach((p) => (p.pos = 'XX'));
    const r = validateBigBoard(b, { now: NOW });
    expect(!r.ok && r.issues.length).toBe(20);
  });
});

describe('College-Statistiken prüfen', () => {
  const valid = { ...META, season: 2026, stats: { 'a__b': { pass_yds: 3120, cmp_pct: 66.1 } } };

  it('akzeptiert gültige Werte', () => {
    expect(validateCollegeStats(valid, NOW).ok).toBe(true);
  });

  it('lehnt Text, unsinnige Zahlen und falsche Prozentwerte ab', () => {
    expect(codes(validateCollegeStats({ ...valid, stats: { x: { pass_yds: 'viel' } } }, NOW))).toContain('bad_stat');
    expect(codes(validateCollegeStats({ ...valid, stats: { x: { pass_yds: 99999 } } }, NOW))).toContain('bad_stat');
    expect(codes(validateCollegeStats({ ...valid, stats: { x: { cmp_pct: 166 } } }, NOW))).toContain('bad_stat');
    expect(codes(validateCollegeStats({ ...valid, stats: { x: 5 } }, NOW))).toContain('bad_stat');
    expect(codes(validateCollegeStats({ ...valid, season: 1999 }, NOW))).toContain('bad_value');
  });
});
