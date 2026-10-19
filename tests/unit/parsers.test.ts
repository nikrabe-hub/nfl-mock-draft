// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBigBoard, parseFullDraft } from '../../scripts/data-update/parsers/tankathon';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

describe('Tankathon Full Draft', () => {
  const r = parseFullDraft(fixture('tankathon-full-draft.html'));

  it('liest Jahr, Runden, Picknummern und Teams', () => {
    expect(r.year).toBe(2027);
    expect(r.picks.map((p) => [p.pick, p.round, p.team])).toEqual([
      [1, 1, 'LAC'],
      [5, 1, 'WAS'], // WSH -> WAS
      [6, 1, 'NYJ'],
      [7, 1, 'PHI'],
      [96, 3, 'MIN'],
      [97, 3, 'PHI'],
    ]);
  });

  it('erkennt getradete Picks (aktueller Besitzer + ursprüngliches Team)', () => {
    expect(r.picks.find((p) => p.pick === 6)).toEqual({ pick: 6, round: 1, team: 'NYJ', from: 'DAL' });
    expect(r.picks.find((p) => p.pick === 1)).not.toHaveProperty('from');
  });

  it('wirft verständliche Fehler, wenn die Seite anders aufgebaut ist', () => {
    expect(() => parseFullDraft('<html><title>Full 2027 NFL Draft Order</title><body>nix</body></html>')).toThrow(/Runden/);
    expect(() => parseFullDraft('<html><body><div class="full-draft-round"></div></body></html>')).toThrow(/Draft-Jahr/);
    const broken = fixture('tankathon-full-draft.html').replace(/nfl\/lac\.svg/, 'nfl/x.gif');
    expect(() => parseFullDraft(broken)).toThrow(/Pick nicht lesbar/);
  });
});

describe('Tankathon Big Board', () => {
  const r = parseBigBoard(fixture('tankathon-big-board.html'));
  const by = (name: string) => r.players.find((p) => p.name === name)!;

  it('liest nur die Hauptliste: keine Wiederholungen, keine späteren Jahrgänge, keine "NR"', () => {
    expect(r.players.map((p) => p.rank)).toEqual([1, 2, 4, 11, 35, 64, 155]);
    expect(r.players.some((p) => p.name === 'Harlem Berry' || p.name === 'Some Qb')).toBe(false);
  });

  it('liest Name, Position, College, Größe und Gewicht', () => {
    expect(by('Jeremiah Smith')).toEqual({ name: 'Jeremiah Smith', college: 'Ohio State', pos: 'WR', rank: 1, heightIn: 76, weightLb: 222 });
    expect(by('Mario Craver')).toMatchObject({ college: 'Texas A&M', heightIn: 69, weightLb: 165 }); // HTML-Entität
  });

  it('vereinheitlicht Positionen und merkt sich Zweitpositionen', () => {
    expect(by('Will Echoles').pos).toBe('DI'); // DL -> DI
    expect(by('Colin Simmons').pos).toBe('EDGE');
    expect(by('Cayden Green')).toMatchObject({ pos: 'OT', altPos: ['IOL'] });
  });

  it('lässt fehlende Werte leer, statt sie zu erfinden', () => {
    const leigh = by('Desmeal Leigh');
    expect(leigh.heightIn).toBe(79);
    expect(leigh).not.toHaveProperty('weightLb');
    expect(r.stats['desmeal-leigh__youngstown-state']).toBeUndefined();
  });

  it('liest Statistiken (Saisonsummen) mit vereinheitlichten Namen und ignoriert leere Werte', () => {
    expect(r.stats['jeremiah-smith__ohio-state']).toEqual({ rec: 52, rec_yds: 984, td: 12, avg: 18.9, rush_yds: 7 });
    expect(r.stats['colin-simmons__texas']).toEqual({ tackles: 25, sacks: 10.5, pass_def: 0, int: 0, ff: 2 });
    expect(r.stats['jordan-seaton__lsu']).toBeUndefined(); // nur "GAMES" ohne Wert
    expect(r.stats['mario-craver__texas-am']).toEqual({ rec: 24, rec_yds: 241 }); // "REC YDS" == "REC Yds"
  });

  it('wirft Fehler bei unbekannter Position oder fehlender Liste', () => {
    expect(() => parseBigBoard('<html><body></body></html>')).toThrow(/Spielerliste/);
    const broken = fixture('tankathon-big-board.html').replace('WR | Ohio State', 'ZZ | Ohio State');
    expect(() => parseBigBoard(broken)).toThrow(/Position unbekannt/);
  });
});
