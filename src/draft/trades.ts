// Trades: eigene Picks gegen Picks tauschen (auch Picks des Folgejahres) und Angebote der Computer-Teams.
//
// Regeln (Annahmen, ausdrücklich):
//  - Getauscht wird nur mit Computer-Teams. Computer-Teams tauschen nie untereinander.
//  - Das Computer-Team nimmt an, wenn der Wert, den es bekommt, mindestens so hoch ist wie der, den es abgibt (Wertchart).
//  - Angebote der Computer-Teams: nur "nach oben tauschen" – das Team bietet seine späteren Picks (plus ggf. Zusatz-Picks)
//    für deinen Pick, wenn es dort einen Spieler für ein offenes Need sieht. Der Wert liegt bei 92–100 % deines Picks.
//  - Picks des Folgejahres zählen wie der mittlere Pick ihrer Runde mit 20 % Abschlag.

import { getTeam, TEAMS } from '../data/teams';
import {
  availablePlayers,
  currentSlot,
  effectiveRank,
  isUserTeam,
  isUserTurn,
  needStatus,
  type DraftSession,
} from './engine';
import { unit } from './rng';
import { futureValue, getChart, pickValue, type TradeChart } from './tradeChart';
import type { Asset, FuturePick, TradeEntry, TradeOffer } from './tradeTypes';

const ALL_TEAMS: readonly string[] = TEAMS.map((x) => x.abbr);

export const MAX_ASSETS_PER_SIDE = 8;
/** So viel Wert muss das Computer-Team mindestens bekommen, relativ zu dem, was es abgibt (1 = gleicher Wert). */
export const ACCEPT_RATIO = 1;
/** Wie viele Picks nach hinten ein Computer-Team für ein Angebot höchstens liegen darf. */
export const OFFER_WINDOW = 40;
export const OFFER_MIN_SHARE = 0.92;

/** Wahrscheinlichkeit eines Angebots je Runde. */
export function offerChance(round: number): number {
  return round <= 1 ? 0.35 : round === 2 ? 0.25 : round === 3 ? 0.18 : 0.1;
}

export function draftYearOf(s: DraftSession): number {
  return (s.year ?? 2027) + 1;
}

export function defaultFuture(s: DraftSession, teams: readonly string[] = ALL_TEAMS): FuturePick[] {
  const year = draftYearOf(s);
  const out: FuturePick[] = [];
  for (const team of teams) for (let round = 1; round <= 7; round++) out.push({ year, round, origin: team, owner: team });
  return out;
}

/** Picks des Folgejahres: gespeicherte Liste oder (solange nichts getauscht wurde) jedes Team mit seinen eigenen. */
export function futurePicks(s: DraftSession): FuturePick[] {
  return s.future ?? defaultFuture(s);
}

export function assetKey(a: Asset): string {
  return a.kind === 'pick' ? `p${a.pick}` : `f${a.year}-${a.round}-${a.origin}`;
}

export function assetValue(a: Asset, chart: TradeChart = getChart()): number {
  return a.kind === 'pick' ? pickValue(a.pick, chart) : futureValue(a.round, chart);
}

export function sumValue(assets: readonly Asset[], chart: TradeChart = getChart()): number {
  return Math.round(assets.reduce((acc, a) => acc + assetValue(a, chart), 0) * 10) / 10;
}

/** Alles, was ein Team noch tauschen kann: seine noch nicht gezogenen Picks und seine Picks des Folgejahres. */
export function ownedAssets(s: DraftSession, team: string): Asset[] {
  const out: Asset[] = [];
  s.order.forEach((slot, index) => {
    if (slot.team === team && index >= s.results.length) out.push({ kind: 'pick', pick: slot.pick });
  });
  for (const f of futurePicks(s)) if (f.owner === team) out.push({ kind: 'future', year: f.year, round: f.round, origin: f.origin });
  return out;
}

export interface TradeCheck {
  /** Wert, den das Computer-Team bekommt (deine Seite). */
  cpuGets: number;
  /** Wert, den das Computer-Team abgibt. */
  cpuGives: number;
  /** Nimmt das Computer-Team an? */
  accept: boolean;
  /** So viel Wert fehlt noch (0, wenn angenommen). */
  shortfall: number;
}

export function evaluateTrade(userGives: readonly Asset[], cpuGives: readonly Asset[], chart: TradeChart = getChart()): TradeCheck {
  const cpuGets = sumValue(userGives, chart);
  const gives = sumValue(cpuGives, chart);
  const accept = userGives.length > 0 && cpuGives.length > 0 && cpuGets >= gives * ACCEPT_RATIO;
  return { cpuGets, cpuGives: gives, accept, shortfall: accept ? 0 : Math.max(0, Math.round((gives * ACCEPT_RATIO - cpuGets) * 10) / 10) };
}

export type TradeError =
  | 'not_running'
  | 'bad_team'
  | 'same_team'
  | 'empty_side'
  | 'too_many'
  | 'not_owned'
  | 'duplicate'
  | 'rejected';

export function validateTrade(
  s: DraftSession,
  userTeam: string,
  cpuTeam: string,
  userGives: readonly Asset[],
  cpuGives: readonly Asset[],
): TradeError | null {
  if (s.status !== 'running') return 'not_running';
  if (!getTeam(userTeam) || !getTeam(cpuTeam) || !isUserTeam(s, userTeam) || isUserTeam(s, cpuTeam)) return 'bad_team';
  if (userTeam === cpuTeam) return 'same_team';
  if (userGives.length === 0 || cpuGives.length === 0) return 'empty_side';
  if (userGives.length > MAX_ASSETS_PER_SIDE || cpuGives.length > MAX_ASSETS_PER_SIDE) return 'too_many';
  for (const [list, owner] of [
    [userGives, userTeam],
    [cpuGives, cpuTeam],
  ] as const) {
    const owned = new Set(ownedAssets(s, owner).map(assetKey));
    const seen = new Set<string>();
    for (const a of list) {
      const k = assetKey(a);
      if (seen.has(k)) return 'duplicate';
      seen.add(k);
      if (!owned.has(k)) return 'not_owned';
    }
  }
  return null;
}

function moveAssets(s: DraftSession, assets: readonly Asset[], from: string, to: string): Pick<DraftSession, 'order' | 'future'> {
  let order = s.order;
  let future = s.future;
  for (const a of assets) {
    if (a.kind === 'pick') {
      order = order.map((slot) => {
        if (slot.pick !== a.pick) return slot;
        const original = slot.from ?? from;
        const next = { ...slot, team: to };
        if (original === to) delete next.from;
        else next.from = original;
        return next;
      });
    } else {
      const list = (future ?? defaultFuture(s)).map((f) => (f.year === a.year && f.round === a.round && f.origin === a.origin ? { ...f, owner: to } : f));
      future = list;
    }
  }
  return { order, ...(future ? { future } : {}) };
}

export interface TradeOptions {
  /** Wertprüfung überspringen (für angenommene Angebote). */
  skipValueCheck?: boolean;
  offer?: boolean;
  now?: Date;
  chart?: TradeChart;
}

/** Führt einen Trade aus. Der Nutzer gibt `userGives` ab und erhält `cpuGives`. */
export function applyTrade(
  s: DraftSession,
  userTeam: string,
  cpuTeam: string,
  userGives: readonly Asset[],
  cpuGives: readonly Asset[],
  opts: TradeOptions = {},
): { ok: true; session: DraftSession } | { ok: false; error: TradeError } {
  const err = validateTrade(s, userTeam, cpuTeam, userGives, cpuGives);
  if (err) return { ok: false, error: err };
  if (!opts.skipValueCheck && !evaluateTrade(userGives, cpuGives, opts.chart).accept) return { ok: false, error: 'rejected' };

  const a = moveAssets(s, userGives, userTeam, cpuTeam);
  const b = moveAssets({ ...s, ...a }, cpuGives, cpuTeam, userTeam);
  const entry: TradeEntry = { at: s.results.length, a: userTeam, b: cpuTeam, aGives: [...userGives], bGives: [...cpuGives], ...(opts.offer ? { offer: true } : {}) };
  const { offer: _offer, ...rest } = s;
  void _offer;
  return {
    ok: true,
    session: {
      ...rest,
      order: b.order,
      ...(b.future ? { future: b.future } : {}),
      trades: [...(s.trades ?? []), entry],
      offerChecked: s.results.length,
      updatedAt: (opts.now ?? new Date()).toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Angebote der Computer-Teams

/** Wie sehr würde das Team einen der besten verfügbaren Spieler wollen? (0 = gar nicht) */
function interest(s: DraftSession, team: string, top: readonly { pos: string; altPos?: string[] }[]): number {
  const needs = needStatus(s, team).filter((n) => n.filled === 0);
  let best = 0;
  needs.forEach((n, i) => {
    const hit = top.some((p) => p.pos === n.pos || p.altPos?.includes(n.pos));
    if (hit) best = Math.max(best, 1 - i * 0.2);
  });
  return best;
}

/** Stellt ein Angebot zusammen: Preis 92–100 % des Werts, höchstens 3 Bestandteile. */
function buildPackage(pool: readonly Asset[], target: number, chart: TradeChart): Asset[] | null {
  const sorted = [...pool].sort((x, y) => assetValue(y, chart) - assetValue(x, chart));
  const chosen: Asset[] = [];
  let remaining = target;
  for (const a of sorted) {
    if (chosen.length >= 3) break;
    const v = assetValue(a, chart);
    if (v <= remaining + 1e-9) {
      chosen.push(a);
      remaining -= v;
    }
  }
  return chosen.length > 0 ? chosen : null;
}

/**
 * Entscheidet (einmal je Pick), ob ein Computer-Team dem Nutzer ein Angebot macht. Rein und reproduzierbar:
 * gleiche Eingaben ergeben dasselbe Ergebnis (Seed, Pick-Nummer). Gibt dieselbe Session zurück, wenn schon entschieden wurde.
 */
export function considerOffer(s: DraftSession, chart: TradeChart = getChart()): DraftSession {
  if (s.status !== 'running' || !isUserTurn(s) || s.offerChecked === s.results.length) return s;
  const cur = currentSlot(s)!;
  const checked: DraftSession = { ...s, offerChecked: s.results.length };
  if (unit(s.config.seed, 'offer', cur.pick) >= offerChance(cur.round)) return checked;

  const userValue = pickValue(cur.pick, chart);
  const topPlayers = availablePlayers(s)
    .slice()
    .sort((x, y) => effectiveRank(x) - effectiveRank(y))
    .slice(0, 6);

  const candidates = ALL_TEAMS
    .filter((team) => !isUserTeam(s, team))
    .map((team) => ({ team, want: interest(s, team, topPlayers) }))
    .filter((c) => c.want > 0)
    .map((c) => ({ ...c, tie: unit(s.config.seed, 'offer-team', cur.pick, c.team) }))
    .sort((x, y) => y.want - x.want || x.tie - y.tie);

  const share = OFFER_MIN_SHARE + (1 - OFFER_MIN_SHARE) * unit(s.config.seed, 'offer-share', cur.pick);
  for (const c of candidates) {
    const pool = ownedAssets(s, c.team).filter((a) => (a.kind === 'pick' ? a.pick > cur.pick && a.pick <= cur.pick + OFFER_WINDOW : true));
    // Mindestens ein Pick dieses Drafts muss dabei sein, sonst ist es kein Tausch "nach oben".
    if (!pool.some((a) => a.kind === 'pick')) continue;
    const pkg = buildPackage(pool, userValue * share, chart);
    if (!pkg || !pkg.some((a) => a.kind === 'pick')) continue;
    const cpuValue = sumValue(pkg, chart);
    if (cpuValue < userValue * 0.88 || cpuValue > userValue) continue;
    const offer: TradeOffer = {
      at: s.results.length,
      from: c.team,
      to: cur.team,
      cpuGives: pkg,
      userGives: [{ kind: 'pick', pick: cur.pick }],
      cpuValue,
      userValue: sumValue([{ kind: 'pick', pick: cur.pick }], chart),
    };
    return { ...checked, offer };
  }
  return checked;
}

export type OfferError = TradeError | 'no_offer' | 'stale';

/** Nimmt das aktuelle Angebot an. */
export function acceptOffer(s: DraftSession, now?: Date): { ok: true; session: DraftSession } | { ok: false; error: OfferError } {
  const o = s.offer;
  if (!o) return { ok: false, error: 'no_offer' };
  if (o.at !== s.results.length) return { ok: false, error: 'stale' };
  return applyTrade(s, o.to, o.from, o.userGives, o.cpuGives, { skipValueCheck: true, offer: true, now });
}

export function declineOffer(s: DraftSession): DraftSession {
  if (!s.offer) return s;
  const { offer: _o, ...rest } = s;
  void _o;
  return { ...rest, offerChecked: s.results.length };
}
