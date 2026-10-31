// LAN share links: a standalone interactive HTML stored under data/shares/<id>/ and served read-only at /s/<id>.
// The id is 128 random bits (base64url, 22 chars). No IP or any visitor data is stored: only a view counter.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SHARE_ID_RE = /^[A-Za-z0-9_-]{22}$/;
export const EXPIRY = { '1d': 86400000, '7d': 7 * 86400000, none: 0 };
const TOMBSTONE_MS = 7 * 86400000; // an expired / revoked share answers 410 for a week, then the folder is removed

// The shared page may run its own inline script (interactive HTML) but can reach nothing: no network, no framing, no forms.
export const SHARE_CSP = [
  "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", "img-src data: blob: https:", "font-src data:",
  "connect-src 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');

export const gonePage = () =>
  '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>لینک منقضی شده</title>' +
  '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f6f4;color:#24383b;font-family:Vazirmatn,Tahoma,sans-serif;padding:24px}' +
  'main{max-width:420px;text-align:center;background:#fffefa;border:1px solid #dce4de;border-radius:14px;padding:36px 28px}h1{font-size:1.25rem;margin:0 0 10px}p{margin:0;color:#64736d;line-height:1.9}</style></head>' +
  '<body><main><h1>این لینک دیگر معتبر نیست</h1><p>مدت اعتبار لینک اشتراک تمام شده یا صاحب آن لینک را لغو کرده است. برای دیدن سند، یک لینک تازه از او بخواهید.</p></main></body></html>';

export class Shares {
  constructor(dir, log = { info() {}, warn() {}, error() {} }) {
    this.dir = dir;
    this.log = log;
    fs.mkdirSync(dir, { recursive: true });
    this.timer = null;
  }
  start(everyMs = 3600000) {
    this.sweep();
    this.timer = setInterval(() => this.sweep(), everyMs);
    this.timer.unref();
  }
  stop() {
    clearInterval(this.timer);
  }
  p(id) {
    if (!SHARE_ID_RE.test(id)) return null;
    return path.join(this.dir, id);
  }
  readMeta(id) {
    const d = this.p(id);
    if (!d) return null;
    try {
      return JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8'));
    } catch {
      return null;
    }
  }
  writeMeta(id, meta) {
    const f = path.join(this.p(id), 'meta.json');
    fs.writeFileSync(f + '.tmp', JSON.stringify(meta));
    fs.renameSync(f + '.tmp', f);
  }
  static newId() {
    return crypto.randomBytes(16).toString('base64url');
  }
  create({ html, title = '', expires = '7d' }, now = Date.now()) {
    if (typeof html !== 'string' || !html.trim()) throw Object.assign(new Error('empty'), { status: 400 });
    if (!(expires in EXPIRY)) throw Object.assign(new Error('bad-expiry'), { status: 400 });
    const id = Shares.newId();
    fs.mkdirSync(this.p(id), { recursive: true });
    fs.writeFileSync(path.join(this.p(id), 'index.html'), html);
    const meta = { id, title: String(title).slice(0, 200), createdAt: now, expiresAt: EXPIRY[expires] ? now + EXPIRY[expires] : null, views: 0, revokedAt: null, size: Buffer.byteLength(html) };
    this.writeMeta(id, meta);
    this.log.info(`share created: ${id.slice(0, 4)}… (${expires})`);
    return meta;
  }
  state(meta, now = Date.now()) {
    if (meta.revokedAt) return 'revoked';
    if (meta.expiresAt && meta.expiresAt <= now) return 'expired';
    return 'active';
  }
  list(now = Date.now()) {
    const out = [];
    for (const d of fs.readdirSync(this.dir)) {
      const m = this.readMeta(d);
      if (m && this.state(m, now) === 'active') out.push(m);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }
  revoke(id, now = Date.now()) {
    const m = this.readMeta(id);
    if (!m || m.revokedAt) return false;
    m.revokedAt = now;
    this.writeMeta(id, m);
    fs.rmSync(path.join(this.p(id), 'index.html'), { force: true });
    return true;
  }
  /** @returns {{status:'ok', html:string}|{status:'gone'}|{status:'missing'}} and counts the view when `count`. */
  open(id, { count = true } = {}, now = Date.now()) {
    const m = this.readMeta(id);
    if (!m) return { status: 'missing' };
    if (this.state(m, now) !== 'active') {
      fs.rmSync(path.join(this.p(id), 'index.html'), { force: true });
      return { status: 'gone' };
    }
    let html;
    try {
      html = fs.readFileSync(path.join(this.p(id), 'index.html'), 'utf8');
    } catch {
      return { status: 'gone' };
    }
    if (count) {
      m.views = (m.views || 0) + 1;
      this.writeMeta(id, m);
    }
    return { status: 'ok', html };
  }
  sweep(now = Date.now()) {
    let removed = 0;
    for (const d of fs.readdirSync(this.dir)) {
      if (!SHARE_ID_RE.test(d)) continue;
      const m = this.readMeta(d);
      if (!m) {
        fs.rmSync(path.join(this.dir, d), { recursive: true, force: true });
        continue;
      }
      if (this.state(m, now) === 'active') continue;
      fs.rmSync(path.join(this.dir, d, 'index.html'), { force: true });
      const since = m.revokedAt || m.expiresAt || 0;
      if (now - since > TOMBSTONE_MS) {
        fs.rmSync(path.join(this.dir, d), { recursive: true, force: true });
        removed++;
      }
    }
    return removed;
  }
}
