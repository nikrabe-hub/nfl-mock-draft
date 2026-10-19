// Backup: alle eigenen Daten als eine JSON-Datei exportieren und wieder importieren
// (z.B. vom PC aufs Handy). Eine ungültige Datei ändert nie etwas.

import type { KVStorage } from './db';
import { CACHE_PREFIX } from './keys';

export const BACKUP_FORMAT = 'nfl-mock-draft-backup';
export const BACKUP_VERSION = 1;
const MAX_CHARS = 25_000_000;
const MAX_KEYS = 500;
const KEY_RE = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  data: Record<string, unknown>;
}

export type BackupErrorCode = 'not_json' | 'wrong_format' | 'newer_version' | 'bad_data' | 'bad_key' | 'too_large';

export type ValidationResult =
  | { ok: true; backup: Backup }
  | { ok: false; code: BackupErrorCode; detail?: string };

const fail = (code: BackupErrorCode, detail?: string): ValidationResult => ({ ok: false, code, detail });

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validateBackup(text: string): ValidationResult {
  if (text.length > MAX_CHARS) return fail('too_large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('not_json');
  }
  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT) return fail('wrong_format');
  const version = parsed.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return fail('wrong_format');
  if (version > BACKUP_VERSION) return fail('newer_version');
  if (!isRecord(parsed.data)) return fail('bad_data');

  const entries = Object.entries(parsed.data);
  if (entries.length > MAX_KEYS) return fail('bad_data');
  const data: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (!KEY_RE.test(key)) return fail('bad_key', key);
    data[key] = value;
  }
  const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : '';
  return { ok: true, backup: { format: BACKUP_FORMAT, version, createdAt, data } };
}

export async function createBackup(storage: KVStorage, now: Date = new Date()): Promise<Backup> {
  const data: Record<string, unknown> = {};
  for (const key of (await storage.keys()).sort()) {
    if (key.startsWith('__') || key.startsWith(CACHE_PREFIX)) continue;
    const value = await storage.get(key);
    if (value !== undefined) data[key] = value;
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: now.toISOString(), data };
}

/** Schreibt das Backup in den Speicher. Schlägt etwas fehl, wird der alte Stand wiederhergestellt. */
export async function applyBackup(storage: KVStorage, backup: Backup): Promise<{ written: number }> {
  const keys = Object.keys(backup.data);
  const before = new Map<string, unknown>();
  for (const key of keys) before.set(key, await storage.get(key));
  try {
    for (const key of keys) await storage.set(key, backup.data[key]);
  } catch (e) {
    for (const [key, old] of before) {
      try {
        if (old === undefined) await storage.remove(key);
        else await storage.set(key, old);
      } catch {
        /* beim Zurückrollen nichts weiter tun */
      }
    }
    throw e;
  }
  return { written: keys.length };
}

export function backupFileName(date: Date = new Date()): string {
  return `nfl-mock-draft-backup-${date.toISOString().slice(0, 10)}.json`;
}
