import { describe, expect, it, vi } from 'vitest';
import { PoliteFetcher, StopError, userAgentFor } from '../../scripts/data-update/politeFetch';
import { parseRobots } from '../../scripts/data-update/robots';
import { berlinTime, manualGate, scheduledGate } from '../../scripts/data-update/schedule';

const UA = userAgentFor('https://github.com/x/y');

describe('robots.txt', () => {
  const tankathonLike = `User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n`;
  const footballdbLike = `User-agent: *\nDisallow: /fantasy/\nDisallow: /logview.php\nAllow: /fantasy/public/\n# Kommentar\n`;

  it('wendet die Gruppe "*" an und erlaubt den Rest', () => {
    const r = parseRobots(tankathonLike, UA);
    expect(r.isAllowed('/nfl/big_board')).toBe(true);
    expect(r.isAllowed('/admin/x')).toBe(false);
  });

  it('nutzt die Gruppe, die unser Token nennt, sonst "*"', () => {
    expect(parseRobots('User-agent: NFL-Mock-Draft-Hobbyprojekt\nDisallow: /\n\nUser-agent: *\nAllow: /', UA).isAllowed('/a')).toBe(false);
    expect(parseRobots('User-agent: GPTBot\nDisallow: /', UA).isAllowed('/a')).toBe(true);
  });

  it('längste Übereinstimmung gewinnt, Allow schlägt gleich lange Disallow', () => {
    const r = parseRobots(footballdbLike, UA);
    expect(r.isAllowed('/fantasy/x')).toBe(false);
    expect(r.isAllowed('/fantasy/public/x')).toBe(true);
    expect(r.isAllowed('/logview.php?a=1')).toBe(false);
    expect(r.isAllowed('/stats/index.html')).toBe(true);
  });

  it('versteht * und $ und mehrere User-Agent-Zeilen pro Gruppe', () => {
    const r = parseRobots('User-agent: a\nUser-agent: *\nDisallow: /*.pdf$\n', UA);
    expect(r.isAllowed('/x.pdf')).toBe(false);
    expect(r.isAllowed('/x.pdf.html')).toBe(true);
  });

  it('leere oder fehlende Regeln erlauben alles', () => {
    expect(parseRobots('', UA).isAllowed('/alles')).toBe(true);
    expect(parseRobots('User-agent: *\nDisallow:', UA).isAllowed('/alles')).toBe(true);
  });
});

function res(status: number, body = '', headers: Record<string, string> = {}): Response {
  return new Response(status === 304 ? null : body, { status, headers });
}

function fetcher(handler: (url: string, init?: RequestInit) => Response | Promise<Response>, over: Record<string, unknown> = {}) {
  const sleeps: number[] = [];
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as unknown as typeof fetch;
  const f = new PoliteFetcher({ userAgent: UA, fetchFn, sleep: async (ms) => void sleeps.push(ms), random: () => 0.5, ...over });
  return { f, sleeps, calls };
}

const okRobots = (url: string) => (url.endsWith('/robots.txt') ? res(200, 'User-agent: *\nDisallow: /admin') : res(200, '<html>' + 'x'.repeat(50) + '</html>', { etag: '"abc"' }));

describe('Höfliches Abrufen', () => {
  it('prüft robots.txt, sendet ehrlichen User-Agent und liefert ETag', async () => {
    const { f, calls } = fetcher(okRobots);
    const r = await f.get('https://example.com/nfl/big_board');
    expect(r).toMatchObject({ status: 'ok', etag: '"abc"' });
    expect(calls[0].url).toBe('https://example.com/robots.txt');
    expect(calls[1].url).toBe('https://example.com/nfl/big_board');
    const h = calls[1].init?.headers as Record<string, string>;
    expect(h['User-Agent']).toContain('NFL-Mock-Draft-Hobbyprojekt/1.0');
    expect(h['User-Agent']).toContain('https://github.com/x/y');
  });

  it('wartet zwischen den Anfragen 15–45 s, vor der allerersten nicht', async () => {
    const { f, sleeps } = fetcher(okRobots);
    await f.get('https://example.com/a');
    await f.get('https://example.com/b');
    // robots.txt (erste Anfrage: keine Pause), Seite a, Seite b
    expect(sleeps).toHaveLength(2);
    expect(sleeps.every((ms) => ms >= 15_000 && ms <= 45_000)).toBe(true);
  });

  it('liest robots.txt pro Domain nur einmal', async () => {
    const { f, calls } = fetcher(okRobots);
    await f.get('https://example.com/a');
    await f.get('https://example.com/b');
    expect(calls.filter((c) => c.url.endsWith('robots.txt'))).toHaveLength(1);
  });

  it('ruft verbotene Pfade nicht ab', async () => {
    const { f, calls } = fetcher(okRobots);
    await expect(f.get('https://example.com/admin/x')).rejects.toMatchObject({ reason: 'robots' });
    expect(calls.some((c) => c.url.includes('/admin/x'))).toBe(false);
  });

  it('sendet If-None-Match und erkennt 304', async () => {
    const { f, calls } = fetcher((u) => (u.endsWith('robots.txt') ? res(404) : res(304)));
    const r = await f.get('https://example.com/a', { etag: '"abc"', lastModified: 'Mon, 01 Jan 2026 00:00:00 GMT' });
    expect(r.status).toBe('not-modified');
    const h = calls[1].init?.headers as Record<string, string>;
    expect(h['If-None-Match']).toBe('"abc"');
    expect(h['If-Modified-Since']).toContain('2026');
  });

  it.each([
    [429, 'blocked'],
    [403, 'blocked'],
    [500, 'server'],
    [503, 'server'],
  ])('stoppt sofort bei HTTP %i', async (status, reason) => {
    const { f, calls } = fetcher((u) => (u.endsWith('robots.txt') ? res(200, '') : res(status as number)));
    await expect(f.get('https://example.com/a')).rejects.toMatchObject({ reason });
    expect(calls).toHaveLength(2); // kein erneuter Versuch
  });

  it('stoppt, wenn robots.txt selbst blockiert wird', async () => {
    const { f } = fetcher(() => res(429));
    await expect(f.get('https://example.com/a')).rejects.toMatchObject({ reason: 'blocked' });
  });

  it('stoppt bei einer Captcha-Seite', async () => {
    const { f } = fetcher((u) => (u.endsWith('robots.txt') ? res(404) : res(200, '<html>Please verify you are human (captcha)</html>')));
    await expect(f.get('https://example.com/a')).rejects.toMatchObject({ reason: 'captcha' });
  });

  it('erlaubt höchstens maxPages Seiten', async () => {
    const { f } = fetcher(okRobots, { maxPages: 2 });
    await f.get('https://example.com/1');
    await f.get('https://example.com/2');
    await expect(f.get('https://example.com/3')).rejects.toMatchObject({ reason: 'limit' });
  });

  it('bricht nach dem Zeitlimit ab', async () => {
    const hang = (_u: string, init?: RequestInit) => new Promise<Response>((_ok, no) => init?.signal?.addEventListener('abort', () => no(new Error('abort'))));
    const { f } = fetcher(hang, { timeoutMs: 20 });
    await expect(f.get('https://example.com/a')).rejects.toMatchObject({ reason: 'timeout' });
  });

  it('meldet Netzwerkfehler als StopError', async () => {
    const { f } = fetcher(() => {
      throw new Error('ENOTFOUND');
    });
    await expect(f.get('https://example.com/a')).rejects.toBeInstanceOf(StopError);
  });
});

describe('Zeitsteuerung (Berliner Zeit)', () => {
  it('rechnet Sommer- und Winterzeit korrekt um', () => {
    expect(berlinTime(new Date('2026-07-07T06:00:00Z'))).toMatchObject({ weekday: 2, minutesOfDay: 8 * 60, date: '2026-07-07' }); // MESZ
    expect(berlinTime(new Date('2026-12-01T07:00:00Z'))).toMatchObject({ weekday: 2, minutesOfDay: 8 * 60, date: '2026-12-01' }); // MEZ
  });

  it('Tankathon läuft dienstags ab 08:00 Berliner Zeit – im Sommer nur der 06-Uhr-UTC-Start', () => {
    // Sommerzeit: 06:00 UTC = 08:00 Berlin -> läuft; 07:00 UTC wird später am selben Tag durch "heute gelaufen" gesperrt
    expect(scheduledGate('tankathon-order', new Date('2026-07-07T05:00:00Z'), undefined)).toMatchObject({ run: false }); // 07:00 Berlin: zu früh
    expect(scheduledGate('tankathon-order', new Date('2026-07-07T06:00:00Z'), undefined)).toEqual({ run: true });
    expect(scheduledGate('tankathon-order', new Date('2026-07-07T07:00:00Z'), '2026-07-07')).toMatchObject({ run: false, reason: expect.stringContaining('bereits') });
  });

  it('Winterzeit: der 06-UTC-Start ist zu früh, der 07-UTC-Start passt', () => {
    expect(scheduledGate('tankathon-order', new Date('2026-12-01T06:00:00Z'), undefined)).toMatchObject({ run: false });
    expect(scheduledGate('tankathon-order', new Date('2026-12-01T07:00:00Z'), undefined)).toEqual({ run: true });
  });

  it('toleriert Verspätung bis 3 Stunden, danach nicht mehr', () => {
    expect(scheduledGate('tankathon-order', new Date('2026-12-01T09:30:00Z'), undefined)).toEqual({ run: true });
    expect(scheduledGate('tankathon-order', new Date('2026-12-01T12:00:00Z'), undefined)).toMatchObject({ run: false });
  });

  it('läuft nur am richtigen Wochentag', () => {
    expect(scheduledGate('tankathon-order', new Date('2026-12-02T07:00:00Z'), undefined)).toMatchObject({ run: false, reason: expect.stringContaining('Wochentag') });
  });

  it('Big Board startet 20 Minuten nach der Draft-Reihenfolge', () => {
    expect(scheduledGate('tankathon-board', new Date('2026-12-01T07:10:00Z'), undefined)).toMatchObject({ run: false });
    expect(scheduledGate('tankathon-board', new Date('2026-12-01T07:20:00Z'), undefined)).toEqual({ run: true });
  });


  it('manueller Start nur einmal pro Tag und Quelle', () => {
    const now = new Date('2026-10-18T10:00:00Z');
    expect(manualGate(undefined, now)).toEqual({ run: true });
    expect(manualGate('2026-10-17', now)).toEqual({ run: true });
    expect(manualGate('2026-10-18', now)).toMatchObject({ run: false });
  });
});
