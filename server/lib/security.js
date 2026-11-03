// Request guards: CSRF, security headers, PIN lockout, and realpath root-confinement (used by S2 file APIs).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/** Non-GET /api/* need `X-MD2Html: 1` and an Origin equal to this server's own origin. */
export function csrfOk(method, urlPath, headers) {
  if (!urlPath.startsWith('/api/')) return true;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (headers['x-md2html'] !== '1') return false;
  const origin = headers.origin;
  if (!origin || !headers.host) return false;
  try {
    const u = new URL(origin);
    // The server speaks http today, but https must not silently 403 every write if it is ever put behind TLS.
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return u.host.toLowerCase() === String(headers.host).toLowerCase();
  } catch {
    return false;
  }
}

// The app is one inline script + inline styles, so 'unsafe-inline' is required; everything else stays closed.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: data: blob:",
  "frame-src 'self' blob: data: about:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const securityHeaders = () => ({
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
});

/** Per-IP wrong-PIN counter: `max` failures lock the IP for `lockMs`. */
export class LoginLimiter {
  constructor({ max = 5, lockMs = 15 * 60 * 1000 } = {}) {
    this.max = max;
    this.lockMs = lockMs;
    this.map = new Map(); // ip -> {fails, until}
  }
  /** @returns {number} ms left on the lock (0 = not locked) */
  lockedFor(ip, now = Date.now()) {
    const e = this.map.get(ip);
    if (!e || !e.until) return 0;
    if (e.until <= now) {
      this.map.delete(ip);
      return 0;
    }
    return e.until - now;
  }
  fail(ip, now = Date.now()) {
    const e = this.map.get(ip) || { fails: 0, until: 0 };
    e.fails++;
    if (e.fails >= this.max) e.until = now + this.lockMs;
    this.map.set(ip, e);
    return { fails: e.fails, locked: e.until > now, left: Math.max(0, this.max - e.fails) };
  }
  success(ip) {
    this.map.delete(ip);
  }
  clear() {
    this.map.clear();
  }
}

// ---- Root confinement (S2 will use this for the file browser; tested now) ----
export const DEFAULT_ROOTS = () => ['MyApp', 'Documents', 'Desktop', 'Downloads'].map((d) => path.join(os.homedir(), d));
export const IGNORED_DIRS = new Set(['node_modules', '.git', 'Library', '.Trash']);
export const READ_EXT = new Set(['.md', '.markdown', '.txt', '.html', '.htm']);
export const WRITE_EXT = new Set([...READ_EXT, '.pdf', '.docx', '.png']);

const inside = (root, p) => p === root || p.startsWith(root.endsWith(path.sep) ? root : root + path.sep);

/** True when any path segment is an ignored folder or a dot-folder (the file name itself may start with a dot only if it is the leaf). */
export function hasIgnoredSegment(rel) {
  const parts = rel.split(path.sep).filter(Boolean);
  return parts.slice(0, -1).some((s) => IGNORED_DIRS.has(s) || s.startsWith('.'));
}

/**
 * Resolve `target` with realpath and require it to stay inside one of `roots` (also realpath'ed).
 * For files that do not exist yet (writes) the parent directory is resolved instead.
 * @returns {{ok:true, real:string, root:string} | {ok:false, reason:string}}
 */
export function confine(target, roots, { mustExist = true } = {}) {
  if (typeof target !== 'string' || !target || target.includes('\0')) return { ok: false, reason: 'bad-path' };
  if (!path.isAbsolute(target)) return { ok: false, reason: 'not-absolute' };
  let real;
  try {
    real = fs.realpathSync(target);
  } catch (e) {
    if (mustExist || e.code !== 'ENOENT') return { ok: false, reason: 'not-found' };
    try {
      real = path.join(fs.realpathSync(path.dirname(path.resolve(target))), path.basename(target));
    } catch {
      return { ok: false, reason: 'not-found' };
    }
  }
  for (const r of roots) {
    let rr;
    try {
      rr = fs.realpathSync(r);
    } catch {
      continue;
    }
    if (inside(rr, real)) {
      if (hasIgnoredSegment(path.relative(rr, real))) return { ok: false, reason: 'ignored-dir' };
      return { ok: true, real, root: rr };
    }
  }
  return { ok: false, reason: 'outside-roots' };
}

export const extAllowed = (file, write = false) => (write ? WRITE_EXT : READ_EXT).has(path.extname(file).toLowerCase());
