// Datentypen für Trades (ohne Logik), damit Engine und Trade-Logik sich nicht gegenseitig importieren müssen.

import { getTeam } from '../data/teams';

/** Ein Pick dieses Drafts (nach Gesamtnummer). */
export interface PickAsset {
  kind: 'pick';
  pick: number;
}

/** Ein Pick des Folgejahres (z.B. 2028), nur als Tauschwert – er wird in diesem Mock nicht gezogen. */
export interface FutureAsset {
  kind: 'future';
  year: number;
  round: number;
  /** Team, dem der Pick ursprünglich gehört. */
  origin: string;
}

export type Asset = PickAsset | FutureAsset;

export interface FuturePick {
  year: number;
  round: number;
  origin: string;
  owner: string;
}

export interface TradeEntry {
  /** Anzahl bereits gemachter Picks zum Zeitpunkt des Trades. */
  at: number;
  /** Eigenes Team, das den Trade gemacht hat. */
  a: string;
  /** Gegenüber (Computer-Team). */
  b: string;
  aGives: Asset[];
  bGives: Asset[];
  /** Kam der Trade durch ein Angebot des Computer-Teams? */
  offer?: boolean;
}

export interface TradeOffer {
  /** Gilt nur für diesen Pick (Anzahl gemachter Picks). */
  at: number;
  /** Computer-Team, das anbietet. */
  from: string;
  /** Eigenes Team, dem angeboten wird. */
  to: string;
  /** Das gibt das Computer-Team. */
  cpuGives: Asset[];
  /** Das soll das eigene Team geben. */
  userGives: Asset[];
  cpuValue: number;
  userValue: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const teamOf = (v: unknown): string | null => (typeof v === 'string' ? (getTeam(v)?.abbr ?? null) : null);
const int = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null);

export function sanitizeAsset(v: unknown): Asset | null {
  if (!isRecord(v)) return null;
  if (v.kind === 'pick') {
    const pick = int(v.pick, 1, 1000);
    return pick === null ? null : { kind: 'pick', pick };
  }
  if (v.kind === 'future') {
    const year = int(v.year, 2000, 2100);
    const round = int(v.round, 1, 7);
    const origin = teamOf(v.origin);
    return year === null || round === null || !origin ? null : { kind: 'future', year, round, origin };
  }
  return null;
}

function assets(v: unknown): Asset[] | null {
  if (!Array.isArray(v) || v.length > 12) return null;
  const out: Asset[] = [];
  for (const x of v) {
    const a = sanitizeAsset(x);
    if (!a) return null;
    out.push(a);
  }
  return out;
}

export function sanitizeFuture(v: unknown): FuturePick[] | undefined {
  if (!Array.isArray(v) || v.length > 400) return undefined;
  const out: FuturePick[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (!isRecord(x)) return undefined;
    const year = int(x.year, 2000, 2100);
    const round = int(x.round, 1, 7);
    const origin = teamOf(x.origin);
    const owner = teamOf(x.owner);
    if (year === null || round === null || !origin || !owner) return undefined;
    const key = `${year}-${round}-${origin}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    out.push({ year, round, origin, owner });
  }
  return out;
}

export function sanitizeTrades(v: unknown): TradeEntry[] | undefined {
  if (!Array.isArray(v) || v.length > 200) return undefined;
  const out: TradeEntry[] = [];
  for (const x of v) {
    if (!isRecord(x)) return undefined;
    const at = int(x.at, 0, 1000);
    const a = teamOf(x.a);
    const b = teamOf(x.b);
    const aGives = assets(x.aGives);
    const bGives = assets(x.bGives);
    if (at === null || !a || !b || !aGives || !bGives) return undefined;
    out.push(x.offer === true ? { at, a, b, aGives, bGives, offer: true } : { at, a, b, aGives, bGives });
  }
  return out;
}

export function sanitizeOffer(v: unknown): TradeOffer | undefined {
  if (!isRecord(v)) return undefined;
  const at = int(v.at, 0, 1000);
  const from = teamOf(v.from);
  const to = teamOf(v.to);
  const cpuGives = assets(v.cpuGives);
  const userGives = assets(v.userGives);
  const cpuValue = typeof v.cpuValue === 'number' && Number.isFinite(v.cpuValue) ? v.cpuValue : null;
  const userValue = typeof v.userValue === 'number' && Number.isFinite(v.userValue) ? v.userValue : null;
  if (at === null || !from || !to || !cpuGives || !userGives || cpuValue === null || userValue === null) return undefined;
  if (cpuGives.length === 0 || userGives.length === 0) return undefined;
  return { at, from, to, cpuGives, userGives, cpuValue, userValue };
}
