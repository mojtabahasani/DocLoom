// Library on disk: library/<store>/<id>.json envelopes {id, store, ts, deleted?, data}.
// Documents also get a readable copy next to the JSON: <slug(title)>-<id>.md (or .html when there is no Markdown source).
// A delete never destroys content: the last envelope is gzipped into library/_retired/ first, then the tombstone is written.
//   _retired/<store>/<id>-<ts>.json.gz            documents, brands, settings
//   _retired/versions/<docId>/<id>-<ts>.json.gz   versions, grouped by their document so listing one document is a readdir
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { EventEmitter } from 'node:events';

export const STORES = ['documents', 'versions', 'brands', 'settings'];
export const ID_RE = /^[A-Za-z0-9_]{1,80}$/;
export const MAX_ITEM = 20 * 1024 * 1024;
export const RETIRED_DIR = '_retired';
const RETIRED_NAME = /^([A-Za-z0-9_]{1,80})-(\d{1,16})(?:-\d{1,4})?\.json\.gz$/;
const MAX_RETIRED_LIST = 500;

export class StoreError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

export function slug(title, max = 40) {
  const s = String(title || '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return s || 'untitled';
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function readableCopy(doc) {
  const src = typeof doc.source === 'string' ? doc.source : '';
  if (src.trim()) return { ext: '.md', text: src };
  const html = `<!doctype html>\n<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(doc.title || '')}</title></head><body>\n${doc.html || ''}\n</body></html>\n`;
  return { ext: '.html', text: html };
}

export class LibraryStore extends EventEmitter {
  constructor(dir) {
    super();
    this.dir = dir;
    this.index = new Map(); // "store/id" -> {store,id,ts,deleted}
    this.copies = new Map(); // doc id -> copy file name
    for (const s of STORES) fs.mkdirSync(path.join(dir, s), { recursive: true });
    this.load();
  }
  p(store, id, ext = '.json') {
    return path.join(this.dir, store, id + ext);
  }
  load() {
    for (const s of STORES) {
      for (const f of fs.readdirSync(path.join(this.dir, s))) {
        const full = path.join(this.dir, s, f);
        if (f.endsWith('.json')) {
          try {
            const e = JSON.parse(fs.readFileSync(full, 'utf8'));
            if (e && ID_RE.test(e.id) && Number.isFinite(e.ts)) this.index.set(`${s}/${e.id}`, { store: s, id: e.id, ts: e.ts, deleted: !!e.deleted });
          } catch {
            /* skip unreadable file */
          }
        } else if (s === 'documents' && /\.(md|html)$/.test(f)) {
          const id = f.replace(/\.(md|html)$/, '').split('-').pop();
          this.copies.set(id, f);
        }
      }
    }
  }
  check(store, id) {
    if (!STORES.includes(store)) throw new StoreError(404, 'unknown store');
    if (!ID_RE.test(String(id))) throw new StoreError(400, 'bad id');
  }
  list(store) {
    if (!STORES.includes(store)) throw new StoreError(404, 'unknown store');
    return [...this.index.values()].filter((e) => e.store === store).map(({ id, ts, deleted }) => ({ id, ts, deleted }));
  }
  all() {
    return [...this.index.values()];
  }
  get(store, id) {
    this.check(store, id);
    if (!this.index.has(`${store}/${id}`)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.p(store, id), 'utf8'));
    } catch {
      return null;
    }
  }
  write(file, text) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  }
  dropCopy(id) {
    const old = this.copies.get(id);
    if (old) fs.rmSync(path.join(this.dir, 'documents', old), { force: true });
    this.copies.delete(id);
  }
  /** `ifTs` (optional, null = "must not exist") makes the write conditional on the current server timestamp. */
  put(store, id, { ts, data, ifTs, by = '' }) {
    this.check(store, id);
    if (!Number.isFinite(ts)) throw new StoreError(400, 'bad ts');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new StoreError(400, 'bad data');
    const key = `${store}/${id}`;
    const cur = this.index.get(key);
    if (ifTs !== undefined && (cur ? cur.ts : null) !== ifTs) throw new StoreError(409, 'conflict', { current: cur ? { ts: cur.ts, deleted: cur.deleted } : null });
    if (store === 'documents' && data.id !== id) throw new StoreError(400, 'id mismatch');
    if (store === 'settings' && data.key !== id) throw new StoreError(400, 'key mismatch');
    const text = JSON.stringify({ id, store, ts, data });
    if (text.length > MAX_ITEM) throw new StoreError(413, 'item too large');
    this.write(this.p(store, id), text);
    if (store === 'documents') {
      this.dropCopy(id);
      const c = readableCopy(data);
      const name = `${slug(data.title)}-${id}${c.ext}`;
      this.write(path.join(this.dir, 'documents', name), c.text);
      this.copies.set(id, name);
    }
    this.index.set(key, { store, id, ts, deleted: false });
    this.emit('change', { store, id, ts, deleted: false, by });
    return { ts };
  }
  /** Keep the content a delete is about to replace with a tombstone. Throws when it cannot: then the delete does not happen. */
  retire(store, id, ts) {
    let text;
    try {
      text = fs.readFileSync(this.p(store, id), 'utf8');
    } catch {
      return null; // nothing on disk, nothing to lose
    }
    let env = null;
    try {
      env = JSON.parse(text);
    } catch {
      /* unreadable JSON is still kept, byte for byte */
    }
    if (env && (env.deleted || !env.data)) return null;
    const docId = store === 'versions' && ID_RE.test(String(env?.data?.docId || '')) ? env.data.docId : null;
    const dir = path.join(this.dir, RETIRED_DIR, store, ...(docId ? [docId] : []));
    fs.mkdirSync(dir, { recursive: true });
    let name = `${id}-${ts}.json.gz`;
    for (let n = 2; fs.existsSync(path.join(dir, name)); n++) name = `${id}-${ts}-${n}.json.gz`;
    this.write(path.join(dir, name), zlib.gzipSync(text));
    return name;
  }
  readRetiredFile(file) {
    try {
      return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
    } catch {
      return null;
    }
  }
  /** What the server still holds for one document after deletes: its pruned versions and its own retired copies. */
  retiredOf(docId) {
    if (!ID_RE.test(String(docId))) throw new StoreError(400, 'bad id');
    const scan = (dir, keep) => {
      let names = [];
      try {
        names = fs.readdirSync(dir);
      } catch {
        return [];
      }
      const out = [];
      for (const name of names) {
        const m = RETIRED_NAME.exec(name);
        if (!m || !keep(m[1])) continue;
        const d = this.readRetiredFile(path.join(dir, name))?.data;
        if (d) out.push({ name, id: m[1], retiredAt: Number(m[2]), savedAt: Number(d.savedAt || d.updatedAt) || 0, reason: String(d.reason || ''), title: String(d.title || '').slice(0, 200), size: (d.source || '').length });
      }
      return out.sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_RETIRED_LIST);
    };
    return {
      versions: scan(path.join(this.dir, RETIRED_DIR, 'versions', docId), () => true),
      documents: scan(path.join(this.dir, RETIRED_DIR, 'documents'), (id) => id === docId),
    };
  }
  /** One retired envelope. `docId` is given for versions (they live one folder deeper). */
  getRetired(store, name, docId = null) {
    if (!STORES.includes(store)) throw new StoreError(404, 'unknown store');
    if (!RETIRED_NAME.test(String(name))) throw new StoreError(400, 'bad name');
    if (docId != null && !ID_RE.test(String(docId))) throw new StoreError(400, 'bad id');
    return this.readRetiredFile(path.join(this.dir, RETIRED_DIR, store, ...(docId ? [docId] : []), name));
  }
  del(store, id, { ts = Date.now(), by = '' } = {}) {
    this.check(store, id);
    const key = `${store}/${id}`;
    const cur = this.index.get(key);
    if (cur?.deleted && cur.ts >= ts) return { ts: cur.ts };
    this.retire(store, id, ts);
    this.write(this.p(store, id), JSON.stringify({ id, store, ts, deleted: true, data: null }));
    if (store === 'documents') this.dropCopy(id);
    this.index.set(key, { store, id, ts, deleted: true });
    this.emit('change', { store, id, ts, deleted: true, by });
    return { ts };
  }
  /** Backup payload in the client's `docloom-backup` format (live items only). */
  snapshot(now = Date.now()) {
    const live = (s) => this.list(s).filter((e) => !e.deleted).map((e) => this.get(s, e.id)?.data).filter(Boolean);
    const settings = {};
    for (const r of live('settings')) settings[r.key] = r.value;
    return { format: 'docloom-backup', version: 1, app: 'DocLoom', exportedAt: new Date(now).toISOString(), documents: live('documents'), versions: live('versions'), brands: live('brands'), settings };
  }
  /** Replace the whole library with a backup payload. Everything gets ts=now so every client adopts it. */
  restore(backup, now = Date.now()) {
    const keep = new Set();
    const put = (s, id, data) => {
      if (!ID_RE.test(String(id))) return;
      keep.add(`${s}/${id}`);
      this.put(s, id, { ts: now, data: s === 'documents' ? { ...data, updatedAt: now } : data, by: 'restore' });
    };
    for (const d of backup.documents || []) put('documents', d.id, d);
    for (const v of backup.versions || []) put('versions', v.id, v);
    for (const b of backup.brands || []) put('brands', b.id, b);
    for (const [key, value] of Object.entries(backup.settings || {})) put('settings', key, { key, value });
    for (const e of this.all()) if (!e.deleted && !keep.has(`${e.store}/${e.id}`)) this.del(e.store, e.id, { ts: now, by: 'restore' });
  }
}
