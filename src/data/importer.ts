// Import von Spielerdaten per JSON, CSV oder eingefügtem Text (z.B. aus Excel kopiert).
// Ablauf: parseImportText -> planImport (Vorschau, ändert nichts) -> Nutzer bestätigt -> mergePlayers im Modus "overlay".

import { mergePlayers, type FieldChange } from './merge';
import { makeId, normalizeName, parseHeight, parseWeight } from './names';
import { normalizePosition } from './positions';
import type { IncomingPlayer, Player, PlayerProfile } from './types';

export const MAX_IMPORT_CHARS = 2_000_000;
export const MAX_IMPORT_ROWS = 2000;

export type ImportErrorCode = 'empty' | 'too_large' | 'not_parsable' | 'no_rows' | 'too_many_rows';
export type RowIssueCode = 'missing_name' | 'bad_position' | 'bad_rank' | 'bad_number' | 'bad_height' | 'bad_weight' | 'incomplete_new_player';

export interface RowIssue {
  /** 1-basierte Zeilennummer (CSV: Zeile in der Datei, JSON: Eintrag). */
  row: number;
  name?: string;
  code: RowIssueCode;
  detail?: string;
}

export type ParseResult =
  | { ok: true; format: 'json' | 'csv'; rows: { row: number; player: IncomingPlayer }[]; issues: RowIssue[] }
  | { ok: false; code: ImportErrorCode; detail?: string };

// --- Spaltennamen (deutsch und englisch) -----------------------------------

const COLUMN_ALIASES: Record<string, string> = {
  name: 'name',
  spieler: 'name',
  player: 'name',
  pos: 'pos',
  position: 'pos',
  college: 'college',
  school: 'college',
  schule: 'college',
  uni: 'college',
  rank: 'rank',
  rang: 'rank',
  adp: 'adp',
  height: 'height',
  groesse: 'height',
  'größe': 'height',
  ht: 'height',
  weight: 'weight',
  gewicht: 'weight',
  wt: 'weight',
  age: 'age',
  alter: 'age',
  class: 'klasse',
  klasse: 'klasse',
  jahrgang: 'klasse',
  strengths: 'strengths',
  staerken: 'strengths',
  'stärken': 'strengths',
  weaknesses: 'weaknesses',
  schwaechen: 'weaknesses',
  'schwächen': 'weaknesses',
  comparison: 'comparison',
  comp: 'comparison',
  vergleich: 'comparison',
  vergleichsspieler: 'comparison',
};

const canon = (key: string) => COLUMN_ALIASES[key.trim().toLowerCase().replace(/[\s_-]+/g, '')] ?? COLUMN_ALIASES[key.trim().toLowerCase()];

// --- CSV -------------------------------------------------------------------

/** Einfacher CSV-Parser mit Anführungszeichen. Trennzeichen: Komma, Semikolon oder Tab (wird erkannt). */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts: [string, number][] = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length - 1]);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

// --- Zeilen in Spieler umwandeln -------------------------------------------

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const n = Number(v.trim().replace(',', '.'));
  return v.trim() !== '' && Number.isFinite(n) ? n : null;
}

function rowToPlayer(raw: Record<string, unknown>, rowNo: number, issues: RowIssue[]): IncomingPlayer | null {
  const get = (key: string): unknown => {
    for (const [k, v] of Object.entries(raw)) if (canon(k) === key && v !== undefined && v !== null && String(v).trim() !== '') return v;
    return undefined;
  };
  const nameRaw = get('name');
  if (typeof nameRaw !== 'string' || !nameRaw.trim()) {
    issues.push({ row: rowNo, code: 'missing_name' });
    return null;
  }
  const name = nameRaw.trim();
  const p: IncomingPlayer = { name };
  const bad = (code: RowIssueCode, detail: string) => {
    issues.push({ row: rowNo, name, code, detail });
    return null;
  };

  const posRaw = get('pos');
  if (posRaw !== undefined) {
    const pos = normalizePosition(posRaw);
    if (!pos) return bad('bad_position', String(posRaw));
    p.pos = pos;
  }
  const college = get('college');
  if (typeof college === 'string') p.college = college.trim();

  const rank = get('rank');
  if (rank !== undefined) {
    const n = toNumber(rank);
    if (n === null || !Number.isInteger(n) || n < 1 || n > 2000) return bad('bad_rank', String(rank));
    p.rank = n;
  }
  const adp = get('adp');
  if (adp !== undefined) {
    const n = toNumber(adp);
    if (n === null || n < 1 || n > 600) return bad('bad_number', `adp=${String(adp)}`);
    p.adp = n;
  }
  const age = get('age');
  if (age !== undefined) {
    const n = toNumber(age);
    if (n === null || n < 18 || n > 30) return bad('bad_number', `age=${String(age)}`);
    p.age = n;
  }
  const height = get('height');
  if (height !== undefined) {
    const n = parseHeight(height);
    if (n === null) return bad('bad_height', String(height));
    p.heightIn = n;
  }
  const weight = get('weight');
  if (weight !== undefined) {
    const n = parseWeight(weight);
    if (n === null) return bad('bad_weight', String(weight));
    p.weightLb = n;
  }
  const klasse = get('klasse');
  if (klasse !== undefined) p.klasse = String(klasse).trim().slice(0, 40);

  const profile: PlayerProfile = {};
  for (const k of ['strengths', 'weaknesses', 'comparison'] as const) {
    const v = get(k);
    if (typeof v === 'string' && v.trim()) profile[k] = v.trim().slice(0, 800);
  }
  if (Object.keys(profile).length) p.profile = profile;
  return p;
}

export function parseImportText(text: string): ParseResult {
  if (!text || !text.trim()) return { ok: false, code: 'empty' };
  if (text.length > MAX_IMPORT_CHARS) return { ok: false, code: 'too_large' };
  const trimmed = text.trim().replace(/^﻿/, '');
  const issues: RowIssue[] = [];
  const rows: { row: number; player: IncomingPlayer }[] = [];
  let format: 'json' | 'csv';

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    format = 'json';
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      return { ok: false, code: 'not_parsable', detail: e instanceof Error ? e.message : undefined };
    }
    const list = Array.isArray(parsed) ? parsed : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { players?: unknown }).players) ? (parsed as { players: unknown[] }).players : null;
    if (!list) return { ok: false, code: 'not_parsable', detail: 'Erwartet wird eine Liste oder {"players": [...]}' };
    if (list.length > MAX_IMPORT_ROWS) return { ok: false, code: 'too_many_rows', detail: String(list.length) };
    list.forEach((item, i) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        issues.push({ row: i + 1, code: 'missing_name' });
        return;
      }
      // JSON-Dateien dieser App (heightIn/weightLb) und frei benannte Felder werden beide akzeptiert
      const obj = { ...(item as Record<string, unknown>) };
      if (obj.heightIn !== undefined && obj.height === undefined) obj.height = obj.heightIn;
      if (obj.weightLb !== undefined && obj.weight === undefined) obj.weight = obj.weightLb;
      if (typeof obj.profile === 'object' && obj.profile !== null) Object.assign(obj, obj.profile);
      const player = rowToPlayer(obj, i + 1, issues);
      if (player) rows.push({ row: i + 1, player });
    });
  } else {
    format = 'csv';
    const table = parseCsv(trimmed.replace(/^﻿/, ''));
    if (table.length < 2) return { ok: false, code: 'not_parsable', detail: 'Es fehlt die Kopfzeile oder es gibt keine Datenzeilen.' };
    const header = table[0];
    if (!header.some((h) => canon(h) === 'name')) return { ok: false, code: 'not_parsable', detail: 'In der Kopfzeile fehlt die Spalte "Name".' };
    if (table.length - 1 > MAX_IMPORT_ROWS) return { ok: false, code: 'too_many_rows', detail: String(table.length - 1) };
    for (let i = 1; i < table.length; i++) {
      const obj: Record<string, unknown> = {};
      header.forEach((h, c) => {
        if (h.trim()) obj[h] = table[i][c] ?? '';
      });
      const player = rowToPlayer(obj, i + 1, issues);
      if (player) rows.push({ row: i + 1, player });
    }
  }
  if (rows.length === 0 && issues.length === 0) return { ok: false, code: 'no_rows' };
  return { ok: true, format, rows, issues };
}

// --- Vorschau --------------------------------------------------------------

export interface ImportPlan {
  /** Zeilen, die übernommen werden können. */
  accepted: IncomingPlayer[];
  added: { name: string; pos: string; college: string; rank: number }[];
  updated: { id: string; name: string; changes: FieldChange[] }[];
  unchanged: number;
  rejected: RowIssue[];
}

/** Vergleicht den Import mit den vorhandenen Spielern. Ändert nichts. */
export function planImport(current: readonly Player[], parsed: Extract<ParseResult, { ok: true }>): ImportPlan {
  const rejected: RowIssue[] = [...parsed.issues];
  const accepted: IncomingPlayer[] = [];
  const names = new Set(current.map((p) => normalizeName(p.name)));
  const ids = new Set(current.map((p) => p.id));

  for (const { row, player } of parsed.rows) {
    const known = (!!player.college && ids.has(makeId(player.name, player.college))) || names.has(normalizeName(player.name));
    if (!known && !(player.pos && player.college && player.rank)) {
      rejected.push({ row, name: player.name, code: 'incomplete_new_player', detail: 'Neue Spieler brauchen Position, College und Rank.' });
      continue;
    }
    accepted.push(player);
  }
  const merged = mergePlayers(current, accepted, 'overlay');
  return {
    accepted,
    added: merged.added.map((p) => ({ name: p.name, pos: p.pos, college: p.college, rank: p.rank })),
    updated: merged.updated,
    unchanged: merged.unchanged,
    rejected: rejected.sort((a, b) => a.row - b.row),
  };
}
