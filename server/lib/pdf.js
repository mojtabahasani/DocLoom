// Direct PDF / HTML rendering through headless Chrome, driven over the DevTools protocol on --remote-debugging-pipe
// (Node built-ins only). One worker: jobs run one at a time, each with a hard timeout and a throw-away profile folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn as nodeSpawn } from 'node:child_process';
import { envVar } from './env.js';

export const CHROME_MAC = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const JOB_TIMEOUT_MS = 60000;

/** Path of a usable Chrome, or null. DOCLOOM_CHROME overrides; an override that does not exist is NOT replaced by the default. */
export function findChrome({ env = process.env, exists = fs.existsSync } = {}) {
  const override = envVar('CHROME', env);
  if (override) return exists(override) ? override : null;
  return exists(CHROME_MAC) ? CHROME_MAC : null;
}

export class RenderError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

/** Minimal DevTools-protocol client over the pipe pair (fd3 = to Chrome, fd4 = from Chrome; messages end with NUL). */
export class CdpPipe {
  constructor(toChrome, fromChrome) {
    this.out = toChrome;
    this.id = 0;
    this.pending = new Map();
    this.buf = '';
    this.closed = false;
    fromChrome.setEncoding('utf8');
    fromChrome.on('data', (d) => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf('\0')) >= 0) {
        const raw = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 1);
        let m;
        try {
          m = JSON.parse(raw);
        } catch {
          continue;
        }
        const p = m.id && this.pending.get(m.id);
        if (p) {
          this.pending.delete(m.id);
          if (m.error) p.reject(new RenderError('cdp', `${p.method}: ${m.error.message}`));
          else p.resolve(m.result || {});
        }
      }
    });
    fromChrome.on('close', () => this.close());
    fromChrome.on('error', () => this.close());
    toChrome.on('error', () => this.close());
  }
  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new RenderError('chrome-closed'));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.out.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) p.reject(new RenderError('chrome-closed'));
    this.pending.clear();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const FOOTER_TEMPLATE =
  '<div style="width:100%;font-size:9px;color:#666;text-align:center;font-family:Tahoma,Arial,sans-serif;direction:ltr"><span class="pageNumber"></span> / <span class="totalPages"></span></div>';

/**
 * Open `url` in a fresh headless Chrome, wait until the page sets window.__docloomReady, then produce what was asked.
 * @returns {Promise<{pdf?:Buffer, html?:string}>}
 */
export async function chromeRender({ chrome, url, want = { pdf: true }, pageNumbers = false, signal, staticPage = false, spawn = nodeSpawn, tmpBase = os.tmpdir(), readyTimeoutMs = 45000 }) {
  if (!chrome) throw new RenderError('chrome-unavailable');
  const profile = fs.mkdtempSync(path.join(tmpBase, 'docloom-chrome-'));
  let child;
  let cdp;
  let exited = null;
  let cleaned = null;
  // Kill Chrome, wait for it to let go of the profile, then delete the profile. Safe to call twice.
  const cleanup = () => {
    if (cleaned) return cleaned;
    cdp?.close();
    cleaned = (async () => {
      try {
        child?.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      if (exited) await Promise.race([exited, sleep(2000)]);
      try {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
      } catch {
        /* a leftover temp folder is not worth failing a finished PDF */
      }
    })();
    return cleaned;
  };
  try {
    child = spawn(chrome, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
      '--disable-sync', '--hide-scrollbars', '--mute-audio', '--font-render-hinting=none', `--user-data-dir=${profile}`, '--remote-debugging-pipe', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    exited = new Promise((r) => child.once('exit', r));
    child.on('error', () => cdp?.close());
    child.on('exit', () => cdp?.close());
    if (signal) signal.addEventListener('abort', () => void cleanup(), { once: true });
    cdp = new CdpPipe(child.stdio[3], child.stdio[4]);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => cdp.send(m, p, sessionId);
    await s('Page.enable');
    await s('Runtime.enable');
    await s('Emulation.setEmulatedMedia', { media: 'print' });
    await s('Page.navigate', { url });
    const until = Date.now() + readyTimeoutMs;
    if (staticPage) {
      // A plain exported page (no app): ready = loaded + fonts settled.
      const r = await s('Runtime.evaluate', {
        expression: "new Promise((res) => { const f = () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => res('ok')); document.readyState === 'complete' ? f() : addEventListener('load', f); })",
        awaitPromise: true, returnByValue: true,
      });
      if (r.result?.value !== 'ok') throw new RenderError('render-failed', 'page did not load');
    } else for (;;) {
      if (signal?.aborted) throw new RenderError('aborted');
      const r = await s('Runtime.evaluate', { expression: 'window.__docloomError ? "E:" + window.__docloomError : window.__docloomReady === true ? "ok" : ""', returnByValue: true });
      const v = r.result?.value;
      if (v === 'ok') break;
      if (v) throw new RenderError('render-failed', String(v).slice(2));
      if (Date.now() > until) throw new RenderError('render-timeout');
      await sleep(120);
    }
    const out = {};
    if (want.html) {
      const r = await s('Runtime.evaluate', { expression: 'window.__docloomHTML || ""', returnByValue: true });
      out.html = String(r.result?.value || '');
    }
    if (want.pdf) {
      const r = await s('Page.printToPDF', {
        paperWidth: 8.2677, paperHeight: 11.6929, preferCSSPageSize: true, printBackground: true,
        displayHeaderFooter: !!pageNumbers, headerTemplate: '<div></div>', footerTemplate: pageNumbers ? FOOTER_TEMPLATE : '<div></div>',
      });
      out.pdf = Buffer.from(r.data, 'base64');
    }
    return out;
  } finally {
    await cleanup();
  }
}

/** A single-worker queue. `run(job, signal)` does the work; each job gets `timeoutMs` and can be cancelled. */
export class RenderQueue {
  constructor({ run, timeoutMs = JOB_TIMEOUT_MS } = {}) {
    this.run = run;
    this.timeoutMs = timeoutMs;
    this.q = [];
    this.active = null;
    this.busy = false;
  }
  get length() {
    return this.q.length + (this.active ? 1 : 0);
  }
  /** Returns a promise; `cancel()` on the returned handle's `.cancel`. */
  add(job) {
    const ctl = new AbortController();
    const item = { job, ctl, cancelled: false };
    const p = new Promise((resolve, reject) => Object.assign(item, { resolve, reject }));
    p.cancel = () => {
      item.cancelled = true;
      ctl.abort();
      const i = this.q.indexOf(item);
      if (i >= 0) {
        this.q.splice(i, 1);
        item.reject(new RenderError('cancelled'));
      }
    };
    this.q.push(item);
    queueMicrotask(() => this.pump());
    return p;
  }
  async pump() {
    if (this.busy) return;
    this.busy = true;
    while (this.q.length) {
      const item = this.q.shift();
      this.active = item;
      let timer;
      try {
        const timeout = new Promise((_, rej) => {
          timer = setTimeout(() => {
            rej(new RenderError('render-timeout')); // first, so it wins the race against the abort rejection
            item.ctl.abort();
          }, this.timeoutMs);
        });
        const r = await Promise.race([this.run(item.job, item.ctl.signal), timeout]);
        item.resolve(r);
      } catch (e) {
        item.reject(item.cancelled ? new RenderError('cancelled') : e);
      } finally {
        clearTimeout(timer);
        this.active = null;
      }
    }
    this.busy = false;
  }
}

/** Orchestrates tokens, staged HTML and the queue. `getBase()` is the server's own http://127.0.0.1:<port>. */
export class RenderService {
  constructor({ chrome = findChrome(), getBase, log = { info() {}, warn() {}, error() {} }, renderer = chromeRender, timeoutMs = JOB_TIMEOUT_MS, spawn, tmpBase } = {}) {
    this.chrome = chrome;
    this.getBase = getBase;
    this.log = log;
    this.renderer = renderer;
    this.spawn = spawn;
    this.tmpBase = tmpBase;
    this.tokens = new Map(); // token -> expiry ms
    this.staged = new Map(); // id -> {html, exp}
    this.queue = new RenderQueue({ run: (job, signal) => this.execute(job, signal), timeoutMs });
    this.sweeper = setInterval(() => this.sweep(), 30000);
    this.sweeper.unref();
  }
  available() {
    return !!this.chrome;
  }
  sweep(now = Date.now()) {
    for (const [k, v] of this.tokens) if (v < now) this.tokens.delete(k);
    for (const [k, v] of this.staged) if (v.exp < now) this.staged.delete(k);
  }
  validToken(t) {
    const exp = this.tokens.get(String(t || ''));
    return !!exp && exp > Date.now();
  }
  stage(html) {
    const id = crypto.randomBytes(12).toString('base64url');
    this.staged.set(id, { html, exp: Date.now() + 5 * 60000 });
    return id;
  }
  stagedHtml(id) {
    return this.staged.get(String(id || ''))?.html ?? null;
  }
  /** spec: {html} | {doc} | {path}, plus {brand, cleanup, pageNumbers, want:{pdf,html}} */
  render(spec) {
    if (!this.chrome) return Promise.reject(new RenderError('chrome-unavailable'));
    return this.queue.add(spec);
  }
  renderUrl(spec, token, stagedId) {
    const q = new URLSearchParams({ t: token });
    if (stagedId) q.set('staged', stagedId);
    else {
      if (spec.doc) q.set('doc', spec.doc);
      if (spec.path) q.set('path', spec.path);
      if (spec.brand) q.set('brand', spec.brand);
      if (spec.cleanup) q.set('cleanup', '1');
    }
    return `${this.getBase()}/render?${q}`;
  }
  async execute(spec, signal) {
    const token = crypto.randomBytes(18).toString('base64url');
    this.tokens.set(token, Date.now() + 5 * 60000);
    const stagedId = spec.html ? this.stage(spec.html) : null;
    try {
      return await this.renderer({
        chrome: this.chrome, url: this.renderUrl(spec, token, stagedId), want: spec.want || { pdf: true },
        pageNumbers: !!spec.pageNumbers, signal, staticPage: !!spec.html, spawn: this.spawn, tmpBase: this.tmpBase,
      });
    } finally {
      this.tokens.delete(token);
      if (stagedId) this.staged.delete(stagedId);
    }
  }
  close() {
    clearInterval(this.sweeper);
  }
}
