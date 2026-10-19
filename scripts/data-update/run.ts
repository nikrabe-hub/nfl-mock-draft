// Daten-Job: holt (höflich) eine Quelle, prüft das Ergebnis und schreibt die Datei nur, wenn alle Prüfungen bestehen.
// Aufruf (im GitHub-Workflow):  npx tsx scripts/data-update/run.ts --source=tankathon-board --trigger=schedule
// Exit-Code 0 = alles gut oder bewusst übersprungen, 1 = fehlgeschlagen (GitHub meldet das per E-Mail).

import { appendFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { mergePlayers } from '../../src/data/merge';
import type { BigBoardFile, CollegeStatsFile, DraftOrderFile, DraftPick, IncomingPlayer } from '../../src/data/types';
import { MIN_BOARD_PLAYERS, validateBigBoard, validateCollegeStats, validateDraftOrder } from '../../src/data/validate';
import { PoliteFetcher, StopError, userAgentFor, type FetchResult } from './politeFetch';
import { manualGate, scheduledGate, berlinTime, type SourceName } from './schedule';
import { emptySource, readState, writeState, type State } from './state';

export const URLS = {
  'tankathon-order': 'https://www.tankathon.com/nfl/full-draft',
  'tankathon-board': 'https://www.tankathon.com/nfl/big-board',
} as const;

export const QUELLEN = {
  'tankathon-order': 'Tankathon Full Draft (tankathon.com/nfl/full-draft)',
  'tankathon-board': 'Tankathon Big Board (tankathon.com/nfl/big-board)',
} as const;

export interface Parsers {
  'tankathon-order'?: (html: string) => { year: number; picks: DraftPick[] };
  'tankathon-board'?: (html: string) => { players: IncomingPlayer[]; stats: Record<string, Record<string, number>> };
}

export interface RunDeps {
  root: string;
  now: Date;
  trigger: 'schedule' | 'manual';
  fetcher: Pick<PoliteFetcher, 'get'>;
  parsers: Parsers;
  log?: (msg: string) => void;
}

export type RunResult =
  | { status: 'skipped'; message: string }
  | { status: 'unchanged'; message: string }
  | { status: 'updated'; message: string; files: string[] }
  | { status: 'failed'; message: string };

const STATE_FILE = 'data-state/state.json';

/** Ein Update darf höchstens so viel Prozent der bisherigen Spieler "verlieren" (sonst Verdacht auf kaputten Abruf). */
const MAX_SHRINK = 0.7;

/** College-Saison, die gerade läuft: ab August das laufende Jahr, davor das Vorjahr. */
export function collegeSeason(now: Date): number {
  const y = Number(berlinTime(now).date.slice(0, 4));
  return berlinTime(now).month >= 8 ? y : y - 1;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  // erst in eine Hilfsdatei, dann umbenennen: nie eine halbe Datei hinterlassen
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  const { rename } = await import('node:fs/promises');
  await rename(tmp, file);
}

export async function runSource(source: SourceName, deps: RunDeps): Promise<RunResult> {
  const log = deps.log ?? (() => undefined);
  const stateFile = join(deps.root, STATE_FILE);
  const state: State = await readState(stateFile);
  const st = (state[source] ??= emptySource());
  const today = berlinTime(deps.now).date;

  // 1. Darf jetzt gelaufen werden?
  const gate = deps.trigger === 'manual' ? manualGate(st.lastManual, deps.now) : scheduledGate(source, deps.now, st.lastRun);
  if (!gate.run) return { status: 'skipped', message: `${source}: übersprungen – ${gate.reason}` };

  // Ab hier gilt der Lauf als versucht (auch bei Fehlern), damit ein zweiter Cron-Start nicht gleich nochmal anfragt.
  st.lastRun = today;
  if (deps.trigger === 'manual') st.lastManual = today;

  try {
    let result: RunResult;
    if (source === 'tankathon-order') result = await runOrder(deps, st, today, log);
    else if (source === 'tankathon-board') result = await runBoard(deps, st, today, log);
    else result = { status: 'failed', message: `Unbekannte Quelle: ${String(source)}` };
    if (result.status !== 'failed') st.lastSuccess = today;
    await writeState(stateFile, state);
    return result;
  } catch (e) {
    await writeState(stateFile, state);
    const msg = e instanceof StopError ? `${e.message} (${e.reason})` : `Unerwarteter Fehler: ${(e as Error).message}`;
    return { status: 'failed', message: `${source}: ${msg}. Die bisherigen Dateien bleiben unverändert.` };
  }
}

async function fetchPage(deps: RunDeps, url: string, st: ReturnType<typeof emptySource>, today: string): Promise<Extract<FetchResult, { status: 'ok' }> | null> {
  const prev = st.pages[url] ?? {};
  const res = await deps.fetcher.get(url, { etag: prev.etag, lastModified: prev.lastModified });
  if (res.status === 'not-modified') {
    st.pages[url] = { ...prev, fetchedOn: today };
    return null;
  }
  st.pages[url] = { etag: res.etag, lastModified: res.lastModified, fetchedOn: today };
  return res;
}

async function runOrder(deps: RunDeps, st: ReturnType<typeof emptySource>, today: string, log: (m: string) => void): Promise<RunResult> {
  const parse = deps.parsers['tankathon-order'];
  if (!parse) return { status: 'failed', message: 'tankathon-order: Es ist noch kein Parser eingebaut.' };
  const page = await fetchPage(deps, URLS['tankathon-order'], st, today);
  if (!page) return { status: 'unchanged', message: 'tankathon-order: Seite unverändert (HTTP 304).' };

  const parsed = parse(page.body);
  const file = join(deps.root, 'public/data/draft-order.json');
  const old = await readJson<DraftOrderFile>(file);
  const candidate = { quelle: QUELLEN['tankathon-order'], abgerufenAm: deps.now.toISOString(), version: (old?.version ?? 0) + 1, year: parsed.year, picks: parsed.picks };
  const check = validateDraftOrder(candidate, deps.now);
  if (!check.ok) {
    return { status: 'failed', message: `tankathon-order: Plausibilitätsprüfung fehlgeschlagen (${check.issues.map((i) => i.code + (i.detail ? ` ${i.detail}` : '')).join('; ')}). Die alte Datei bleibt.` };
  }
  if (old && old.year === check.data.year && JSON.stringify(old.picks) === JSON.stringify(check.data.picks)) {
    log('Reihenfolge unverändert');
    return { status: 'unchanged', message: 'tankathon-order: keine inhaltlichen Änderungen.' };
  }
  await writeJson(file, check.data);
  return { status: 'updated', message: `tankathon-order: ${check.data.picks.length} Picks gespeichert.`, files: ['public/data/draft-order.json'] };
}

async function runBoard(deps: RunDeps, st: ReturnType<typeof emptySource>, today: string, log: (m: string) => void): Promise<RunResult> {
  const parse = deps.parsers['tankathon-board'];
  if (!parse) return { status: 'failed', message: 'tankathon-board: Es ist noch kein Parser eingebaut.' };
  const page = await fetchPage(deps, URLS['tankathon-board'], st, today);
  if (!page) return { status: 'unchanged', message: 'tankathon-board: Seite unverändert (HTTP 304).' };

  const { players: incoming, stats } = parse(page.body);
  const file = join(deps.root, 'public/data/big-board.json');
  const statsFile = join(deps.root, 'public/data/college-stats.json');
  const old = await readJson<BigBoardFile>(file);
  const merged = mergePlayers(old?.players ?? [], incoming, 'scrape');
  const candidate = { quelle: QUELLEN['tankathon-board'], abgerufenAm: deps.now.toISOString(), version: (old?.version ?? 0) + 1, players: merged.players };
  const check = validateBigBoard(candidate, { now: deps.now });
  if (!check.ok) {
    return { status: 'failed', message: `tankathon-board: Plausibilitätsprüfung fehlgeschlagen (${check.issues.map((i) => i.code + (i.detail ? ` ${i.detail}` : '')).join('; ')}). Die alte Datei bleibt.` };
  }

  // Schutz vor einem kaputten Abruf: ein Update darf die Liste nicht plötzlich stark schrumpfen lassen.
  const before = old ? old.players.filter((p) => !p.notListed).length : 0;
  const after = check.data.players.filter((p) => !p.notListed).length;
  if (before >= MIN_BOARD_PLAYERS && after < before * MAX_SHRINK) {
    return { status: 'failed', message: `tankathon-board: Nur noch ${after} statt ${before} Spieler gelistet – das sieht nach einem fehlerhaften Abruf aus. Die alten Dateien bleiben.` };
  }

  // Statistiken stammen von derselben Seite: neue Werte ersetzen alte, Spieler ohne neue Werte behalten ihre bisherigen.
  const oldStats = await readJson<CollegeStatsFile>(statsFile);
  const season = collegeSeason(deps.now);
  const keepOld = oldStats && oldStats.season === season ? oldStats.stats : {};
  const statsCandidate = { quelle: QUELLEN['tankathon-board'] + ' – Statistiken', abgerufenAm: deps.now.toISOString(), version: (oldStats?.version ?? 0) + 1, season, stats: { ...keepOld, ...stats } };
  const statsCheck = validateCollegeStats(statsCandidate, deps.now);
  if (!statsCheck.ok) {
    return { status: 'failed', message: `tankathon-board: Statistiken unplausibel (${statsCheck.issues.map((i) => i.code + (i.detail ? ` ${i.detail}` : '')).join('; ')}). Die alten Dateien bleiben.` };
  }

  const files: string[] = [];
  if (!old || JSON.stringify(old.players) !== JSON.stringify(check.data.players)) {
    await writeJson(file, check.data);
    files.push('public/data/big-board.json');
  }
  if (!oldStats || oldStats.season !== season || JSON.stringify(oldStats.stats) !== JSON.stringify(statsCheck.data.stats)) {
    await writeJson(statsFile, statsCheck.data);
    files.push('public/data/college-stats.json');
  }
  if (files.length === 0) {
    log('Big Board unverändert');
    return { status: 'unchanged', message: 'tankathon-board: keine inhaltlichen Änderungen.' };
  }
  return {
    status: 'updated',
    message: `tankathon-board: ${check.data.players.length} Spieler (neu ${merged.added.length}, geändert ${merged.updated.length}, nicht mehr gelistet ${merged.notListed.length}), Statistiken zu ${Object.keys(statsCheck.data.stats).length} Spielern.`,
    files,
  };
}

// --- Kommandozeile ----------------------------------------------------------

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const source = arg('source') as SourceName | undefined;
  if (source !== 'tankathon-order' && source !== 'tankathon-board') {
    console.error('Aufruf: --source=tankathon-order|tankathon-board [--trigger=schedule|manual]');
    process.exit(2);
  }
  const trigger = arg('trigger') === 'manual' ? 'manual' : 'schedule';
  const repo = process.env.GITHUB_REPOSITORY ?? 'unbekannt/nfl-mock-draft';
  const { PARSERS } = await import('./parsers');
  const log = (m: string) => console.log(m);

  const result = await runSource(source, {
    root: process.cwd(),
    now: new Date(),
    trigger,
    fetcher: new PoliteFetcher({ userAgent: userAgentFor(`https://github.com/${repo}`), log }),
    parsers: PARSERS,
    log,
  });

  console.log(result.message);
  const out = process.env.GITHUB_OUTPUT;
  if (out) appendFileSync(out, `status=${result.status}\nchanged=${result.status === 'updated'}\n`);
  if (result.status === 'failed') {
    console.log(`::error title=Daten-Update fehlgeschlagen::${result.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && /run\.[tj]s$/.test(process.argv[1])) void main();
