// Trade-Wertchart: wie viel ist jeder Pick wert?
//
// WICHTIG (ehrlich): Die Original-Tabelle des Rich-Hill-Modells konnte nicht abgerufen werden (die Seite verbietet
// automatische Abrufe, das wird respektiert). Deshalb nutzt die App eine NÄHERUNG: Zwischen Stützstellen wird
// logarithmisch interpoliert.
//   - Geprüfte Stützstellen (Pick 13: 336, 61: 86, 93: 42, 207: 4, 232: 3, 251: 1, 252: 1) stammen aus einem
//     Zeitungsartikel zur Wertchart 2026 (Rams Wire / USA Today Network, 21.04.2026).
//   - ANNAHME: Pick 1 = 1000 (Größenordnung des Modells, nicht geprüft). Zwischen Pick 1 und 13 ist die Kurve damit
//     geschätzt.
// Wer die echte Tabelle hat, kann sie in den Einstellungen einfügen; sie ersetzt dann die Näherung.

import { getStorage } from '../storage/db';
import { KEYS } from '../storage/keys';
import { createStore } from '../store';

export interface TradeChart {
  name: string;
  /** true = Näherung der App, false = vom Nutzer importierte Tabelle. */
  approximate: boolean;
  /** Index 0 = Pick 1. */
  values: number[];
}

/** Abschlag für Picks des Folgejahres (Annahme, in den Einstellungen und der README genannt). */
export const FUTURE_DISCOUNT = 0.8;
/** Ein Pick des Folgejahres zählt wie der mittlere Pick seiner Runde (Annahme). */
export const FUTURE_MID_PICK = (round: number): number => 32 * (round - 1) + 16;
export const MIN_CHART_PICKS = 224;
export const MAX_CHART_PICKS = 300;

const ANCHORS: readonly (readonly [number, number])[] = [
  [1, 1000],
  [13, 336],
  [61, 86],
  [93, 42],
  [207, 4],
  [232, 3],
  [251, 1],
  [262, 1],
];

function buildApprox(): number[] {
  const values: number[] = [];
  for (let p = 1; p <= 262; p++) {
    let lo = ANCHORS[0];
    let hi = ANCHORS[ANCHORS.length - 1];
    for (let i = 0; i < ANCHORS.length - 1; i++) {
      if (p >= ANCHORS[i][0] && p <= ANCHORS[i + 1][0]) {
        lo = ANCHORS[i];
        hi = ANCHORS[i + 1];
        break;
      }
    }
    const t = hi[0] === lo[0] ? 0 : (p - lo[0]) / (hi[0] - lo[0]);
    const v = Math.exp(Math.log(lo[1]) + t * (Math.log(hi[1]) - Math.log(lo[1])));
    values.push(Math.round(v * 10) / 10);
  }
  return values;
}

export const BUILTIN_CHART: TradeChart = { name: 'Näherung (Rich-Hill-Größenordnung)', approximate: true, values: buildApprox() };

export type ChartError = 'empty' | 'bad_number' | 'duplicate' | 'gap' | 'too_short' | 'too_long' | 'not_descending';
export type ChartResult = { ok: true; chart: TradeChart } | { ok: false; error: ChartError; detail?: string };

const NUM = /-?\d+(?:[.,]\d+)?/g;
const toNum = (s: string) => Number(s.replace(',', '.'));

/** Liest eine eingefügte Tabelle: Zeilen "Pick Wert" (auch mehrere Paare je Zeile) oder nur eine Wertespalte in Pick-Reihenfolge. */
export function parseChartText(text: string, name = 'Eigene Tabelle'): ChartResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { ok: false, error: 'empty' };
  const rows = lines.map((l) => (l.match(NUM) ?? []).map(toNum));
  const useful = rows.filter((r) => r.length > 0);
  if (useful.length === 0) return { ok: false, error: 'empty' };

  const byPick = new Map<number, number>();
  const singleColumn = useful.every((r) => r.length === 1);
  if (singleColumn) {
    useful.forEach((r, i) => byPick.set(i + 1, r[0]));
  } else {
    for (const r of useful) {
      if (r.length < 2 || r.length % 2 !== 0) return { ok: false, error: 'bad_number', detail: r.join(' ') };
      for (let i = 0; i < r.length; i += 2) {
        const pick = r[i];
        if (!Number.isInteger(pick) || pick < 1) return { ok: false, error: 'bad_number', detail: String(pick) };
        if (byPick.has(pick)) return { ok: false, error: 'duplicate', detail: String(pick) };
        byPick.set(pick, r[i + 1]);
      }
    }
  }
  const n = byPick.size;
  if (n < MIN_CHART_PICKS) return { ok: false, error: 'too_short', detail: String(n) };
  if (n > MAX_CHART_PICKS) return { ok: false, error: 'too_long', detail: String(n) };
  const values: number[] = [];
  for (let p = 1; p <= n; p++) {
    const v = byPick.get(p);
    if (v === undefined) return { ok: false, error: 'gap', detail: String(p) };
    if (!Number.isFinite(v) || v <= 0 || v > 100000) return { ok: false, error: 'bad_number', detail: String(v) };
    if (p > 1 && v > values[p - 2]) return { ok: false, error: 'not_descending', detail: String(p) };
    values.push(v);
  }
  return { ok: true, chart: { name, approximate: false, values } };
}

/** Prüft eine gespeicherte Tabelle (z.B. aus einem Backup). */
export function sanitizeChart(raw: unknown): TradeChart | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.values) || r.values.length < MIN_CHART_PICKS || r.values.length > MAX_CHART_PICKS) return null;
  const values: number[] = [];
  for (const v of r.values) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 100000) return null;
    if (values.length && v > values[values.length - 1]) return null;
    values.push(v);
  }
  return { name: typeof r.name === 'string' && r.name ? r.name.slice(0, 60) : 'Eigene Tabelle', approximate: false, values };
}

export const chartStore = createStore<{ chart: TradeChart }>({ chart: BUILTIN_CHART });

export function getChart(): TradeChart {
  return chartStore.get().chart;
}

export function pickValue(pick: number, chart: TradeChart = getChart()): number {
  if (!Number.isFinite(pick) || pick < 1) return chart.values[0];
  const i = Math.min(Math.floor(pick), chart.values.length) - 1;
  return chart.values[i];
}

export function futureValue(round: number, chart: TradeChart = getChart()): number {
  return Math.round(pickValue(FUTURE_MID_PICK(round), chart) * FUTURE_DISCOUNT * 10) / 10;
}

export async function loadChart(): Promise<void> {
  try {
    const raw = await (await getStorage()).get(KEYS.tradeChart);
    chartStore.set({ chart: sanitizeChart(raw) ?? BUILTIN_CHART });
  } catch {
    /* Näherung bleibt */
  }
}

/** Speichert eine eigene Tabelle (oder null = zurück zur Näherung). */
export async function saveChart(chart: TradeChart | null): Promise<void> {
  chartStore.set({ chart: chart ?? BUILTIN_CHART });
  try {
    const storage = await getStorage();
    if (chart) await storage.set(KEYS.tradeChart, chart);
    else await storage.remove(KEYS.tradeChart);
  } catch {
    /* gilt trotzdem für diese Sitzung */
  }
}
