import { describe, expect, it } from 'vitest';
import { applyAiPick, createSession, type DraftSession } from '../../src/draft/engine';
import { gradeDraft } from '../../src/draft/grades';
import { resolveNeeds } from '../../src/draft/needs';
import { RECAP_HEADER, RECAP_ROW, buildRecap, recapFileName, recapHeight } from '../../src/export/recap';
import { makeBoard, makeDraftOrder } from './helpers';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function finished(rounds = 3): DraftSession {
  const r = createSession({
    order: makeDraftOrder().picks,
    players: makeBoard(300).players,
    needs: resolveNeeds(undefined),
    year: 2027,
    config: { rounds, userTeams: ['LAC'], randomness: 'realistic', seed: 9 },
    now: new Date('2026-10-19T10:00:00Z'),
  });
  if (!r.ok) throw new Error(r.error);
  let s = r.session;
  for (let g = 0; g < 1000 && s.status === 'running'; g++) s = applyAiPick(s);
  return s;
}

describe('buildRecap', () => {
  it('liefert alle Picks des Teams in Pick-Reihenfolge mit Noten', () => {
    const s = finished();
    const g = gradeDraft(s);
    const r = buildRecap(s, g, 'LAC')!;
    expect(r).toBeTruthy();
    expect(r.rows.length).toBe(g.teams.LAC.picks.length);
    expect(r.rows.map((x) => x.pick)).toEqual([...r.rows.map((x) => x.pick)].sort((a, b) => a - b));
    expect(r.grade).toBe(g.teams.LAC.grade);
    expect(r.year).toBe(2027);
    for (const row of r.rows) {
      expect(row.name).toBeTruthy();
      expect(row.grade).toBeTruthy();
    }
  });
  it('gibt null zurück, wenn ein Team nichts gepickt hat', () => {
    const s = finished(1);
    expect(buildRecap(s, gradeDraft(s), 'XXX')).toBeNull();
  });
  it('Dateiname ist sauber, Höhe wächst mit den Zeilen', () => {
    expect(recapFileName({ team: 'LAC', year: 2027 })).toBe('mock-draft-2027-LAC.png');
    expect(recapFileName({ team: '../x y', year: 2027 })).toBe('mock-draft-2027-xy.png');
    expect(recapHeight(8) - recapHeight(7)).toBe(RECAP_ROW);
    expect(recapHeight(0)).toBeGreaterThan(RECAP_HEADER);
  });
});

describe('Logos', () => {
  it('jede Logo-Datei ist klein genug für schnelle Ladezeit und das Export-PNG (≤ 150 KB)', () => {
    const dir = join(process.cwd(), 'public', 'logos');
    const files = readdirSync(dir).filter((f) => /\.(png|svg|webp)$/i.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(statSync(join(dir, f)).size, f).toBeLessThanOrEqual(150 * 1024);
  });
});
