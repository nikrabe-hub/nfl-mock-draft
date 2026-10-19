// Höfliches Abrufen fremder Seiten (nur vom Daten-Job benutzt, nie von der App).
// Regeln: nacheinander, 15–45 s Pause, höchstens 10 Seiten je Lauf, robots.txt prüfen,
// ehrlicher User-Agent, ETag/Last-Modified, sofort stoppen bei 429/403/5xx/Captcha, 30 s Zeitlimit.

import { parseRobots, type RobotsRules } from './robots';

export class StopError extends Error {
  constructor(
    message: string,
    readonly reason: 'blocked' | 'robots' | 'server' | 'captcha' | 'timeout' | 'limit' | 'network',
  ) {
    super(message);
    this.name = 'StopError';
  }
}

export interface PoliteOptions {
  userAgent: string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  maxPages?: number;
  minPauseMs?: number;
  maxPauseMs?: number;
  timeoutMs?: number;
  log?: (msg: string) => void;
}

export interface Conditional {
  etag?: string;
  lastModified?: string;
}

export type FetchResult =
  | { status: 'ok'; body: string; etag?: string; lastModified?: string }
  | { status: 'not-modified' };

const CAPTCHA = /captcha|are you a robot|verify you are human|cf-chl|attention required|access denied/i;

export class PoliteFetcher {
  private readonly o: Required<Omit<PoliteOptions, 'log'>> & { log: (m: string) => void };
  private pages = 0;
  private lastRequestAt = 0;
  private robots = new Map<string, RobotsRules>();

  constructor(opts: PoliteOptions) {
    this.o = {
      userAgent: opts.userAgent,
      fetchFn: opts.fetchFn ?? fetch,
      sleep: opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      random: opts.random ?? Math.random,
      maxPages: opts.maxPages ?? 10,
      minPauseMs: opts.minPauseMs ?? 15_000,
      maxPauseMs: opts.maxPauseMs ?? 45_000,
      timeoutMs: opts.timeoutMs ?? 30_000,
      log: opts.log ?? (() => undefined),
    };
  }

  get pageCount(): number {
    return this.pages;
  }

  private async pause(): Promise<void> {
    if (this.lastRequestAt === 0) return;
    const wait = this.o.minPauseMs + Math.floor(this.o.random() * (this.o.maxPauseMs - this.o.minPauseMs + 1));
    this.o.log(`Pause ${Math.round(wait / 1000)} s`);
    await this.o.sleep(wait);
  }

  private async request(url: string, headers: Record<string, string>): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.o.timeoutMs);
    try {
      return await this.o.fetchFn(url, { headers: { 'User-Agent': this.o.userAgent, ...headers }, signal: ctl.signal, redirect: 'follow' });
    } catch (e) {
      if (ctl.signal.aborted) throw new StopError(`Zeitüberschreitung nach ${this.o.timeoutMs / 1000} s: ${url}`, 'timeout');
      throw new StopError(`Netzwerkfehler bei ${url}: ${(e as Error).message}`, 'network');
    } finally {
      clearTimeout(timer);
      this.lastRequestAt = Date.now() || 1;
    }
  }

  private async rulesFor(url: URL): Promise<RobotsRules> {
    const cached = this.robots.get(url.origin);
    if (cached) return cached;
    await this.pause();
    this.o.log(`robots.txt von ${url.origin} lesen`);
    const res = await this.request(`${url.origin}/robots.txt`, { Accept: 'text/plain' });
    let rules: RobotsRules;
    if (res.status === 404 || res.status === 410) {
      rules = { isAllowed: () => true }; // keine robots.txt = nichts verboten
    } else if (res.status === 429 || res.status === 403 || res.status >= 500) {
      throw new StopError(`robots.txt nicht abrufbar (HTTP ${res.status}) – Lauf wird abgebrochen`, res.status >= 500 ? 'server' : 'blocked');
    } else if (!res.ok) {
      throw new StopError(`robots.txt unerwartet (HTTP ${res.status}) – Lauf wird abgebrochen`, 'robots');
    } else {
      rules = parseRobots(await res.text(), this.o.userAgent);
    }
    this.robots.set(url.origin, rules);
    return rules;
  }

  /** Holt eine Seite. Wirft StopError, wenn der Lauf sofort enden muss. */
  async get(rawUrl: string, cond: Conditional = {}): Promise<FetchResult> {
    const url = new URL(rawUrl);
    if (this.pages >= this.o.maxPages) throw new StopError(`Seitenlimit (${this.o.maxPages}) erreicht`, 'limit');

    const rules = await this.rulesFor(url);
    if (!rules.isAllowed(url.pathname + url.search)) throw new StopError(`robots.txt verbietet ${url.pathname} – wird nicht abgerufen`, 'robots');

    await this.pause();
    this.pages++;
    const headers: Record<string, string> = { Accept: 'text/html,application/xhtml+xml' };
    if (cond.etag) headers['If-None-Match'] = cond.etag;
    if (cond.lastModified) headers['If-Modified-Since'] = cond.lastModified;
    this.o.log(`GET ${rawUrl}`);
    const res = await this.request(rawUrl, headers);

    if (res.status === 304) return { status: 'not-modified' };
    if (res.status === 429 || res.status === 403) throw new StopError(`Zugriff abgelehnt (HTTP ${res.status}) – Lauf wird sofort beendet`, 'blocked');
    if (res.status >= 500) throw new StopError(`Serverfehler (HTTP ${res.status}) – Lauf wird sofort beendet`, 'server');
    if (!res.ok) throw new StopError(`Unerwartete Antwort (HTTP ${res.status}) bei ${rawUrl}`, 'server');

    const body = await res.text();
    if (CAPTCHA.test(body.slice(0, 5000)) && body.length < 20_000) throw new StopError('Die Seite verlangt offenbar ein Captcha/eine Prüfung – Lauf wird beendet', 'captcha');
    return {
      status: 'ok',
      body,
      etag: res.headers.get('etag') ?? undefined,
      lastModified: res.headers.get('last-modified') ?? undefined,
    };
  }
}

export function userAgentFor(repoUrl: string): string {
  return `Mozilla/5.0 (compatible; NFL-Mock-Draft-Hobbyprojekt/1.0; +${repoUrl})`;
}
