import { describe, expect, it } from 'vitest';
import { applyBackup, BACKUP_FORMAT, BACKUP_VERSION, backupFileName, createBackup, validateBackup } from '../../src/storage/backup';
import { createStorage } from '../../src/storage/db';

const valid = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: '2026-10-18T10:00:00.000Z', data, ...extra });

describe('Backup-Validierung', () => {
  it('akzeptiert ein gültiges Backup', () => {
    const r = validateBackup(valid({ settings: { theme: 'dark' } }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.backup.data.settings).toEqual({ theme: 'dark' });
  });

  it('meldet Nicht-JSON', () => {
    expect(validateBackup('das ist kein json')).toMatchObject({ ok: false, code: 'not_json' });
    expect(validateBackup('')).toMatchObject({ ok: false, code: 'not_json' });
  });

  it('meldet falsches Format', () => {
    expect(validateBackup('[1,2,3]')).toMatchObject({ ok: false, code: 'wrong_format' });
    expect(validateBackup('null')).toMatchObject({ ok: false, code: 'wrong_format' });
    expect(validateBackup(JSON.stringify({ format: 'etwas-anderes', version: 1, data: {} }))).toMatchObject({ ok: false, code: 'wrong_format' });
    expect(validateBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 'x', data: {} }))).toMatchObject({ ok: false, code: 'wrong_format' });
  });

  it('meldet neuere Version', () => {
    expect(validateBackup(valid({}, { version: BACKUP_VERSION + 1 }))).toMatchObject({ ok: false, code: 'newer_version' });
  });

  it('meldet fehlende oder falsche Daten', () => {
    expect(validateBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1 }))).toMatchObject({ ok: false, code: 'bad_data' });
    expect(validateBackup(valid([] as unknown as Record<string, unknown>))).toMatchObject({ ok: false, code: 'bad_data' });
  });

  it('lehnt gefährliche oder ungültige Schlüssel ab', () => {
    const proto = '{"format":"' + BACKUP_FORMAT + '","version":1,"data":{"__proto__":{"x":1}}}';
    expect(validateBackup(proto)).toMatchObject({ ok: false, code: 'bad_key' });
    expect(validateBackup(valid({ 'mit leerzeichen': 1 }))).toMatchObject({ ok: false, code: 'bad_key' });
    expect(validateBackup(valid({ '__probe__': 1 }))).toMatchObject({ ok: false, code: 'bad_key' });
  });

  it('lehnt zu große Dateien ab', () => {
    expect(validateBackup('x'.repeat(25_000_001))).toMatchObject({ ok: false, code: 'too_large' });
  });
});

describe('Backup Export/Import', () => {
  it('überträgt alle Daten von einem Speicher in einen anderen', async () => {
    const pc = await createStorage({ prefer: 'memory' });
    await pc.set('settings', { theme: 'dark', lang: 'en' });
    await pc.set('watchlist', ['p1', 'p2']);
    const backup = await createBackup(pc, new Date('2026-10-18T10:00:00Z'));
    expect(backup.createdAt).toBe('2026-10-18T10:00:00.000Z');

    const handy = await createStorage({ prefer: 'memory' });
    const checked = validateBackup(JSON.stringify(backup));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(await applyBackup(handy, checked.backup)).toEqual({ written: 2 });
    expect(await handy.get('settings')).toEqual({ theme: 'dark', lang: 'en' });
    expect(await handy.get('watchlist')).toEqual(['p1', 'p2']);
  });

  it('lässt den Speicher unverändert, wenn die Datei ungültig ist', async () => {
    const s = await createStorage({ prefer: 'memory' });
    await s.set('settings', { theme: 'light' });
    const r = validateBackup('{"kaputt');
    expect(r.ok).toBe(false);
    expect(await s.get('settings')).toEqual({ theme: 'light' });
  });

  it('rollt zurück, wenn das Schreiben mittendrin fehlschlägt', async () => {
    const s = await createStorage({ prefer: 'memory' });
    await s.set('a', 'alt-a');
    const realSet = s.set.bind(s);
    let calls = 0;
    s.set = async (key: string, value: unknown) => {
      calls++;
      if (calls === 2) throw new Error('Schreibfehler'); // zweiter Eintrag scheitert
      return realSet(key, value);
    };
    const backup = { format: BACKUP_FORMAT, version: 1, createdAt: '', data: { a: 'neu-a', b: 'neu-b' } } as const;
    await expect(applyBackup(s, { ...backup, data: { ...backup.data } })).rejects.toThrow('Schreibfehler');
    s.set = realSet;
    expect(await s.get('a')).toBe('alt-a');
    expect(await s.get('b')).toBeUndefined();
  });

  it('erzeugt einen sprechenden Dateinamen', () => {
    expect(backupFileName(new Date('2026-10-18T10:00:00Z'))).toBe('nfl-mock-draft-backup-2026-10-18.json');
  });
});
