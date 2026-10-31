// File service (S2): browse, search index, read/write with backups and optimistic concurrency, recent/pinned, live watch.
// Every path goes through the S1 realpath confinement helper `confine` (roots are fixed at construction).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { confine, extAllowed, hasIgnoredSegment, IGNORED_DIRS, READ_EXT, DEFAULT_ROOTS } from './security.js';
import { normalize } from '../../src/js/ui/fuzzy.js';

export const MAX_READ = 5 * 1024 * 1024;
export const KEEP_FILE_BACKUPS = 20;
export const MAX_INDEX = 150000;
const MAX_DEPTH = 14;
const TEXT_EXT = READ_EXT; // backups are made for text sources only

export class FileError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

export const rootsFromEnv = (env = process.env) => (env.MD2HTML_ROOTS ? env.MD2HTML_ROOTS.split(':').filter(Boolean) : DEFAULT_ROOTS());
export const hashOf = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20);
const pathKey = (p) => crypto.createHash('sha1').update(p).digest('hex').slice(0, 16);
const isIgnoredName = (n) => IGNORED_DIRS.has(n) || n.startsWith('.');
const stamp = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace('T', '-').replace('Z', '').replace('.', '');

/** Valid new leaf name: no separators / control chars, not a dot file, not too long. */
export function validLeaf(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 200 && !/[\\/\0-\x1f]/.test(name) && !name.startsWith('.') && name !== '..';
}

export class FileService extends EventEmitter {
  constructor({ roots = rootsFromEnv(), dataDir, log = { info() {}, warn() {}, error() {} }, debounceMs = 150, watchIndex = true } = {}) {
    super();
    this.rootsRaw = roots;
    this.dataDir = dataDir;
    this.log = log;
    this.debounceMs = debounceMs;
    this.watchIndex = watchIndex;
    this.backupDir = path.join(dataDir, 'backups', 'files');
    this.metaFile = path.join(dataDir, 'files-meta.json');
    fs.mkdirSync(this.backupDir, { recursive: true });
    this.roots = []; // [{name, path (real)}]
    for (const r of roots) {
      try {
        const real = fs.realpathSync(r);
        if (fs.statSync(real).isDirectory() && !this.roots.some((x) => x.path === real)) this.roots.push({ name: path.basename(real) || real, path: real });
      } catch {
        /* missing root: skipped */
      }
    }
    this.index = null; // Map path -> {path,name,norm,ext,root}
    this.building = null;
    this.watchers = [];
    this.pending = new Map(); // index refresh debounce
    this.fileWatchers = new Map(); // real path -> {watcher, hash, subs:Set, timer}
    this.meta = this.loadMeta();
  }
  rootPaths() {
    return this.roots.map((r) => r.path);
  }
  /** Confine + extension checks. Throws FileError. */
  resolve(p, { write = false, mustExist = true, ext = true } = {}) {
    const c = confine(p, this.rootPaths(), { mustExist });
    if (!c.ok) {
      const status = c.reason === 'not-found' ? 404 : c.reason === 'bad-path' || c.reason === 'not-absolute' ? 400 : 403;
      throw new FileError(status, c.reason);
    }
    if (ext && !extAllowed(c.real, write)) throw new FileError(415, 'extension-not-allowed');
    return c;
  }

  // ---- browsing ----
  list(dir) {
    if (!dir) return { path: '', root: null, parent: null, entries: this.roots.map((r) => ({ name: r.name, path: r.path, kind: 'dir' })) };
    const c = this.resolve(dir, { ext: false });
    let st;
    try {
      st = fs.statSync(c.real);
    } catch {
      throw new FileError(404, 'not-found');
    }
    if (!st.isDirectory()) throw new FileError(400, 'not-a-directory');
    if (c.real !== c.root && isIgnoredName(path.basename(c.real))) throw new FileError(403, 'ignored-dir');
    const entries = [];
    for (const d of fs.readdirSync(c.real, { withFileTypes: true })) {
      const full = path.join(c.real, d.name);
      let isDir = d.isDirectory();
      let isFile = d.isFile();
      if (d.isSymbolicLink()) {
        const cc = confine(full, this.rootPaths());
        if (!cc.ok) continue; // a link leading outside the roots is invisible
        try {
          const s = fs.statSync(cc.real);
          isDir = s.isDirectory();
          isFile = s.isFile();
        } catch {
          continue;
        }
      }
      if (isDir) {
        if (isIgnoredName(d.name)) continue;
        entries.push({ name: d.name, path: full, kind: 'dir' });
      } else if (isFile && !d.name.startsWith('.') && READ_EXT.has(path.extname(d.name).toLowerCase())) {
        let s;
        try {
          s = fs.statSync(full);
        } catch {
          continue;
        }
        entries.push({ name: d.name, path: full, kind: 'file', ext: path.extname(d.name).toLowerCase(), size: s.size, mtime: s.mtimeMs });
      }
    }
    entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'fa', { numeric: true }) : a.kind === 'dir' ? -1 : 1));
    return { path: c.real, root: c.root, parent: c.real === c.root ? null : path.dirname(c.real), entries };
  }

  // ---- read / write ----
  read(p) {
    const c = this.resolve(p);
    const st = this.statFile(c.real);
    if (st.size > MAX_READ) throw new FileError(413, 'file-too-large');
    const buf = fs.readFileSync(c.real);
    return { path: c.real, name: path.basename(c.real), content: buf.toString('utf8'), etag: hashOf(buf), mtime: st.mtimeMs, size: st.size, root: c.root };
  }
  statFile(real) {
    let st;
    try {
      st = fs.statSync(real);
    } catch {
      throw new FileError(404, 'not-found');
    }
    if (!st.isFile()) throw new FileError(400, 'not-a-file');
    return st;
  }
  /** Current {etag,mtime,size} of a file or null when it does not exist. */
  stamp(real) {
    try {
      const st = fs.statSync(real);
      if (!st.isFile() || st.size > MAX_READ * 4) return { etag: 'big-' + st.size + '-' + st.mtimeMs, mtime: st.mtimeMs, size: st.size };
      return { etag: hashOf(fs.readFileSync(real)), mtime: st.mtimeMs, size: st.size };
    } catch {
      return null;
    }
  }

  /**
   * Write a file. `etag` = what the client opened (409 `conflict` when the disk differs).
   * Without `etag`, an existing file is only replaced when `overwrite` is true (409 `exists` otherwise).
   * Binary content comes as a Buffer. Text sources are copied to backups/files/<hash-of-path>/<timestamp> first.
   */
  write(p, content, { etag, overwrite = false } = {}) {
    const c = this.resolve(p, { write: true, mustExist: false });
    if (!validLeaf(path.basename(c.real))) throw new FileError(400, 'bad-name');
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    const cur = this.stamp(c.real);
    if (cur) {
      try {
        if (!fs.statSync(c.real).isFile()) throw new FileError(400, 'not-a-file');
      } catch (e) {
        if (e instanceof FileError) throw e;
      }
      if (etag !== undefined && etag !== null) {
        if (etag !== cur.etag) throw new FileError(409, 'conflict', { current: cur });
      } else if (!overwrite) throw new FileError(409, 'exists', { current: cur });
      if (TEXT_EXT.has(path.extname(c.real).toLowerCase())) this.backup(c.real);
    } else if (etag) {
      // the client opened a file that has since vanished: let it decide
      if (!overwrite) throw new FileError(409, 'gone', { current: null });
    }
    const tmp = path.join(path.dirname(c.real), `.${path.basename(c.real)}.${process.pid}.tmp`);
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, c.real);
    const st = fs.statSync(c.real);
    const out = { path: c.real, name: path.basename(c.real), etag: hashOf(buf), mtime: st.mtimeMs, size: st.size, root: c.root };
    this.addIndex(c.real, c.root);
    this.touchRecent(c.real);
    this.pokeWatch(c.real);
    return out;
  }
  backup(real) {
    const dir = path.join(this.backupDir, pathKey(real));
    fs.mkdirSync(dir, { recursive: true });
    let name = stamp(Date.now()) + path.extname(real);
    for (let i = 1; fs.existsSync(path.join(dir, name)); i++) name = stamp(Date.now()) + '-' + i + path.extname(real);
    fs.copyFileSync(real, path.join(dir, name));
    fs.writeFileSync(path.join(dir, '.path'), real);
    const all = fs.readdirSync(dir).filter((n) => !n.startsWith('.')).sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_FILE_BACKUPS))) fs.rmSync(path.join(dir, old), { force: true });
    return name;
  }
  backupsOf(p) {
    const c = this.resolve(p, { ext: false, mustExist: false });
    const dir = path.join(this.backupDir, pathKey(c.real));
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((n) => !n.startsWith('.')).sort().reverse().map((name) => ({ name, size: fs.statSync(path.join(dir, name)).size }));
  }
  mkdir(p) {
    const c = this.resolve(p, { ext: false, mustExist: false });
    if (!validLeaf(path.basename(c.real)) || IGNORED_DIRS.has(path.basename(c.real))) throw new FileError(400, 'bad-name');
    if (fs.existsSync(c.real)) throw new FileError(409, 'exists');
    fs.mkdirSync(c.real);
    return { path: c.real };
  }

  // ---- recent / pinned (stored in the data dir so every device sees the same lists) ----
  loadMeta() {
    try {
      const m = JSON.parse(fs.readFileSync(this.metaFile, 'utf8'));
      return { recent: Array.isArray(m.recent) ? m.recent : [], pinned: Array.isArray(m.pinned) ? m.pinned : [] };
    } catch {
      return { recent: [], pinned: [] };
    }
  }
  saveMeta() {
    const tmp = this.metaFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.meta));
    fs.renameSync(tmp, this.metaFile);
  }
  touchRecent(real) {
    this.meta.recent = [{ path: real, at: Date.now() }, ...this.meta.recent.filter((r) => r.path !== real)].slice(0, 40);
    this.saveMeta();
  }
  recent(p) {
    const c = this.resolve(p);
    this.statFile(c.real);
    this.touchRecent(c.real);
  }
  setPinned(p, on) {
    const real = this.resolve(p).real;
    this.meta.pinned = this.meta.pinned.filter((x) => x !== real);
    if (on) this.meta.pinned.unshift(real);
    this.saveMeta();
    return this.meta.pinned;
  }
  /** Recent + pinned with file info; entries that left the roots or vanished are dropped from the answer. */
  metaView() {
    const info = (p) => {
      const c = confine(p, this.rootPaths());
      if (!c.ok || !extAllowed(c.real)) return null;
      try {
        const st = fs.statSync(c.real);
        return st.isFile() ? { path: c.real, name: path.basename(c.real), ext: path.extname(c.real).toLowerCase(), size: st.size, mtime: st.mtimeMs, root: c.root } : null;
      } catch {
        return null;
      }
    };
    return {
      recent: this.meta.recent.map((r) => ({ ...info(r.path), at: r.at })).filter((r) => r.path),
      pinned: this.meta.pinned.map(info).filter(Boolean),
    };
  }

  // ---- search index ----
  entry(real, root) {
    const name = path.basename(real);
    const rel = path.relative(root, real);
    return { path: real, name, norm: normalize(name), normDir: normalize(path.dirname(rel) === '.' ? '' : path.dirname(rel)), ext: path.extname(name).toLowerCase(), root };
  }
  addIndex(real, root) {
    if (!this.index) return;
    if (!READ_EXT.has(path.extname(real).toLowerCase()) || path.basename(real).startsWith('.')) return;
    this.index.set(real, this.entry(real, root));
  }
  dropIndex(prefix) {
    if (!this.index) return;
    for (const k of this.index.keys()) if (k === prefix || k.startsWith(prefix + path.sep)) this.index.delete(k);
  }
  async walk(dir, root, depth = 0) {
    if (depth > MAX_DEPTH || (this.index && this.index.size >= MAX_INDEX)) return;
    let items;
    try {
      items = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of items) {
      if (d.isDirectory()) {
        if (!isIgnoredName(d.name)) await this.walk(path.join(dir, d.name), root, depth + 1);
      } else if (d.isFile() && !d.name.startsWith('.') && READ_EXT.has(path.extname(d.name).toLowerCase())) {
        if (this.index.size >= MAX_INDEX) return;
        this.index.set(path.join(dir, d.name), this.entry(path.join(dir, d.name), root));
      }
    }
    if (depth < 3) await new Promise((r) => setImmediate(r)); // keep the event loop breathing on big trees
  }
  /** Build the index once (lazily, on the first search) and start watching the roots. */
  ensureIndex() {
    if (this.index && !this.building) return Promise.resolve();
    if (this.building) return this.building;
    this.index = new Map();
    this.building = (async () => {
      for (const r of this.roots) await this.walk(r.path, r.path);
      this.startWatching();
      this.building = null;
    })();
    return this.building;
  }
  startWatching() {
    if (!this.watchIndex) return;
    for (const r of this.roots) {
      try {
        const w = fs.watch(r.path, { recursive: true, persistent: false }, (_ev, filename) => {
          if (!filename) return;
          const rel = String(filename);
          if (hasIgnoredSegment(rel + path.sep + 'x')) return; // cheap filter: node_modules/.git/dot-folders never reach the index
          const full = path.join(r.path, rel);
          clearTimeout(this.pending.get(full));
          this.pending.set(full, setTimeout(() => {
            this.pending.delete(full);
            this.refresh(full, r.path);
          }, this.debounceMs));
        });
        w.on('error', () => {});
        this.watchers.push(w);
      } catch (e) {
        this.log.warn(`index watch failed for ${r.path}: ${e.message}`);
      }
    }
  }
  /** Re-sync the index with disk for one path (file, folder or a vanished path). Also exported for tests. */
  async refresh(full, root) {
    if (!this.index) return;
    let st = null;
    try {
      st = await fs.promises.lstat(full);
    } catch {
      /* gone */
    }
    this.dropIndex(full); // renamed folders / files: drop stale entries first
    if (!st) return;
    if (st.isDirectory()) {
      if (!isIgnoredName(path.basename(full))) await this.walk(full, root, 1);
    } else if (st.isFile()) this.addIndex(full, root);
  }
  async search(q, { type = '', limit = 100 } = {}) {
    await this.ensureIndex();
    limit = Math.max(1, Math.min(Number(limit) || 100, 200));
    const tokens = normalize(q).split(' ').filter(Boolean);
    const exts = type ? new Set(type.split(',').flatMap((t) => ({ md: ['.md', '.markdown'], txt: ['.txt'], html: ['.html', '.htm'] })[t] || [])) : null;
    const hits = [];
    for (const e of this.index.values()) {
      if (exts && !exts.has(e.ext)) continue;
      let score = 0;
      for (const t of tokens) {
        const at = e.norm.indexOf(t);
        if (at >= 0) score += 100 + (at === 0 ? 40 : /[\s\-_.()]/.test(e.norm[at - 1]) ? 25 : 0) - Math.min(at, 30) * 0.3;
        else if (e.normDir.includes(t)) score += 30;
        else {
          score = -1;
          break;
        }
      }
      if (score < 0) continue;
      hits.push({ e, score: score - e.norm.length * 0.05 - e.normDir.length * 0.01 });
      if (!tokens.length && hits.length >= limit * 20) break;
    }
    hits.sort((a, b) => b.score - a.score || a.e.path.length - b.e.path.length);
    const results = [];
    for (const { e } of hits.slice(0, limit)) {
      try {
        const st = fs.statSync(e.path);
        results.push({ path: e.path, name: e.name, ext: e.ext, dir: path.dirname(path.relative(e.root, e.path)) === '.' ? '' : path.dirname(path.relative(e.root, e.path)), root: e.root, rootName: path.basename(e.root), size: st.size, mtime: st.mtimeMs });
      } catch {
        this.index.delete(e.path); // vanished since the last event
      }
    }
    return { results, total: hits.length, indexed: this.index.size };
  }

  // ---- live watch of one opened file ----
  /** Subscribe to content changes of a file. `cb(event)`; returns an unsubscribe function. */
  watch(p, cb) {
    const c = this.resolve(p);
    const real = c.real;
    let w = this.fileWatchers.get(real);
    if (!w) {
      const dir = path.dirname(real);
      const base = path.basename(real);
      w = { subs: new Set(), timer: null, last: this.stamp(real), watcher: null };
      try {
        w.watcher = fs.watch(dir, { persistent: false }, (_ev, filename) => {
          if (filename && String(filename) !== base) return;
          this.pokeWatch(real);
        });
        w.watcher.on('error', () => {});
      } catch (e) {
        throw new FileError(500, 'watch-failed: ' + e.message);
      }
      this.fileWatchers.set(real, w);
    }
    w.subs.add(cb);
    cb({ type: 'ready', path: real, ...(w.last || {}), exists: !!w.last });
    return () => {
      w.subs.delete(cb);
      if (!w.subs.size) {
        clearTimeout(w.timer);
        w.watcher?.close();
        this.fileWatchers.delete(real);
      }
    };
  }
  /** Debounced re-check; an event goes out only when the content hash really changed. */
  pokeWatch(real) {
    const w = this.fileWatchers.get(real);
    if (!w) return;
    clearTimeout(w.timer);
    w.timer = setTimeout(() => {
      const now = this.stamp(real);
      if ((now && now.etag) === (w.last && w.last.etag)) return;
      w.last = now;
      const ev = now ? { type: 'change', path: real, exists: true, ...now } : { type: 'deleted', path: real, exists: false };
      for (const cb of w.subs) cb(ev);
    }, this.debounceMs);
    w.timer.unref?.();
  }
  close() {
    for (const w of this.watchers) w.close();
    for (const [, w] of this.fileWatchers) {
      clearTimeout(w.timer);
      w.watcher?.close();
    }
    for (const t of this.pending.values()) clearTimeout(t);
    this.watchers = [];
    this.fileWatchers.clear();
  }
}
