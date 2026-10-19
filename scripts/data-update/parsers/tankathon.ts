// Parser für die beiden Tankathon-Seiten. Reine Funktionen: HTML-Text rein, geprüfte Rohdaten raus.
// Ändert Tankathon den Seitenaufbau, werfen sie einen Fehler (statt Unsinn zu liefern) -> der Lauf schlägt sichtbar fehl,
// und die alten Dateien bleiben unverändert.

import { parse, type HTMLElement } from 'node-html-parser';
import { makeId, parseHeight, parseWeight } from '../../../src/data/names';
import { normalizePosition } from '../../../src/data/positions';
import { normalizeAbbr } from '../../../src/data/teams';
import type { DraftPick, IncomingPlayer } from '../../../src/data/types';

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

// --- Full Draft ------------------------------------------------------------

/** Teamkürzel aus der Logo-Adresse, z.B. ".../nfl/lac.svg" -> "LAC". */
function teamFromLogo(img: HTMLElement | null): string | undefined {
  const m = /\/nfl\/([a-z]{2,4})\.(?:svg|png)/i.exec(img?.getAttribute('src') ?? '');
  return m ? normalizeAbbr(m[1]) : undefined;
}

export function parseFullDraft(html: string): { year: number; picks: DraftPick[] } {
  const doc = parse(html);
  const title = clean(doc.querySelector('title')?.text) + ' ' + clean(doc.querySelector('.page-title')?.text);
  const year = Number(/\b(20\d\d)\b/.exec(title)?.[1]);
  if (!year) throw new Error('Draft-Jahr nicht gefunden (Seitentitel geändert?)');

  const rounds = doc.querySelectorAll('.full-draft-round');
  if (rounds.length === 0) throw new Error('Keine Runden gefunden (.full-draft-round fehlt – Seitenaufbau geändert?)');

  const picks: DraftPick[] = [];
  for (const r of rounds) {
    const round = Number(/(\d+)/.exec(clean(r.querySelector('.round-title')?.text))?.[1]);
    if (!round) throw new Error('Rundenüberschrift nicht lesbar');
    for (const tr of r.querySelectorAll('table.full-draft tr')) {
      const pick = Number(/(\d+)/.exec(clean(tr.querySelector('.pick-number')?.text))?.[1]);
      const team = teamFromLogo(tr.querySelector('.team-link img'));
      if (!pick || !team) throw new Error(`Pick nicht lesbar in Runde ${round}: "${clean(tr.text).slice(0, 60)}"`);
      const entry: DraftPick = { pick, round, team };
      const from = teamFromLogo(tr.querySelector('.trade img'));
      if (from && from !== team) entry.from = from;
      picks.push(entry);
    }
  }
  return { year, picks };
}

// --- Big Board -------------------------------------------------------------

export interface BigBoardParse {
  players: IncomingPlayer[];
  /** Spieler-ID -> Kennzahl -> Wert (Saisonsummen, so wie Tankathon sie zeigt) */
  stats: Record<string, Record<string, number>>;
}

const statKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** Der Hauptteil der Seite sind die Zeilen im ersten ".mock-rows"-Block. Spätere Blöcke sind Wiederholungen
 *  (nach College sortiert) oder Spieler späterer Jahrgänge ("future-players") und werden ignoriert. */
export function parseBigBoard(html: string): BigBoardParse {
  const doc = parse(html);
  const container = doc.querySelectorAll('.mock-rows').find((c) => !c.closest('.future-players') && !c.closest('.by-school-overall') && !c.closest('.by-school-offense-defense'));
  if (!container) throw new Error('Spielerliste nicht gefunden (.mock-rows fehlt – Seitenaufbau geändert?)');

  const players: IncomingPlayer[] = [];
  const stats: BigBoardParse['stats'] = {};
  const seen = new Set<string>();

  for (const row of container.querySelectorAll('.mock-row')) {
    if (row.classList.contains('future')) continue; // Jahrgang nach dem Draft-Jahr
    const rank = Number(clean(row.querySelector('.mock-row-pick-number')?.text));
    if (!Number.isInteger(rank) || rank < 1) continue; // "NR" = nicht gerankt
    const name = clean(row.querySelector('.mock-row-name')?.text);
    const [posText, ...schoolParts] = clean(row.querySelector('.mock-row-school-position')?.text).split(' | ');
    const college = schoolParts.join(' | ').trim() || clean(row.querySelector('.mock-row-logo img')?.getAttribute('alt'));
    if (!name || !college || !posText) throw new Error(`Spielerzeile nicht lesbar bei Rank ${rank}`);

    const positions: string[] = [];
    for (const part of posText.split('/')) {
      const p = normalizePosition(part);
      if (p) positions.push(p);
    }
    if (positions.length === 0) throw new Error(`Position unbekannt bei ${name}: "${posText}"`);

    const id = makeId(name, college);
    if (seen.has(id)) continue; // dieselbe Zeile doppelt
    seen.add(id);

    const player: IncomingPlayer = { name, college, pos: positions[0], rank };
    if (positions.length > 1) player.altPos = [...new Set(positions.slice(1))].filter((p) => p !== positions[0]);
    const hw = row.querySelector('.height-weight');
    const height = parseHeight(clean(hw?.childNodes.find((n) => (n as HTMLElement).tagName === 'DIV')?.text));
    const weight = parseWeight(clean(hw?.querySelectorAll('div')[1]?.text));
    if (height !== null) player.heightIn = height;
    if (weight !== null) player.weightLb = weight;
    players.push(player);

    const values: Record<string, number> = {};
    for (const s of row.querySelectorAll('.nfl-mock-row-stats .stat')) {
      const key = statKey(clean(s.querySelector('.label')?.text));
      const raw = clean(s.querySelector('.value.total')?.text);
      if (key && /^-?\d+(\.\d+)?$/.test(raw)) values[key] = Number(raw);
    }
    if (Object.keys(values).length) stats[id] = values;
  }
  if (players.length === 0) throw new Error('Keine Spieler gefunden');
  return { players, stats };
}
