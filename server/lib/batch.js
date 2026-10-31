// Batch convert: a job renders each selected file through the same Chrome pipeline and writes PDF / HTML beside it or into a folder.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { READ_EXT, IGNORED_DIRS } from './security.js';

export const MAX_FILES = 300;
const MAX_DEPTH = 6;
const KEEP_JOBS = 20;

export class BatchError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Expand files and folders (recursively) to a flat, de-duplicated list of source files. */
export function collectSources(files, inputs) {
  const out = [];
  const seen = new Set();
  const add = (real) => {
    if (!seen.has(real)) {
      seen.add(real);
      out.push(real);
    }
  };
  const walk = (dir, depth) => {
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const names = new Set(ents.map((e) => e.name));
    ents.sort((a, b) => a.name.localeCompare(b.name, 'fa', { numeric: true }));
    for (const e of ents) {
      if (e.name.startsWith('.') || IGNORED_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < MAX_DEPTH) walk(full, depth + 1);
      } else if (e.isFile() && READ_EXT.has(path.extname(e.name).toLowerCase())) {
        const ext = path.extname(e.name).toLowerCase();
        const stem = path.basename(e.name, ext);
        // x.html next to x.md is (almost certainly) a previous output of x.md
        if ((ext === '.html' || ext === '.htm') && (names.has(stem + '.md') || names.has(stem + '.markdown'))) continue;
        try {
          add(files.resolve(full).real);
        } catch {
          /* outside roots / not allowed: skipped */
        }
      }
    }
  };
  for (const p of inputs) {
    const c = files.resolve(p, { ext: false });
    if (fs.statSync(c.real).isDirectory()) walk(c.real, 0);
    else {
      files.resolve(p); // extension check
      add(c.real);
    }
    if (out.length > MAX_FILES) throw new BatchError(413, 'too-many-files');
  }
  return out;
}

export class BatchManager {
  /** render(spec) -> Promise (with .cancel); resolveBrand(idOrName) -> id|null */
  constructor({ files, render, resolveBrand = (x) => x, log = { info() {}, warn() {}, error() {} } }) {
    this.files = files;
    this.render = render;
    this.resolveBrand = resolveBrand;
    this.log = log;
    this.jobs = new Map();
  }
  create(body) {
    const inputs = Array.isArray(body.paths) ? body.paths.filter((p) => typeof p === 'string') : [];
    if (!inputs.length) throw new BatchError(400, 'no-files');
    const fmts = new Set(Array.isArray(body.formats) ? body.formats : ['pdf']);
    const want = { pdf: fmts.has('pdf'), html: fmts.has('html') };
    if (!want.pdf && !want.html) throw new BatchError(400, 'no-format');
    let brand = null;
    if (body.brand) {
      brand = this.resolveBrand(String(body.brand));
      if (!brand) throw new BatchError(400, 'brand-not-found');
    }
    let destDir = null;
    if (body.dest?.mode === 'folder') {
      const c = this.files.resolve(String(body.dest.dir || ''), { ext: false });
      if (!fs.statSync(c.real).isDirectory()) throw new BatchError(400, 'not-a-directory');
      destDir = c.real;
    }
    let sources;
    try {
      sources = collectSources(this.files, inputs);
    } catch (e) {
      if (e.status) throw e;
      throw new BatchError(400, 'bad-path');
    }
    if (!sources.length) throw new BatchError(400, 'no-files');
    const job = {
      id: crypto.randomBytes(9).toString('base64url'), status: 'running', total: sources.length, done: 0, current: null,
      want, brand, cleanup: body.cleanup === true, pageNumbers: body.pageNumbers === true, destDir, sources, results: [],
      cancelled: false, handle: null, startedAt: Date.now(), finishedAt: null,
    };
    this.jobs.set(job.id, job);
    for (const id of [...this.jobs.keys()].slice(0, Math.max(0, this.jobs.size - KEEP_JOBS))) if (this.jobs.get(id).status !== 'running') this.jobs.delete(id);
    job.promise = this.run(job);
    return this.view(job);
  }
  outName(job, src, ext, used) {
    const stem = path.basename(src, path.extname(src));
    const dir = job.destDir || path.dirname(src);
    let name = stem + ext;
    if (path.join(dir, name) === src) name = stem + '-خروجی' + ext;
    for (let n = 2; used.has(path.join(dir, name)); n++) name = `${stem}-${n}${ext}`;
    const full = path.join(dir, name);
    used.add(full);
    return full;
  }
  async run(job) {
    const used = new Set();
    for (const src of job.sources) {
      if (job.cancelled) break;
      job.current = src;
      const r = { path: src, ok: false, outputs: [], error: null };
      try {
        job.handle = this.render({ path: src, brand: job.brand, cleanup: job.cleanup, pageNumbers: job.pageNumbers, want: job.want });
        const out = await job.handle;
        if (job.cancelled) break;
        if (job.want.pdf) r.outputs.push(this.files.write(this.outName(job, src, '.pdf', used), out.pdf, { overwrite: true }).path);
        if (job.want.html) r.outputs.push(this.files.write(this.outName(job, src, '.html', used), out.html, { overwrite: true }).path);
        r.ok = true;
      } catch (e) {
        if (job.cancelled) break;
        r.error = e.code || e.message || 'failed';
        this.log.warn(`batch ${job.id}: ${path.basename(src)} failed (${r.error})`);
      }
      job.results.push(r);
      job.done++;
    }
    job.handle = null;
    job.current = null;
    job.status = job.cancelled ? 'cancelled' : 'done';
    job.finishedAt = Date.now();
    this.log.info(`batch ${job.id} ${job.status}: ${job.results.filter((x) => x.ok).length}/${job.total} ok`);
  }
  view(job) {
    return {
      id: job.id, status: job.status, total: job.total, done: job.done, current: job.current,
      ok: job.results.filter((r) => r.ok).length, failed: job.results.filter((r) => !r.ok).length,
      formats: Object.keys(job.want).filter((k) => job.want[k]), results: job.results,
    };
  }
  get(id) {
    const j = this.jobs.get(id);
    return j ? this.view(j) : null;
  }
  cancel(id) {
    const j = this.jobs.get(id);
    if (!j) return null;
    if (j.status === 'running') {
      j.cancelled = true;
      j.handle?.cancel?.();
    }
    return this.view(j);
  }
  text(id) {
    const v = this.get(id);
    if (!v) return null;
    return [`STATUS ${v.status} ${v.done}/${v.total} ok=${v.ok} failed=${v.failed}`, ...v.results.map((r) => (r.ok ? `OK ${r.outputs.join(' | ')}` : `FAIL ${r.path} ${r.error}`))].join('\n') + '\n';
  }
}
