import { describe, expect, it } from 'vitest';
import { applyAiPick, applyPick, createSession, currentSlot, isUserTurn, sanitizeSession, type DraftSession } from '../../src/draft/engine';
import { resolveNeeds } from '../../src/draft/needs';
import {
  BUILTIN_CHART,
  FUTURE_DISCOUNT,
  futureValue,
  parseChartText,
  pickValue,
  sanitizeChart,
} from '../../src/draft/tradeChart';
import {
  acceptOffer,
  applyTrade,
  considerOffer,
  declineOffer,
  evaluateTrade,
  futurePicks,
  offerChance,
  ownedAssets,
  validateTrade,
} from '../../src/draft/trades';
import type { Asset } from '../../src/draft/tradeTypes';
import { makeBoard, makeDraftOrder } from './helpers';

function make(seed = 1, teams = ['LAC'], rounds = 3): DraftSession {
  const r = createSession({
    order: makeDraftOrder().picks,
    players: makeBoard(300).players,
    needs: resolveNeeds(undefined),
    year: 2027,
    config: { rounds, userTeams: teams, randomness: 'realistic', seed },
    now: new Date('2026-11-01T10:00:00Z'),
  });
  if (!r.ok) throw new Error(r.error);
  return r.session;
}
/** Lässt die KI ziehen, bis ein eigenes Team an der Reihe ist. */
function toUserTurn(s: DraftSession): DraftSession {
  let cur = s;
  for (let g = 0; g < 500 && cur.status === 'running' && !isUserTurn(cur); g++) cur = applyAiPick(cur);
  return cur;
}
const pick = (n: number): Asset => ({ kind: 'pick', pick: n });

describe('Wertchart (Näherung)', () => {
  it('geht durch die geprüften Stützstellen und fällt nie', () => {
    expect(pickValue(13)).toBeCloseTo(336, 0);
    expect(pickValue(61)).toBeCloseTo(86, 0);
    expect(pickValue(93)).toBeCloseTo(42, 0);
    expect(pickValue(207)).toBeCloseTo(4, 0);
    expect(pickValue(251)).toBeCloseTo(1, 0);
    const v = BUILTIN_CHART.values;
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeLessThanOrEqual(v[i - 1]);
    expect(BUILTIN_CHART.approximate).toBe(true);
    expect(v.length).toBeGreaterThanOrEqual(257);
  });
  it('Picks außerhalb der Tabelle bleiben gültig', () => {
    expect(pickValue(0)).toBe(pickValue(1));
    expect(pickValue(9999)).toBe(BUILTIN_CHART.values[BUILTIN_CHART.values.length - 1]);
    expect(pickValue(Number.NaN)).toBe(pickValue(1));
  });
  it('Folgejahr-Picks zählen wie der mittlere Pick der Runde mit Abschlag', () => {
    expect(futureValue(1)).toBeCloseTo(pickValue(16) * FUTURE_DISCOUNT, 0);
    expect(futureValue(1)).toBeGreaterThan(futureValue(2));
  });
  it('liest eingefügte Tabellen (Paare, mehrere Paare je Zeile, Wertespalte) und lehnt Fehlerhaftes ab', () => {
    const vals = Array.from({ length: 230 }, (_, i) => Math.max(1, 1000 - i * 4));
    const pairs = vals.map((v, i) => `${i + 1}\t${v}`).join('\n');
    const r = parseChartText(pairs);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chart.values[0]).toBe(1000);
    const col = parseChartText(vals.join('\n'));
    expect(col.ok && col.chart.values.length).toBe(230);
    const two = vals.map((v, i) => (i % 2 === 0 ? `${i + 1} ${v} ${i + 2} ${vals[i + 1]}` : null)).filter(Boolean).join('\n');
    expect(parseChartText(two).ok).toBe(true);
    expect(parseChartText('').ok).toBe(false);
    expect(parseChartText('1 100\n2 200')).toMatchObject({ ok: false, error: 'too_short' });
    expect(parseChartText(pairs.replace('2\t996', '2\t5000'))).toMatchObject({ ok: false, error: 'not_descending' });
    expect(parseChartText(pairs.replace('5\t984', '4\t984'))).toMatchObject({ ok: false });
    expect(sanitizeChart({ values: [1, 2, 3] })).toBeNull();
    expect(sanitizeChart({ values: vals })?.approximate).toBe(false);
  });
});

describe('Trade prüfen und ausführen', () => {
  it('Wertprüfung: gleich viel oder mehr ist ok, weniger nicht', () => {
    expect(evaluateTrade([pick(10)], [pick(25)]).accept).toBe(true);
    expect(evaluateTrade([pick(25)], [pick(10)]).accept).toBe(false);
    expect(evaluateTrade([pick(25)], [pick(10)]).shortfall).toBeGreaterThan(0);
    expect(evaluateTrade([], [pick(10)]).accept).toBe(false);
    expect(evaluateTrade([pick(10)], []).accept).toBe(false);
    // zwei kleinere gegen einen großen
    expect(evaluateTrade([pick(40), pick(41), pick(42), pick(43)], [pick(20)]).accept).toBe(pickValue(40) + pickValue(41) + pickValue(42) + pickValue(43) >= pickValue(20));
  });

  it('tauscht die Besitzer der Picks und merkt sich die Herkunft', () => {
    const s = toUserTurn(make(1));
    const my = ownedAssets(s, 'LAC').find((a) => a.kind === 'pick')!;
    const other = s.order.find((o) => o.team !== 'LAC' && o.pick > (my as { pick: number }).pick && !o.from)!;
    const r = applyTrade(s, 'LAC', other.team, [my], [pick(other.pick)], { skipValueCheck: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.session.order.find((o) => o.pick === (my as { pick: number }).pick)!;
    const b = r.session.order.find((o) => o.pick === other.pick)!;
    expect(a.team).toBe(other.team);
    expect(a.from).toBe('LAC');
    expect(b.team).toBe('LAC');
    expect(b.from).toBe(other.team);
    expect(r.session.trades).toHaveLength(1);
    expect(r.session.trades![0]).toMatchObject({ a: 'LAC', b: other.team, at: s.results.length });
    // Der Original-Draft ist unverändert (reine Funktion)
    expect(s.order.find((o) => o.pick === other.pick)!.team).toBe(other.team);
    // Tausch zurück entfernt die Herkunftsmarke
    const back = applyTrade(r.session, 'LAC', other.team, [pick(other.pick)], [my], { skipValueCheck: true });
    expect(back.ok && back.session.order.find((o) => o.pick === (my as { pick: number }).pick)!.from).toBeUndefined();
  });

  it('wer den aktuellen Pick abgibt, ist nicht mehr dran – das Computer-Team zieht dort', () => {
    const s = toUserTurn(make(2));
    const cur = currentSlot(s)!;
    const partner = s.order.find((o) => o.team !== 'LAC' && o.pick > cur.pick)!;
    const r = applyTrade(s, 'LAC', partner.team, [pick(cur.pick)], [pick(partner.pick)], { skipValueCheck: true });
    if (!r.ok) throw new Error(r.error);
    expect(isUserTurn(r.session)).toBe(false);
    expect(currentSlot(r.session)!.team).toBe(partner.team);
    const next = applyAiPick(r.session);
    expect(next.results).toHaveLength(s.results.length + 1);
  });

  it('Picks des Folgejahres wechseln den Besitzer und bleiben nach Speichern/Laden erhalten', () => {
    const s = toUserTurn(make(3));
    const f = ownedAssets(s, 'LAC').find((a) => a.kind === 'future')!;
    expect(f).toBeTruthy();
    const other = s.order.find((o) => o.team !== 'LAC')!.team;
    const mine = ownedAssets(s, 'LAC').find((a) => a.kind === 'pick')!;
    const theirs = ownedAssets(s, other).find((a) => a.kind === 'pick')!;
    const r = applyTrade(s, 'LAC', other, [f, mine], [theirs], { skipValueCheck: true });
    if (!r.ok) throw new Error(r.error);
    const fp = futurePicks(r.session).find((x) => x.origin === 'LAC' && f.kind === 'future' && x.round === f.round)!;
    expect(fp.owner).toBe(other);
    expect(fp.year).toBe(2028);
    const reloaded = sanitizeSession(JSON.parse(JSON.stringify(r.session)))!;
    expect(reloaded).toBeTruthy();
    expect(reloaded.order).toEqual(r.session.order);
    expect(reloaded.future).toEqual(r.session.future);
    expect(reloaded.trades).toEqual(r.session.trades);
  });

  it('lehnt unzulässige Trades ab, ohne etwas zu ändern', () => {
    const s = toUserTurn(make(4, ['LAC', 'NYJ']));
    const mine = ownedAssets(s, 'LAC').find((a) => a.kind === 'pick')!;
    const other = s.order.find((o) => o.team !== 'LAC' && o.team !== 'NYJ' && o.pick > (mine as { pick: number }).pick)!;
    const theirs = pick(other.pick);
    expect(validateTrade(s, 'LAC', 'NYJ', [mine], [theirs])).toBe('bad_team'); // zwei eigene Teams
    expect(validateTrade(s, 'XXX', other.team, [mine], [theirs])).toBe('bad_team');
    expect(validateTrade(s, 'LAC', other.team, [], [theirs])).toBe('empty_side');
    expect(validateTrade(s, 'LAC', other.team, [mine, mine], [theirs])).toBe('duplicate');
    expect(validateTrade(s, 'LAC', other.team, [theirs], [mine])).toBe('not_owned'); // vertauschte Besitzer
    expect(validateTrade(s, 'LAC', other.team, [pick(1)], [theirs])).toBe('not_owned'); // schon gezogener Pick
    const tooMany = Array.from({ length: 9 }, (_, i) => pick(1000 + i));
    expect(validateTrade(s, 'LAC', other.team, tooMany, [theirs])).toBe('too_many');
    const bad = applyTrade(s, 'LAC', other.team, [pick(s.order[s.order.length - 1].pick)], [pick(other.pick)]);
    expect(bad.ok).toBe(false);
    expect(validateTrade({ ...s, status: 'finished' }, 'LAC', other.team, [mine], [theirs])).toBe('not_running');
  });

  it('zu wenig Wert wird abgelehnt, genug Wert angenommen', () => {
    const s = toUserTurn(make(5));
    const mine = ownedAssets(s, 'LAC').filter((a) => a.kind === 'pick');
    const lastMine = mine[mine.length - 1];
    const first = s.order[s.results.length].pick;
    const rich = s.order.find((o) => o.team !== 'LAC' && o.pick > first)!;
    const low = applyTrade(s, 'LAC', rich.team, [lastMine], [pick(rich.pick)]);
    expect(low.ok).toBe(!(pickValue((lastMine as { pick: number }).pick) < pickValue(rich.pick)));
  });

  it('der Draft läuft nach Trades bis zum Ende durch und Picks passen zu den Besitzern', () => {
    let s = toUserTurn(make(6));
    const cur = currentSlot(s)!;
    const partner = s.order.find((o) => o.team !== 'LAC' && o.pick > cur.pick + 5)!;
    const r = applyTrade(s, 'LAC', partner.team, [pick(cur.pick)], [pick(partner.pick)], { skipValueCheck: true });
    if (!r.ok) throw new Error(r.error);
    s = r.session;
    for (let g = 0; g < 1000 && s.status === 'running'; g++) {
      if (isUserTurn(s)) {
        const id = s.pool.find((p) => !s.results.some((x) => x.playerId === p.id))!.id;
        const a = applyPick(s, id);
        if (!a.ok) throw new Error(a.error);
        s = a.session;
      } else s = applyAiPick(s);
    }
    expect(s.status).toBe('finished');
    s.results.forEach((res, i) => expect(res.pick).toBe(s.order[i].pick));
  });
});

describe('Angebote der Computer-Teams', () => {
  it('Wahrscheinlichkeit sinkt mit der Runde', () => {
    expect(offerChance(1)).toBeGreaterThan(offerChance(2));
    expect(offerChance(2)).toBeGreaterThan(offerChance(4));
    expect(offerChance(7)).toBeGreaterThan(0);
  });

  it('ist reproduzierbar, entscheidet nur einmal je Pick und liefert zulässige, faire Angebote', () => {
    let offers = 0;
    let turns = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = toUserTurn(make(seed));
      if (!isUserTurn(s)) continue;
      turns++;
      const a = considerOffer(s);
      const b = considerOffer(s);
      expect(b).toEqual(a); // reproduzierbar
      expect(considerOffer(a)).toBe(a); // schon entschieden: keine zweite Würfelung
      expect(a.offerChecked).toBe(s.results.length);
      if (!a.offer) continue;
      offers++;
      const o = a.offer;
      const cur = currentSlot(s)!;
      expect(o.to).toBe(cur.team);
      expect(o.userGives).toEqual([pick(cur.pick)]);
      expect(o.from).not.toBe('LAC');
      // Das Angebot ist gültig und für das Computer-Team akzeptabel
      expect(validateTrade(a, o.to, o.from, o.userGives, o.cpuGives)).toBeNull();
      expect(evaluateTrade(o.userGives, o.cpuGives).accept).toBe(true);
      expect(o.cpuValue).toBeGreaterThanOrEqual(o.userValue * 0.88);
      expect(o.cpuValue).toBeLessThanOrEqual(o.userValue);
      expect(o.cpuGives.some((x) => x.kind === 'pick' && x.pick > cur.pick)).toBe(true);
      expect(o.cpuGives.length).toBeLessThanOrEqual(3);
    }
    expect(turns).toBeGreaterThan(40);
    expect(offers).toBeGreaterThan(3); // kommt vor, aber nicht ständig
    expect(offers).toBeLessThan(turns);
  });

  it('Annehmen tauscht die Picks, Ablehnen entfernt das Angebot', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s0 = toUserTurn(make(seed));
      if (!isUserTurn(s0)) continue;
      const s = considerOffer(s0);
      if (!s.offer) continue;
      const o = s.offer;
      const acc = acceptOffer(s);
      if (!acc.ok) throw new Error(acc.error);
      expect(acc.session.offer).toBeUndefined();
      expect(acc.session.trades![0].offer).toBe(true);
      const cur = o.userGives[0] as { pick: number };
      expect(acc.session.order.find((x) => x.pick === cur.pick)!.team).toBe(o.from);
      for (const a of o.cpuGives) if (a.kind === 'pick') expect(acc.session.order.find((x) => x.pick === a.pick)!.team).toBe('LAC');
      expect(isUserTurn(acc.session)).toBe(false);
      const dec = declineOffer(s);
      expect(dec.offer).toBeUndefined();
      expect(dec.offerChecked).toBe(s.results.length);
      expect(considerOffer(dec)).toBe(dec); // kein neues Angebot für denselben Pick
      // Das Angebot übersteht Speichern/Laden
      expect(sanitizeSession(JSON.parse(JSON.stringify(s)))!.offer).toEqual(o);
      return;
    }
    throw new Error('kein Angebot in 200 Versuchen gefunden');
  });

  it('ein veraltetes Angebot lässt sich nicht annehmen und endet mit dem Pick', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s0 = toUserTurn(make(seed));
      if (!isUserTurn(s0)) continue;
      const s = considerOffer(s0);
      if (!s.offer) continue;
      const id = s.pool.find((p) => !s.results.some((x) => x.playerId === p.id))!.id;
      const picked = applyPick(s, id);
      if (!picked.ok) throw new Error(picked.error);
      expect(picked.session.offer).toBeUndefined();
      expect(acceptOffer({ ...picked.session, offer: s.offer })).toMatchObject({ ok: false, error: 'stale' });
      expect(acceptOffer(picked.session)).toMatchObject({ ok: false, error: 'no_offer' });
      return;
    }
    throw new Error('kein Angebot gefunden');
  });
});
