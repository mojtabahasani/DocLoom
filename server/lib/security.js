// Request guards: CSRF, security headers, PIN lockout, and realpath root-confinement (used by S2 file APIs).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { envVar } from './env.js';

/**
 * Non-GET /api/* need `X-DocLoom: 1` and an Origin equal to this server's own origin.
 * `X-MD2Html: 1` is the header older clients, the CLI and the Finder workflows send; both are
 * accepted, because the header proves the request came from our own code, not which name it used.
 */
export function csrfOk(method, urlPath, headers) {
  if (!urlPath.startsWith('/api/')) return true;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (headers['x-docloom'] !== '1' && headers['x-md2html'] !== '1') return false;
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

/**
 * Wrong-PIN counter. `max` failures lock one IP for `lockMs`; `globalMax` failures from ANY addresses
 * inside one `lockMs` window lock every login for `lockMs`. The per-IP lock alone is not enough on a
 * LAN, where a new address is one DHCP release away: the PIN has only a million values.
 * The Mac itself never logs in (loopback is trusted), so the global lock cannot lock the owner out.
 */
export class LoginLimiter {
  constructor({ max = 5, lockMs = 15 * 60 * 1000, globalMax = 20 } = {}) {
    this.max = max;
    this.lockMs = lockMs;
    this.globalMax = globalMax;
    this.map = new Map(); // ip -> {fails, until}
    this.recent = []; // times of recent failures, any address
    this.globalUntil = 0;
  }
  /** @returns {number} ms left on the lock (0 = not locked) */
  lockedFor(ip, now = Date.now()) {
    const g = this.globalUntil > now ? this.globalUntil - now : 0;
    const e = this.map.get(ip);
    if (!e || !e.until) return g;
    if (e.until <= now) {
      this.map.delete(ip);
      return g;
    }
    return Math.max(g, e.until - now);
  }
  fail(ip, now = Date.now()) {
    const e = this.map.get(ip) || { fails: 0, until: 0 };
    e.fails++;
    if (e.fails >= this.max) e.until = now + this.lockMs;
    this.map.set(ip, e);
    this.recent = this.recent.filter((t) => now - t < this.lockMs);
    this.recent.push(now);
    if (this.recent.length >= this.globalMax) {
      this.globalUntil = now + this.lockMs;
      this.recent = [];
    }
    return { fails: e.fails, locked: e.until > now || this.globalUntil > now, left: Math.max(0, this.max - e.fails) };
  }
  success(ip) {
    this.map.delete(ip);
  }
  clear() {
    this.map.clear();
    this.recent = [];
    this.globalUntil = 0;
  }
}

// ---- Root confinement (S2 will use this for the file browser; tested now) ----
export const DEFAULT_ROOTS = () => ['MyApp', 'Documents', 'Desktop', 'Downloads'].map((d) => path.join(os.homedir(), d));
export const IGNORED_DIRS = new Set(['node_modules', '.git', 'Library', '.Trash']);
export const READ_EXT = new Set(['.md', '.markdown', '.txt', '.html', '.htm']);
export const WRITE_EXT = new Set([...READ_EXT, '.pdf', '.docx', '.png']);
/**
 * Files this server never writes, whatever the root: the instruction files coding agents load on
 * every session. They are plain Markdown inside the default roots, so without this a script that got
 * past the HTML sanitizer could plant instructions for the next agent run. Reading them stays allowed.
 */
export const PROTECTED_NAMES = new Set(['claude.md', 'claude.local.md', 'agents.md', 'gemini.md', 'memory.md', 'skill.md']);
export const isProtectedName = (file) => PROTECTED_NAMES.has(path.basename(file).toLowerCase());
/** Roots that are browse-and-read only (`DOCLOOM_RO_ROOTS`, colon-separated). None by default. */
export const roRootsFromEnv = (env = process.env) => {
  const roots = envVar('RO_ROOTS', env);
  return roots ? roots.split(':').filter(Boolean) : [];
};

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
