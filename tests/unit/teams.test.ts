import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEAMS, getTeam, normalizeAbbr, readableTextOn, teamLabel } from '../../src/data/teams';

describe('Teams', () => {
  it('hat genau 32 Teams mit eindeutigen Kürzeln', () => {
    expect(TEAMS).toHaveLength(32);
    expect(new Set(TEAMS.map((x) => x.abbr)).size).toBe(32);
  });

  it('hat je Division genau 4 Teams (8 Divisionen)', () => {
    const counts = new Map<string, number>();
    for (const x of TEAMS) counts.set(`${x.conference}-${x.division}`, (counts.get(`${x.conference}-${x.division}`) ?? 0) + 1);
    expect(counts.size).toBe(8);
    for (const n of counts.values()) expect(n).toBe(4);
  });

  it('hat gültige Teamfarben', () => {
    for (const x of TEAMS) {
      expect(x.primary).toMatch(/^#[0-9A-F]{6}$/i);
      expect(x.secondary).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('hat für jedes Team eine Logo-Datei in public/logos', () => {
    for (const x of TEAMS) {
      const file = ['png', 'svg', 'webp'].map((e) => join('public', 'logos', `${x.abbr}.${e}`)).find((p) => existsSync(p));
      expect(file, `Logo für ${x.abbr}`).toBeTruthy();
      expect(statSync(file!).size).toBeGreaterThan(500);
    }
  });

  it('erkennt abweichende Kürzel', () => {
    expect(normalizeAbbr('wsh')).toBe('WAS');
    expect(normalizeAbbr('JAC')).toBe('JAX');
    expect(getTeam('OAK')?.abbr).toBe('LV');
    expect(getTeam('XXX')).toBeUndefined();
    expect(teamLabel('CAR')).toBe('Carolina Panthers');
    expect(teamLabel('XXX')).toBe('XXX');
  });

  it('wählt lesbare Schriftfarbe', () => {
    expect(readableTextOn('#000000')).toBe('#ffffff');
    expect(readableTextOn('#FFB612')).toBe('#000000');
    expect(readableTextOn('kaputt')).toBe('#ffffff');
  });
});
