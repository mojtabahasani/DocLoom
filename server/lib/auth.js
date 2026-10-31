// PIN + sessions. config.json holds only the scrypt hash+salt of the PIN and SHA-256 hashes of session tokens.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const COOKIE = 'md2h_sid';

const scrypt = (pin, salt) => new Promise((res, rej) => crypto.scrypt(String(pin), salt, 32, (e, k) => (e ? rej(e) : res(k))));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export const newPin = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

export async function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  return { pinSalt: salt.toString('hex'), pinHash: (await scrypt(pin, salt)).toString('hex') };
}

export async function verifyPin(pin, cfg) {
  if (!/^\d{6}$/.test(String(pin)) || !cfg.pinHash) return false;
  const got = await scrypt(pin, Buffer.from(cfg.pinSalt, 'hex'));
  const want = Buffer.from(cfg.pinHash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/** A session is valid for 30 days after it was last seen (sliding). */
export const sessionValid = (s, now = Date.now()) => !!s && now - (s.lastSeen ?? s.created) < SESSION_MS;

export class Auth {
  constructor(dir) {
    this.file = path.join(dir, 'config.json');
    this.cfg = { sessions: [] };
    this.lastSave = 0;
    try {
      this.cfg = { sessions: [], ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch {
      /* first run */
    }
  }
  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.cfg, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
  /** Generates a PIN on first run; returns it (otherwise null). */
  async ensurePin() {
    if (this.cfg.pinHash) return null;
    const pin = newPin();
    Object.assign(this.cfg, await hashPin(pin));
    this.save();
    return pin;
  }
  /** Replaces the PIN and signs every device out. */
  async resetPin() {
    const pin = newPin();
    Object.assign(this.cfg, await hashPin(pin));
    this.cfg.sessions = [];
    this.save();
    return pin;
  }
  verify(pin) {
    return verifyPin(pin, this.cfg);
  }
  createSession({ ua = '', label = '', ip = '' }, now = Date.now()) {
    const token = crypto.randomBytes(32).toString('base64url');
    const id = sha(token).slice(0, 16);
    this.cfg.sessions.push({ id, hash: sha(token), label, ua: ua.slice(0, 200), ip, created: now, lastSeen: now });
    this.cfg.sessions = this.cfg.sessions.filter((s) => sessionValid(s, now)).slice(-50);
    this.save();
    return token;
  }
  find(token, now = Date.now()) {
    if (!token) return null;
    const h = sha(token);
    const s = this.cfg.sessions.find((x) => x.hash === h);
    if (!s) return null;
    if (!sessionValid(s, now)) {
      this.revoke(s.id);
      return null;
    }
    if (now - s.lastSeen > 60_000) {
      s.lastSeen = now;
      this.save();
    }
    return s;
  }
  revoke(id) {
    const n = this.cfg.sessions.length;
    this.cfg.sessions = this.cfg.sessions.filter((s) => s.id !== id);
    if (this.cfg.sessions.length !== n) this.save();
    return this.cfg.sessions.length !== n;
  }
  devices() {
    return this.cfg.sessions.map(({ id, label, ip, created, lastSeen }) => ({ id, label, ip, created, lastSeen }));
  }
  get(key) {
    return this.cfg[key];
  }
  set(key, value) {
    this.cfg[key] = value;
    this.save();
  }
}
