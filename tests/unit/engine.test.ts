import { describe, expect, it } from 'vitest';
import { TEAMS } from '../../src/data/teams';
import {
  applyAiPick,
  applyPick,
  availablePlayers,
  chooseAiPick,
  createSession,
  currentSlot,
  needBonus,
  needStatus,
  remainingPicks,
  sanitizeSession,
  scorePlayer,
  type DraftSession,
  type Randomness,
} from '../../src/draft/engine';
import { DEFAULT_NEEDS, resolveNeeds, sanitizeNeeds } from '../../src/draft/needs';
import { gauss, hash32, unit } from '../../src/draft/rng';
import { makeBoard, makeDraftOrder, makePlayer } from './helpers';

const NEEDS = resolveNeeds(undefined);

function make(over: { rounds?: number; players?: number; teams?: string[]; randomness?: Randomness; seed?: number } = {}): DraftSession {
  const r = createSession({
    order: makeDraftOrder().picks,
    players: makeBoard(over.players ?? 300).players,
    needs: NEEDS,
    year: 2027,
    config: { rounds: over.rounds ?? 7, userTeams: over.teams ?? ['LAC'], randomness: over.randomness ?? 'realistic', seed: over.seed ?? 42 },
    now: new Date('2026-10-19T10:00:00Z'),
  });
  if (!r.ok) throw new Error(r.error);
  return r.session;
}

/** Spielt den ganzen Draft durch; eigene Teams lässt der Test von der KI ziehen. */
function playAll(s: DraftSession): DraftSession {
  let cur = s;
  for (let guard = 0; guard < 1000 && cur.status === 'running'; guard++) cur = applyAiPick(cur);
  return cur;
}

describe('Zufall', () => {
  it('ist reproduzierbar und gleichverteilt', () => {
    expect(hash32(1, 'a', 2)).toBe(hash32(1, 'a', 2));
    expect(hash32(1, 'a', 2)).not.toBe(hash32(2, 'a', 2));
    const xs = Array.from({ length: 2000 }, (_, i) => unit(7, i));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it('gauss hat ungefähr Mittel 0 und Streuung 1', () => {
    const zs = Array.from({ length: 4000 }, (_, i) => gauss(3, i, 'x'));
    const mean = zs.reduce((a, b) => a + b, 0) / zs.length;
    const sd = Math.sqrt(zs.reduce((a, b) => a + (b - mean) ** 2, 0) / zs.length);
    expect(Math.abs(mean)).toBeLessThan(0.08);
    expect(sd).toBeGreaterThan(0.9);
    expect(sd).toBeLessThan(1.1);
  });
});

describe('Needs', () => {
  it('hat für alle 32 Teams 3–5 gültige Positionen', () => {
    for (const t of TEAMS) {
      const n = DEFAULT_NEEDS[t.abbr];
      expect(n, t.abbr).toBeDefined();
      expect(n.length).toBeGreaterThanOrEqual(3);
      expect(n.length).toBeLessThanOrEqual(5);
    }
  });

  it('ignoriert kaputte eigene Needs und behält die eingebauten', () => {
    expect(sanitizeNeeds('quatsch')).toEqual({});
    expect(sanitizeNeeds({ XXX: ['QB'], LAC: ['QB', 'QB', 'Torwart', 5], WSH: ['OT'] })).toEqual({ LAC: ['QB'], WAS: ['OT'] });
    const r = resolveNeeds({ LAC: ['S', 'LB'], DAL: 'kaputt' });
    expect(r.LAC).toEqual(['S', 'LB']);
    expect(r.DAL).toEqual(DEFAULT_NEEDS.DAL);
    expect(Object.keys(r)).toHaveLength(32);
  });
});

describe('Aufbau', () => {
  it('nimmt nur die gewählten Runden', () => {
    expect(make({ rounds: 1 }).order).toHaveLength(32);
    expect(make({ rounds: 3 }).order).toHaveLength(96);
    expect(make({ rounds: 7 }).order).toHaveLength(224);
  });

  it('meldet fehlende Daten statt abzustürzen', () => {
    const base = { order: makeDraftOrder().picks, players: makeBoard(50).players, needs: NEEDS, year: 2027 };
    expect(createSession({ ...base, order: [], config: { rounds: 1, userTeams: ['LAC'], randomness: 'realistic', seed: 1 } })).toEqual({ ok: false, error: 'no_picks' });
    expect(createSession({ ...base, players: [], config: { rounds: 1, userTeams: ['LAC'], randomness: 'realistic', seed: 1 } })).toEqual({ ok: false, error: 'no_players' });
    expect(createSession({ ...base, config: { rounds: 1, userTeams: [], randomness: 'realistic', seed: 1 } })).toEqual({ ok: false, error: 'no_teams' });
    expect(createSession({ ...base, config: { rounds: 99, userTeams: ['XXX', 'WSH'], randomness: 'wild' as Randomness, seed: 1 } })).toMatchObject({ ok: true });
  });

  it('lässt nicht mehr gelistete Spieler aus dem Pool', () => {
    const players = [makePlayer(1), makePlayer(2, { notListed: true }), makePlayer(3)];
    const r = createSession({ order: makeDraftOrder().picks, players, needs: NEEDS, year: 2027, config: { rounds: 1, userTeams: ['LAC'], randomness: 'realistic', seed: 1 } });
    expect(r.ok && r.session.pool.map((p) => p.rank)).toEqual([1, 3]);
  });
});

describe('KI-Wertung', () => {
  const ctx = (over = {}) => ({ needs: [] as string[], drafted: [], seed: 1, pick: 1, randomness: 'predictable' as Randomness, ...over });

  it('wertet bessere Ranks höher', () => {
    const a = scorePlayer(makePlayer(1, { pos: 'WR' }), ctx());
    const b = scorePlayer(makePlayer(30, { pos: 'WR' }), ctx());
    expect(a.total).toBeGreaterThan(b.total);
  });

  it('mischt ein vorhandenes ADP in den Wert', () => {
    const plain = scorePlayer(makePlayer(10, { pos: 'WR' }), ctx());
    const lateAdp = scorePlayer(makePlayer(10, { pos: 'WR', adp: 60 }), ctx());
    const earlyAdp = scorePlayer(makePlayer(10, { pos: 'WR', adp: 2 }), ctx());
    expect(lateAdp.total).toBeLessThan(plain.total);
    expect(earlyAdp.total).toBeGreaterThan(plain.total);
  });

  it('bevorzugt Positionen, die ein Team braucht – das erste Need stärker als das letzte', () => {
    const wr = makePlayer(5, { pos: 'WR' });
    expect(needBonus(['WR', 'OT'], [], wr)).toBeGreaterThan(needBonus(['OT', 'WR'], [], wr));
    expect(needBonus(['OT'], [], wr)).toBe(0);
    expect(needBonus(['IOL'], [], makePlayer(5, { pos: 'OT', altPos: ['IOL'] }))).toBeGreaterThan(0);
  });

  it('senkt das Need, sobald die Position besetzt ist', () => {
    const wr = makePlayer(5, { pos: 'WR' });
    const one = needBonus(['WR'], [makePlayer(1, { pos: 'WR' })], wr);
    const two = needBonus(['WR'], [makePlayer(1, { pos: 'WR' }), makePlayer(2, { pos: 'WR' })], wr);
    expect(one).toBeLessThan(needBonus(['WR'], [], wr));
    expect(two).toBe(0);
  });

  it('lässt Kicker und Punter nicht früh fallen', () => {
    const k = scorePlayer(makePlayer(20, { pos: 'K' }), ctx());
    const wr = scorePlayer(makePlayer(60, { pos: 'WR' }), ctx());
    expect(k.total).toBeLessThan(wr.total);
  });

  it('der Zufallsregler streut in drei Stufen unterschiedlich stark', () => {
    const spread = (randomness: Randomness) => {
      const vals = Array.from({ length: 300 }, (_, i) => Math.log(scorePlayer(makePlayer(10), ctx({ randomness, pick: i + 1 })).noise));
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      return Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    };
    expect(spread('predictable')).toBeLessThan(spread('realistic'));
    expect(spread('realistic')).toBeLessThan(spread('chaos'));
  });

  it('Vorhersehbar bleibt nah an der Board-Reihenfolge', () => {
    const positions = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'DI', 'LB', 'CB', 'S'];
    const players = Array.from({ length: 120 }, (_, i) => makePlayer(i + 1, { pos: positions[i % positions.length] }));
    const r = createSession({ order: makeDraftOrder().picks, players, needs: NEEDS, year: 2027, config: { rounds: 1, userTeams: ['LAC'], randomness: 'predictable', seed: 3 } });
    if (!r.ok) throw new Error('Aufbau fehlgeschlagen');
    const done = playAll(r.session);
    const devs = done.results.map((res, i) => Math.abs(done.pool.find((p) => p.id === res.playerId)!.rank - (i + 1))).sort((a, b) => a - b);
    expect(devs[Math.floor(devs.length / 2)]).toBeLessThanOrEqual(12); // typischer Pick: nah am Board
    expect(devs[devs.length - 1]).toBeLessThanOrEqual(40); // kein Ausreißer
  });

  it('liefert für gleichen Seed denselben Draft, für anderen Seed einen anderen', () => {
    const a = playAll(make({ seed: 5, randomness: 'chaos' })).results.map((r) => r.playerId);
    const b = playAll(make({ seed: 5, randomness: 'chaos' })).results.map((r) => r.playerId);
    const c = playAll(make({ seed: 6, randomness: 'chaos' })).results.map((r) => r.playerId);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('wählt bei fehlender Positions-Auswahl den besten Verfügbaren (Team mit Need ohne passende Spieler)', () => {
    const players = [makePlayer(1, { pos: 'WR' }), makePlayer(2, { pos: 'WR' }), makePlayer(3, { pos: 'CB' })];
    const s = createSession({
      order: makeDraftOrder().picks,
      players,
      needs: { ...NEEDS, [makeDraftOrder().picks[0].team]: ['QB', 'K'] },
      year: 2027,
      config: { rounds: 1, userTeams: ['LAC'], randomness: 'predictable', seed: 1 },
    });
    expect(s.ok && chooseAiPick(s.session)).toBe(players[0].id);
  });
});

describe('Ablauf', () => {
  it('ein 7-Runden-Draft läuft bis zum letzten Pick, ohne doppelte Spieler', () => {
    const done = playAll(make({ rounds: 7, players: 300 }));
    expect(done.status).toBe('finished');
    expect(done.endReason).toBe('complete');
    expect(done.results).toHaveLength(224);
    expect(new Set(done.results.map((r) => r.playerId)).size).toBe(224);
    done.results.forEach((r, i) => expect(r.pick).toBe(done.order[i].pick));
  });

  it('endet sauber, wenn der Pool kleiner ist als die Zahl der Picks – ohne Spieler zu erfinden', () => {
    const done = playAll(make({ rounds: 7, players: 100 }));
    expect(done.status).toBe('finished');
    expect(done.endReason).toBe('pool_empty');
    expect(done.results).toHaveLength(100);
    expect(availablePlayers(done)).toHaveLength(0);
    expect(currentSlot(done)).toBeNull();
  });

  it('zählt verbleibende Picks und Need-Abdeckung', () => {
    let s = make({ rounds: 2, players: 200, teams: ['LAC'] });
    const lacPicks = s.order.filter((o) => o.team === 'LAC').length;
    expect(remainingPicks(s, 'LAC')).toBe(lacPicks);
    s = playAll(s);
    expect(remainingPicks(s, 'LAC')).toBe(0);
    const st = needStatus(s, 'LAC');
    expect(st.map((x) => x.pos)).toEqual(NEEDS.LAC);
    expect(st.every((x) => x.filled >= 0)).toBe(true);
  });

  it('weist ungültige Picks ab, ohne den Draft zu verändern', () => {
    const s = make();
    expect(applyPick(s, 'gibt-es-nicht')).toEqual({ ok: false, error: 'unknown_player' });
    const first = applyPick(s, s.pool[0].id);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(applyPick(first.session, s.pool[0].id)).toEqual({ ok: false, error: 'already_drafted' });
      expect(first.session.results).toHaveLength(1);
    }
    expect(s.results).toHaveLength(0); // Original unverändert
    expect(applyPick(playAll(s), s.pool[0].id)).toEqual({ ok: false, error: 'finished' });
  });

  it('merkt Auto-Picks', () => {
    const s = make();
    const next = applyAiPick(s, { auto: true });
    expect(next.results[0].auto).toBe(true);
  });
});

describe('Speichern und Laden', () => {
  const roundTrip = (s: DraftSession) => sanitizeSession(JSON.parse(JSON.stringify(s)));

  it('ein gespeicherter Draft geht exakt am selben Pick weiter und endet gleich wie ohne Unterbrechung', () => {
    let s = make({ seed: 99, randomness: 'chaos', rounds: 3 });
    for (let i = 0; i < 40; i++) s = applyAiPick(s);
    const restored = roundTrip(s);
    expect(restored).toEqual(s);
    expect(currentSlot(restored!)?.pick).toBe(41);
    expect(playAll(restored!).results).toEqual(playAll(s).results);
  });

  it('erkennt einen beendeten Draft nach dem Laden', () => {
    const done = playAll(make({ rounds: 1 }));
    expect(roundTrip(done)).toMatchObject({ status: 'finished', endReason: 'complete' });
  });

  it('verwirft beschädigte Drafts, statt abzustürzen', () => {
    const s = make({ rounds: 1 });
    const half = applyAiPick(applyAiPick(s));
    const clone = () => JSON.parse(JSON.stringify(half));
    expect(sanitizeSession(null)).toBeNull();
    expect(sanitizeSession('quatsch')).toBeNull();
    expect(sanitizeSession({})).toBeNull();
    expect(sanitizeSession({ ...clone(), format: 'anderes' })).toBeNull();
    expect(sanitizeSession({ ...clone(), version: 99 })).toBeNull();
    expect(sanitizeSession({ ...clone(), pool: 'x' })).toBeNull();
    expect(sanitizeSession({ ...clone(), order: [] })).toBeNull();
    const dup = clone();
    dup.results[1].playerId = dup.results[0].playerId;
    expect(sanitizeSession(dup)).toBeNull();
    const unknown = clone();
    unknown.results[0].playerId = 'gibt-es-nicht';
    expect(sanitizeSession(unknown)).toBeNull();
    const wrongPick = clone();
    wrongPick.results[0].pick = 17;
    expect(sanitizeSession(wrongPick)).toBeNull();
    const badTeam = clone();
    badTeam.order[0].team = 'XXX';
    expect(sanitizeSession(badTeam)).toBeNull();
    const noTeams = clone();
    noTeams.config.userTeams = [];
    expect(sanitizeSession(noTeams)).toBeNull();
    const tooMany = clone();
    tooMany.results = Array.from({ length: 40 }, () => tooMany.results[0]);
    expect(sanitizeSession(tooMany)).toBeNull();
  });

  it('repariert harmlose Abweichungen (unbekannter Zufallsgrad, fehlende Zeitstempel)', () => {
    const raw = JSON.parse(JSON.stringify(make({ rounds: 1 })));
    raw.config.randomness = 'wild';
    delete raw.createdAt;
    const r = sanitizeSession(raw);
    expect(r?.config.randomness).toBe('realistic');
    expect(typeof r?.createdAt).toBe('string');
  });
});
