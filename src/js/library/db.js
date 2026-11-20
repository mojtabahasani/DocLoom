// IndexedDB wrapper (database `docloom`). Falls back to an in-memory store when IndexedDB is unavailable.
export const STORES = {
  documents: { keyPath: 'id' },
  versions: { keyPath: 'id', indexes: [['docId', 'docId']] },
  brands: { keyPath: 'id' },
  settings: { keyPath: 'key' },
};
const VERSION = 1;

export class QuotaError extends Error {
  constructor(cause) {
    super('QuotaExceeded');
    this.name = 'QuotaError';
    this.cause = cause;
  }
}

const isQuota = (e) => e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(e.message || ''));
const wrap = (e) => (isQuota(e) ? new QuotaError(e) : e);

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(wrap(req.error));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(wrap(tx.error));
    tx.onabort = () => reject(wrap(tx.error));
  });
}

function memoryBackend() {
  const data = Object.fromEntries(Object.keys(STORES).map((s) => [s, new Map()]));
  const clone = (v) => (v === undefined ? v : structuredClone(v));
  const key = (s, v) => v[STORES[s].keyPath];
  return {
    persistent: false,
    async get(s, k) {
      return clone(data[s].get(k));
    },
    async all(s) {
      return [...data[s].values()].map(clone);
    },
    async keys(s) {
      return [...data[s].keys()];
    },
    async byDoc(docId) {
      return [...data.versions.values()].filter((v) => v.docId === docId).map(clone);
    },
    async putMany(s, list) {
      for (const v of list) data[s].set(key(s, v), clone(v));
    },
    async delMany(s, keys) {
      for (const k of keys) data[s].delete(k);
    },
    async clear(s) {
      data[s].clear();
    },
  };
}

function idbBackend(idb) {
  return idb;
}

/** @param factory an IDBFactory (defaults to the global one; tests pass fake-indexeddb). */
// The physical database name stays «md2html» although the app is now DocLoom: it is the address of
// the user's library, not a label anyone sees. IndexedDB cannot rename a database, so changing it
// would mean copying every document into a second one — under a quota this app already hits — and
// silently emptying the library of anyone offline while the copy had not run. See core/naming.js.
export function createDb(factory = globalThis.indexedDB, name = 'md2html') {
  let backend = null;
  let opening = null;
  const listeners = new Set();
  const emit = (e) => listeners.forEach((fn) => { try { fn(e); } catch { /* observers must never break storage */ } });
  const api = {
    persistent: false,
    /** Resolves to true when data is really persisted, false for the in-memory fallback. */
    open() {
      opening ??= (async () => {
        try {
          if (!factory) throw new Error('no indexedDB');
          const req = factory.open(name, VERSION);
          req.onupgradeneeded = () => {
            const d = req.result;
            for (const [s, cfg] of Object.entries(STORES)) {
              if (d.objectStoreNames.contains(s)) continue;
              const os = d.createObjectStore(s, { keyPath: cfg.keyPath });
              for (const [iname, path] of cfg.indexes || []) os.createIndex(iname, path);
            }
          };
          const conn = await promisify(req);
          conn.onversionchange = () => conn.close();
          backend = idbBackend(makeIdb(conn));
          api.persistent = true;
        } catch {
          backend = memoryBackend();
          api.persistent = false;
        }
        return api.persistent;
      })();
      return opening;
    },
    async get(s, k) {
      await api.open();
      return backend.get(s, k);
    },
    /** Observe writes: fn({store, puts:[record], dels:[key], cleared}). Used by the server sync. Returns unsubscribe. */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async put(s, v) {
      return api.putMany(s, [v]);
    },
    async putMany(s, list) {
      await api.open();
      const r = await backend.putMany(s, list);
      emit({ store: s, puts: list });
      return r;
    },
    async del(s, k) {
      return api.delMany(s, [k]);
    },
    async delMany(s, keys) {
      await api.open();
      const r = await backend.delMany(s, keys);
      emit({ store: s, dels: keys });
      return r;
    },
    async keys(s) {
      await api.open();
      return backend.keys(s);
    },
    async all(s) {
      await api.open();
      return backend.all(s);
    },
    async versionsOf(docId) {
      await api.open();
      return backend.byDoc(docId);
    },
    async clear(s) {
      await api.open();
      const r = await backend.clear(s);
      emit({ store: s, cleared: true });
      return r;
    },
    async clearAll() {
      for (const s of Object.keys(STORES)) await api.clear(s);
    },
  };
  return api;
}

function makeIdb(conn) {
  const run = (stores, mode, fn) => {
    const tx = conn.transaction(stores, mode);
    const done = txDone(tx);
    const result = fn(tx);
    return Promise.all([result, done]).then(([r]) => r);
  };
  return {
    get: (s, k) => run(s, 'readonly', (tx) => promisify(tx.objectStore(s).get(k))),
    all: (s) => run(s, 'readonly', (tx) => promisify(tx.objectStore(s).getAll())),
    keys: (s) => run(s, 'readonly', (tx) => promisify(tx.objectStore(s).getAllKeys())),
    byDoc: (docId) => run('versions', 'readonly', (tx) => promisify(tx.objectStore('versions').index('docId').getAll(docId))),
    putMany: (s, list) =>
      run(s, 'readwrite', (tx) => {
        const os = tx.objectStore(s);
        for (const v of list) os.put(v);
      }),
    delMany: (s, keys) =>
      run(s, 'readwrite', (tx) => {
        const os = tx.objectStore(s);
        for (const k of keys) os.delete(k);
      }),
    clear: (s) => run(s, 'readwrite', (tx) => void tx.objectStore(s).clear()),
  };
}

export const db = createDb();
