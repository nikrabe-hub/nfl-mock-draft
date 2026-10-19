// Zusammenführen von Spielerlisten.
//  - Modus "scrape": Der Daten-Job liefert Rank und Stammdaten. ADP, Profil und manuelle Korrekturen bleiben erhalten.
//    Spieler, die die Quelle nicht mehr nennt, werden als "nicht mehr gelistet" markiert, nie gelöscht.
//  - Modus "overlay": Eigene Importe des Nutzers. Hier gewinnen alle gelieferten Felder.

import { makeId, normalizeName } from './names';
import type { IncomingPlayer, Player, PlayerProfile } from './types';

export type MergeMode = 'scrape' | 'overlay';

/** Felder, die eine Quelle (Tankathon) liefert. */
const SOURCE_FIELDS = ['name', 'pos', 'college', 'rank', 'heightIn', 'weightLb', 'klasse', 'posRank', 'altPos'] as const;
/** Zusätzliche Felder, die nur ein Nutzerimport setzt. */
const EXTRA_FIELDS = ['adp', 'age'] as const;

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface MergeResult {
  players: Player[];
  added: Player[];
  updated: { id: string; name: string; changes: FieldChange[] }[];
  unchanged: number;
  notListed: string[];
  relisted: string[];
}

const present = (v: unknown) => v !== undefined && v !== null && v !== '';
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function mergeProfile(base: PlayerProfile | null | undefined, inc: PlayerProfile | null | undefined): PlayerProfile | null | undefined {
  if (!inc) return base;
  const out: PlayerProfile = { ...(base ?? {}) };
  for (const k of ['strengths', 'weaknesses', 'comparison'] as const) if (present(inc[k])) out[k] = inc[k];
  return out;
}

function toPlayer(inc: IncomingPlayer): Player {
  const college = inc.college ?? '';
  const p: Player = {
    id: inc.id ?? makeId(inc.name, college),
    name: inc.name,
    pos: inc.pos ?? '',
    college,
    rank: inc.rank ?? 0,
  };
  for (const f of [...SOURCE_FIELDS, ...EXTRA_FIELDS] as const) {
    const v = inc[f as keyof IncomingPlayer];
    if (present(v) && f !== 'name' && f !== 'pos' && f !== 'college' && f !== 'rank') (p as unknown as Record<string, unknown>)[f] = v;
  }
  if (inc.profile) p.profile = inc.profile;
  return p;
}

export function mergePlayers(base: readonly Player[], incoming: readonly IncomingPlayer[], mode: MergeMode): MergeResult {
  const result: Player[] = base.map((p) => ({ ...p, profile: p.profile ? { ...p.profile } : p.profile }));
  const byId = new Map(result.map((p) => [p.id, p]));
  const matched = new Set<string>();
  const added: Player[] = [];
  const updated: MergeResult['updated'] = [];
  const relisted: string[] = [];
  let unchanged = 0;

  // doppelte IDs in der Eingabe: der letzte Eintrag gewinnt
  const incMap = new Map<string, IncomingPlayer>();
  for (const inc of incoming) {
    const id = inc.id ?? (present(inc.college) ? makeId(inc.name, inc.college as string) : '');
    incMap.set(id || `name:${normalizeName(inc.name)}`, inc);
  }

  const apply = (target: Player, inc: IncomingPlayer): FieldChange[] => {
    const changes: FieldChange[] = [];
    const t = target as unknown as Record<string, unknown>;
    const fields: readonly string[] = mode === 'scrape' ? SOURCE_FIELDS : [...SOURCE_FIELDS, ...EXTRA_FIELDS];
    for (const f of fields) {
      const v = (inc as unknown as Record<string, unknown>)[f];
      if (!present(v)) continue;
      if (mode === 'scrape' && target.manual?.includes(f)) continue;
      if (!sameValue(t[f], v)) {
        changes.push({ field: f, from: t[f] ?? null, to: v });
        t[f] = v;
      }
    }
    if (inc.profile) {
      const merged = mergeProfile(target.profile, inc.profile);
      if (JSON.stringify(merged) !== JSON.stringify(target.profile ?? null)) {
        changes.push({ field: 'profile', from: target.profile ?? null, to: merged });
        target.profile = merged;
      }
    }
    return changes;
  };

  const rest: [string, IncomingPlayer][] = [];
  // 1. Treffer über die ID
  for (const [key, inc] of incMap) {
    const target = byId.get(key);
    if (target) {
      matched.add(target.id);
      const changes = apply(target, inc);
      if (target.notListed && mode === 'scrape') {
        delete target.notListed;
        relisted.push(target.id);
      }
      if (changes.length) updated.push({ id: target.id, name: target.name, changes });
      else unchanged++;
    } else rest.push([key, inc]);
  }
  // 2. Treffer über den Namen, wenn er unter den noch nicht zugeordneten Spielern eindeutig ist (z.B. College-Wechsel)
  for (const [, inc] of rest) {
    const nameKey = normalizeName(inc.name);
    const candidates = result.filter((p) => !matched.has(p.id) && normalizeName(p.name) === nameKey);
    const sameNameInIncoming = rest.filter(([, o]) => normalizeName(o.name) === nameKey).length;
    if (candidates.length === 1 && sameNameInIncoming === 1) {
      const target = candidates[0];
      matched.add(target.id);
      const changes = apply(target, inc);
      if (target.notListed && mode === 'scrape') {
        delete target.notListed;
        relisted.push(target.id);
      }
      if (changes.length) updated.push({ id: target.id, name: target.name, changes });
      else unchanged++;
    } else {
      const fresh = toPlayer(inc);
      if (!byId.has(fresh.id)) {
        result.push(fresh);
        byId.set(fresh.id, fresh);
        matched.add(fresh.id);
        added.push(fresh);
      }
    }
  }

  const notListed: string[] = [];
  if (mode === 'scrape') {
    for (const p of result) {
      if (!matched.has(p.id) && !p.notListed) {
        p.notListed = true;
        notListed.push(p.id);
      }
    }
  }

  result.sort((a, b) => Number(!!a.notListed) - Number(!!b.notListed) || a.rank - b.rank || a.name.localeCompare(b.name));
  return { players: result, added, updated, unchanged, notListed, relisted };
}

/** Position-Rank (QB1, QB2 …) aus dem Gesamt-Rank ableiten. */
export function withPosRanks(players: readonly Player[]): Player[] {
  const counter = new Map<string, number>();
  const sorted = [...players].sort((a, b) => Number(!!a.notListed) - Number(!!b.notListed) || a.rank - b.rank);
  const out = new Map<string, Player>();
  for (const p of sorted) {
    if (p.notListed) {
      out.set(p.id, p);
      continue;
    }
    const n = (counter.get(p.pos) ?? 0) + 1;
    counter.set(p.pos, n);
    out.set(p.id, { ...p, posRank: n });
  }
  return players.map((p) => out.get(p.id) ?? p);
}
