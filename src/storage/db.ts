// Speicherschicht: IndexedDB, bei Problemen localStorage, zuletzt der Arbeitsspeicher.
// Die App stürzt nie ab, nur weil ein Speicher nicht verfügbar ist (z.B. privater Modus).

import { createStore } from '../store';

export type Backend = 'indexeddb' | 'localstorage' | 'memory';

export interface KVStorage {
  readonly backend: Backend;
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

interface Impl {
  readonly backend: Backend;
  getRaw(key: string): Promise<string | undefined>;
  setRaw(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

const DB_NAME = 'nfl-mock-draft';
const STORE = 'kv';
const LS_PREFIX = 'nmd:';
const PROBE_KEY = '__probe__';

// --- IndexedDB -------------------------------------------------------------

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB fehlt'));
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (e) {
      return reject(e);
    }
    const timer = setTimeout(() => reject(new Error('IndexedDB Timeout')), 4000);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      resolve(req.result);
    };
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error ?? new Error('IndexedDB Fehler'));
    };
    req.onblocked = () => {
      clearTimeout(timer);
      reject(new Error('IndexedDB blockiert'));
    };
  });
}

class IdbImpl implements Impl {
  readonly backend = 'indexeddb' as const;
  constructor(private db: IDBDatabase) {}

  private run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = this.db.transaction(STORE, mode);
      } catch (e) {
        return reject(e);
      }
      const req = fn(tx.objectStore(STORE));
      let result: T;
      req.onsuccess = () => {
        result = req.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? req.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB abgebrochen'));
    });
  }

  getRaw(key: string) {
    return this.run('readonly', (s) => s.get(key)).then((v) => (typeof v === 'string' ? v : undefined));
  }
  setRaw(key: string, value: string) {
    return this.run('readwrite', (s) => s.put(value, key)).then(() => undefined);
  }
  remove(key: string) {
    return this.run('readwrite', (s) => s.delete(key)).then(() => undefined);
  }
  keys() {
    return this.run('readonly', (s) => s.getAllKeys()).then((ks) => ks.map(String));
  }
}

// --- localStorage ----------------------------------------------------------

class LsImpl implements Impl {
  readonly backend = 'localstorage' as const;
  async getRaw(key: string) {
    return localStorage.getItem(LS_PREFIX + key) ?? undefined;
  }
  async setRaw(key: string, value: string) {
    localStorage.setItem(LS_PREFIX + key, value);
  }
  async remove(key: string) {
    localStorage.removeItem(LS_PREFIX + key);
  }
  async keys() {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) out.push(k.slice(LS_PREFIX.length));
    }
    return out;
  }
}

// --- Arbeitsspeicher (Notlösung, geht beim Schließen verloren) --------------

class MemImpl implements Impl {
  readonly backend = 'memory' as const;
  private m = new Map<string, string>();
  async getRaw(key: string) {
    return this.m.get(key);
  }
  async setRaw(key: string, value: string) {
    this.m.set(key, value);
  }
  async remove(key: string) {
    this.m.delete(key);
  }
  async keys() {
    return [...this.m.keys()];
  }
}

// --- Zusammenbau -----------------------------------------------------------

async function probe(impl: Impl): Promise<boolean> {
  try {
    await impl.setRaw(PROBE_KEY, '1');
    const ok = (await impl.getRaw(PROBE_KEY)) === '1';
    await impl.remove(PROBE_KEY);
    return ok;
  } catch {
    return false;
  }
}

class ResilientStorage implements KVStorage {
  constructor(
    private chain: Impl[],
    private onChange: (b: Backend) => void,
  ) {}

  get backend(): Backend {
    return this.chain[0].backend;
  }

  /** Schlägt der aktuelle Speicher fehl, wird zum nächsten gewechselt und die Aktion wiederholt. */
  private async exec<T>(fn: (i: Impl) => Promise<T>): Promise<T> {
    for (;;) {
      try {
        return await fn(this.chain[0]);
      } catch (e) {
        if (this.chain.length === 1) throw e;
        this.chain.shift();
        this.onChange(this.backend);
      }
    }
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const raw = await this.exec((i) => i.getRaw(key));
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined; // beschädigter Eintrag: wie "nicht vorhanden" behandeln
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    const raw = JSON.stringify(value);
    if (raw === undefined) throw new Error('Wert nicht speicherbar');
    await this.exec((i) => i.setRaw(key, raw));
  }

  remove(key: string): Promise<void> {
    return this.exec((i) => i.remove(key));
  }

  async keys(): Promise<string[]> {
    return (await this.exec((i) => i.keys())).filter((k) => k !== PROBE_KEY);
  }
}

export interface StorageInfo {
  backend: Backend;
  persistent: boolean | null;
}

/** Wird von der Oberfläche angezeigt (Einstellungen). */
export const storageInfo = createStore<StorageInfo>({ backend: 'memory', persistent: null });

export async function createStorage(opts: { prefer?: Backend; onChange?: (b: Backend) => void } = {}): Promise<KVStorage> {
  const chain: Impl[] = [];
  if (opts.prefer === undefined || opts.prefer === 'indexeddb') {
    try {
      const idb = new IdbImpl(await openIdb());
      if (await probe(idb)) chain.push(idb);
    } catch {
      /* weiter mit localStorage */
    }
  }
  if (opts.prefer !== 'memory') {
    try {
      const ls = new LsImpl();
      if (await probe(ls)) chain.push(ls);
    } catch {
      /* weiter mit Arbeitsspeicher */
    }
  }
  chain.push(new MemImpl());
  return new ResilientStorage(chain, opts.onChange ?? (() => {}));
}

let shared: Promise<KVStorage> | undefined;

export function getStorage(): Promise<KVStorage> {
  if (!shared) {
    shared = createStorage({
      onChange: (backend) => storageInfo.set({ backend }),
    }).then((s) => {
      storageInfo.set({ backend: s.backend });
      return s;
    });
  }
  return shared;
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen (hilft v.a. auf dem Handy). */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    const already = (await navigator.storage.persisted?.()) ?? false;
    const ok = already || (await navigator.storage.persist());
    storageInfo.set({ persistent: ok });
    return ok;
  } catch {
    return null;
  }
}

/** Liest nur, ob der Browser die Daten dauerhaft hält – ohne Nachfrage beim Nutzer. */
export async function readPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persisted) return null;
    const ok = await navigator.storage.persisted();
    storageInfo.set({ persistent: ok });
    return ok;
  } catch {
    return null;
  }
}
