import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStorage } from '../../src/storage/db';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Speicher mit IndexedDB', () => {
  it('speichert, liest, löscht und listet Einträge', async () => {
    const s = await createStorage();
    expect(s.backend).toBe('indexeddb');
    await s.set('a', { x: 1 });
    await s.set('b', [1, 2, 3]);
    expect(await s.get('a')).toEqual({ x: 1 });
    expect((await s.keys()).sort()).toEqual(['a', 'b']);
    await s.remove('a');
    expect(await s.get('a')).toBeUndefined();
    expect(await s.keys()).toEqual(['b']);
  });

  it('behält Daten über ein "Neuladen" (neue Instanz) hinweg', async () => {
    const first = await createStorage();
    await first.set('activeDraft', { pick: 17 });
    const second = await createStorage();
    expect(await second.get('activeDraft')).toEqual({ pick: 17 });
  });

  it('gibt bei unbekanntem Schlüssel undefined zurück', async () => {
    const s = await createStorage();
    expect(await s.get('gibt-es-nicht')).toBeUndefined();
  });
});

describe('Ersatzspeicher', () => {
  it('nutzt localStorage, wenn IndexedDB nicht gewünscht/verfügbar ist', async () => {
    const s = await createStorage({ prefer: 'localstorage' });
    expect(s.backend).toBe('localstorage');
    await s.set('k', { ok: true });
    expect(await s.get('k')).toEqual({ ok: true });
    expect(localStorage.getItem('nmd:k')).toBe('{"ok":true}');
    expect(await s.keys()).toEqual(['k']);
  });

  it('fällt auf den Arbeitsspeicher zurück, wenn localStorage nicht funktioniert', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('voll');
    });
    const s = await createStorage({ prefer: 'localstorage' });
    expect(s.backend).toBe('memory');
    await s.set('k', 1);
    expect(await s.get('k')).toBe(1);
  });

  it('wechselt mitten im Betrieb, wenn der Speicher plötzlich ausfällt', async () => {
    const changes: string[] = [];
    const s = await createStorage({ prefer: 'localstorage', onChange: (b) => changes.push(b) });
    expect(s.backend).toBe('localstorage');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota');
    });
    await s.set('k', 42); // darf nicht werfen
    expect(s.backend).toBe('memory');
    expect(changes).toEqual(['memory']);
    expect(await s.get('k')).toBe(42);
  });

  it('behandelt beschädigte Einträge wie "nicht vorhanden"', async () => {
    localStorage.setItem('nmd:kaputt', '{nicht json');
    const s = await createStorage({ prefer: 'localstorage' });
    expect(await s.get('kaputt')).toBeUndefined();
  });

  it('lehnt nicht speicherbare Werte mit Fehler ab, ohne den Speicher zu beschädigen', async () => {
    const s = await createStorage({ prefer: 'memory' });
    await expect(s.set('x', undefined)).rejects.toThrow();
    expect(await s.keys()).toEqual([]);
  });
});
