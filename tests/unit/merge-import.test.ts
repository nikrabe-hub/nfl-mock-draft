import { describe, expect, it } from 'vitest';
import { parseCsv, parseImportText, planImport } from '../../src/data/importer';
import { mergePlayers, withPosRanks } from '../../src/data/merge';
import { mergeOverlay } from '../../src/data/loader';
import type { Player } from '../../src/data/types';
import { makePlayer } from './helpers';

const base = (): Player[] => [
  makePlayer(1, { name: 'Anna Alpha', college: 'Ohio State', pos: 'QB', rank: 1, adp: 2.5, profile: { strengths: 'Arm' } }),
  makePlayer(2, { name: 'Ben Beta', college: 'Texas', pos: 'EDGE', rank: 2, adp: 3.1 }),
  makePlayer(3, { name: 'Cem Gamma', college: 'LSU', pos: 'OT', rank: 3, manual: ['rank'] }),
];

describe('Zusammenführen: Modus scrape (Daten-Job)', () => {
  it('aktualisiert Rank und Stammdaten, behält ADP und Profil', () => {
    const r = mergePlayers(base(), [{ name: 'Anna Alpha', college: 'Ohio State', pos: 'QB', rank: 4, heightIn: 75 }], 'scrape');
    const anna = r.players.find((p) => p.name === 'Anna Alpha')!;
    expect(anna.rank).toBe(4);
    expect(anna.heightIn).toBe(75);
    expect(anna.adp).toBe(2.5);
    expect(anna.profile).toEqual({ strengths: 'Arm' });
    expect(r.updated).toHaveLength(1);
    expect(r.updated[0].changes.map((c) => c.field).sort()).toEqual(['heightIn', 'rank']);
  });

  it('überschreibt keine manuell korrigierten Felder', () => {
    const r = mergePlayers(base(), [{ name: 'Cem Gamma', college: 'LSU', pos: 'OT', rank: 9 }], 'scrape');
    expect(r.players.find((p) => p.name === 'Cem Gamma')!.rank).toBe(3);
  });

  it('markiert verschwundene Spieler als nicht mehr gelistet, statt sie zu löschen', () => {
    const r = mergePlayers(base(), [{ name: 'Anna Alpha', college: 'Ohio State', pos: 'QB', rank: 1 }], 'scrape');
    expect(r.players).toHaveLength(3);
    expect(r.notListed.sort()).toHaveLength(2);
    expect(r.players.find((p) => p.name === 'Ben Beta')!.notListed).toBe(true);
    // nicht mehr gelistete Spieler stehen am Ende
    expect(r.players[0].name).toBe('Anna Alpha');
  });

  it('nimmt wieder gelistete Spieler zurück', () => {
    const first = mergePlayers(base(), [{ name: 'Anna Alpha', college: 'Ohio State', pos: 'QB', rank: 1 }], 'scrape');
    const second = mergePlayers(first.players, [{ name: 'Ben Beta', college: 'Texas', pos: 'EDGE', rank: 2 }, { name: 'Anna Alpha', college: 'Ohio State', pos: 'QB', rank: 1 }], 'scrape');
    expect(second.relisted).toHaveLength(1);
    expect(second.players.find((p) => p.name === 'Ben Beta')!.notListed).toBeUndefined();
  });

  it('ergänzt neue Spieler', () => {
    const r = mergePlayers(base(), [{ name: 'Dora Delta', college: 'Georgia', pos: 'CB', rank: 7 }], 'scrape');
    expect(r.added).toHaveLength(1);
    expect(r.added[0].id).toBe('dora-delta__georgia');
  });

  it('erkennt einen College-Wechsel über den eindeutigen Namen', () => {
    const before = base();
    const oldId = before.find((p) => p.name === 'Ben Beta')!.id;
    const r = mergePlayers(before, [{ name: 'Ben Beta', college: 'Alabama', pos: 'EDGE', rank: 2 }], 'scrape');
    expect(r.added).toHaveLength(0);
    const ben = r.players.find((p) => p.name === 'Ben Beta')!;
    expect(ben.college).toBe('Alabama');
    expect(ben.id).toBe(oldId); // ID bleibt stabil
    expect(ben.adp).toBe(3.1);
  });

  it('legt zwei gleichnamige Spieler an verschiedenen Colleges getrennt an', () => {
    const r = mergePlayers([], [
      { name: 'Max Muster', college: 'Utah', pos: 'WR', rank: 10 },
      { name: 'Max Muster', college: 'Iowa', pos: 'CB', rank: 20 },
    ], 'scrape');
    expect(r.added).toHaveLength(2);
  });

  it('ist ohne Änderungen stabil', () => {
    const r = mergePlayers(base(), base().map((p) => ({ ...p })), 'scrape');
    expect(r.updated).toHaveLength(0);
    expect(r.unchanged).toBe(3);
    expect(r.notListed).toHaveLength(0);
  });
});

describe('Zusammenführen: Modus overlay (eigene Importe)', () => {
  it('lässt gelieferte Felder gewinnen, auch ADP und Profil', () => {
    const r = mergePlayers(base(), [{ name: 'Anna Alpha', adp: 9.9, profile: { weaknesses: 'Tempo' } }], 'overlay');
    const anna = r.players.find((p) => p.name === 'Anna Alpha')!;
    expect(anna.adp).toBe(9.9);
    expect(anna.profile).toEqual({ strengths: 'Arm', weaknesses: 'Tempo' });
  });

  it('markiert nichts als nicht mehr gelistet', () => {
    const r = mergePlayers(base(), [{ name: 'Anna Alpha', adp: 1.1 }], 'overlay');
    expect(r.notListed).toHaveLength(0);
    expect(r.players.every((p) => !p.notListed)).toBe(true);
  });

  it('führt mehrere Importe nacheinander zusammen', () => {
    const merged = mergeOverlay([{ name: 'Anna Alpha', adp: 5 }], [{ name: 'Anna Alpha', age: 21, profile: { strengths: 'x' } }, { name: 'Neu Neu', pos: 'QB', college: 'X', rank: 99 }]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ adp: 5, age: 21, profile: { strengths: 'x' } });
  });
});

describe('Position-Rank', () => {
  it('zählt je Position nach Rank', () => {
    const ps = withPosRanks([
      makePlayer(1, { pos: 'QB', rank: 5 }),
      makePlayer(2, { pos: 'QB', rank: 1 }),
      makePlayer(3, { pos: 'WR', rank: 2 }),
      makePlayer(4, { pos: 'QB', rank: 3, notListed: true }),
    ]);
    const byRank = (r: number) => ps.find((p) => p.rank === r)!;
    expect(byRank(1).posRank).toBe(1);
    expect(byRank(5).posRank).toBe(2);
    expect(byRank(2).posRank).toBe(1);
    expect(byRank(3).posRank).toBeUndefined();
  });
});

describe('Import: Text einlesen', () => {
  it('liest CSV mit Semikolon, deutschen Spaltennamen und Anführungszeichen', () => {
    const csv = 'Name;Position;Schule;Rang;Größe;Gewicht;Stärken\n"Anna Alpha";QB;Ohio State;4;6\'4";222 lbs;"Arm, Kopf"\n';
    const r = parseImportText(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.format).toBe('csv');
    expect(r.rows[0].player).toMatchObject({ name: 'Anna Alpha', pos: 'QB', college: 'Ohio State', rank: 4, heightIn: 76, weightLb: 222, profile: { strengths: 'Arm, Kopf' } });
  });

  it('liest Tab-getrennten Text (aus Excel kopiert)', () => {
    const r = parseImportText('Name\tPos\tCollege\tRank\tADP\nAnna Alpha\tED\tTexas\t2\t3,5');
    expect(r.ok && r.rows[0].player).toMatchObject({ pos: 'EDGE', rank: 2, adp: 3.5 });
  });

  it('liest JSON als Liste und als {players: []}', () => {
    const a = parseImportText('[{"name":"Anna Alpha","adp":2}]');
    expect(a.ok && a.rows).toHaveLength(1);
    const b = parseImportText('{"players":[{"name":"Anna Alpha","heightIn":76,"profile":{"comparison":"X"}}]}');
    expect(b.ok && b.rows[0].player).toMatchObject({ heightIn: 76, profile: { comparison: 'X' } });
  });

  it('meldet verständliche Fehler für unbrauchbare Eingaben', () => {
    expect(parseImportText('')).toMatchObject({ ok: false, code: 'empty' });
    expect(parseImportText('   \n ')).toMatchObject({ ok: false, code: 'empty' });
    expect(parseImportText('{kaputt')).toMatchObject({ ok: false, code: 'not_parsable' });
    expect(parseImportText('{"spieler": 5}')).toMatchObject({ ok: false, code: 'not_parsable' });
    expect(parseImportText('Pos;Rank\nQB;1')).toMatchObject({ ok: false, code: 'not_parsable' });
    expect(parseImportText('Name')).toMatchObject({ ok: false, code: 'not_parsable' });
    expect(parseImportText('x'.repeat(2_000_001))).toMatchObject({ ok: false, code: 'too_large' });
  });

  it('verwirft einzelne fehlerhafte Zeilen mit Grund und behält die guten', () => {
    const r = parseImportText('Name,Pos,College,Rank,Height\nAnna Alpha,QB,Texas,1,6-4\nBen,XX,Texas,2,6-0\nCem,QB,Texas,abc,6-0\nDora,QB,Texas,4,riesig\n,QB,Texas,5,6-0');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    expect(r.issues.map((i) => i.code)).toEqual(['bad_position', 'bad_rank', 'bad_height', 'missing_name']);
    expect(r.issues[0]).toMatchObject({ row: 3, name: 'Ben' });
  });

  it('verarbeitet Anführungszeichen und Zeilenumbrüche in CSV-Zellen', () => {
    expect(parseCsv('a,b\n"x, y","z ""q"""\n')).toEqual([['a', 'b'], ['x, y', 'z "q"']]);
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('Import: Vorschau', () => {
  const parse = (t: string) => {
    const r = parseImportText(t);
    if (!r.ok) throw new Error('parse');
    return r;
  };

  it('zeigt Änderungen, neue Spieler und abgelehnte Zeilen, ohne etwas zu ändern', () => {
    const current = base();
    const snapshot = JSON.stringify(current);
    const plan = planImport(
      current,
      parse('Name,Pos,College,Rank,ADP\nAnna Alpha,,,,7.5\nDora Delta,CB,Georgia,12,20\nUnbekannt,,,,3\nBen Beta,,,,3.1'),
    );
    expect(JSON.stringify(current)).toBe(snapshot);
    expect(plan.updated.map((u) => u.name)).toEqual(['Anna Alpha']);
    expect(plan.updated[0].changes).toEqual([{ field: 'adp', from: 2.5, to: 7.5 }]);
    expect(plan.added).toEqual([{ name: 'Dora Delta', pos: 'CB', college: 'Georgia', rank: 12 }]);
    expect(plan.unchanged).toBe(1); // Ben Beta: gleicher ADP
    expect(plan.rejected.map((r) => [r.name, r.code])).toEqual([['Unbekannt', 'incomplete_new_player']]);
    expect(plan.accepted).toHaveLength(3);
  });
});
