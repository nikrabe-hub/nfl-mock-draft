// Künstliche Testdaten (keine echten Spieler).
import { TEAMS } from '../../src/data/teams';
import { makeId } from '../../src/data/names';
import { POSITIONS } from '../../src/data/positions';
import type { BigBoardFile, DraftOrderFile, DraftPick, Player } from '../../src/data/types';

export const META = { quelle: 'Test', abgerufenAm: '2026-10-18T10:00:00.000Z', version: 1 };
export const NOW = new Date('2026-10-18T12:00:00Z');

export function makeDraftOrder(): DraftOrderFile {
  const picks: DraftPick[] = [];
  let n = 1;
  for (let round = 1; round <= 7; round++) {
    for (let i = 0; i < 32; i++) {
      const team = TEAMS[(i + round) % 32].abbr;
      const pick: DraftPick = { pick: n++, round, team };
      if (i === 8 && round === 1) pick.from = TEAMS[0].abbr; // ein getradeter Pick
      picks.push(pick);
    }
  }
  return { ...META, year: 2027, picks };
}

export function makePlayer(i: number, over: Partial<Player> = {}): Player {
  const name = `Testspieler ${String.fromCharCode(65 + (i % 26))}${i}`;
  const college = `College ${i % 40}`;
  return {
    id: makeId(name, college),
    name,
    pos: POSITIONS[i % 13],
    college,
    rank: i,
    heightIn: 70 + (i % 10),
    weightLb: 180 + (i % 120),
    ...over,
  };
}

export function makeBoard(count = 220): BigBoardFile {
  return { ...META, players: Array.from({ length: count }, (_, i) => makePlayer(i + 1)) };
}
