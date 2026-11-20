// Daily automatic backups: backups/docloom-YYYY-MM-DD.json.gz (whole library, client backup format).
// Keeps the newest 30. Files written before the app was renamed are called md2html-… ; they are the
// same user's backups, so every pattern here accepts either prefix and only new files get the new one.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const KEEP = 30;
const APP = 'docloom';
const PREFIX = '(?:docloom|md2html)';
export const NAME_RE = new RegExp(`^${PREFIX}-(\\d{4}-\\d{2}-\\d{2}|pre-restore-\\d{8}-\\d{6})\\.json\\.gz$`);
const DAILY_RE = new RegExp(`^${PREFIX}-\\d{4}-\\d{2}-\\d{2}\\.json\\.gz$`);

const pad = (n) => String(n).padStart(2, '0');
export const dayStamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const timeStamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/** Is a daily backup due? Due when none exists for today and it is already 03:00 or later, or when the newest one is older than a day. */
export function backupDue(now, lastBackupDay) {
  const today = dayStamp(now);
  if (lastBackupDay === today) return false;
  if (!lastBackupDay) return true;
  if (now.getHours() >= 3) return true;
  // before 03:00: only catch up when yesterday's backup is also missing
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return lastBackupDay < dayStamp(y);
}

/** The date inside a backup filename, under either spelling of the app's name. */
export const dayOf = (name) => (String(name).match(/-(\d{4}-\d{2}-\d{2})\.json\.gz$/) || [])[1] || null;
/** The sortable stamp inside a pre-restore filename. */
const stampOf = (name) => (String(name).match(/-pre-restore-(\d{8}-\d{6})\.json\.gz$/) || [])[1] || '';

/** Names to delete so that only the newest `keep` daily backups remain (pre-restore snapshots are rotated separately, same cap). */
export function rotation(names, keep = KEEP) {
  const drop = [];
  // Sort by the date in the name, not the name: the two prefixes would otherwise interleave wrongly
  // and rotation would drop a recent backup while keeping an old one.
  for (const [re, keyOf] of [[DAILY_RE, dayOf], [new RegExp(`^${PREFIX}-pre-restore-`), stampOf]]) {
    const own = names.filter((n) => re.test(n)).sort((a, b) => String(keyOf(a)).localeCompare(String(keyOf(b))));
    drop.push(...own.slice(0, Math.max(0, own.length - keep)));
  }
  return drop;
}

export class Backups {
  constructor(dir, store, log) {
    this.dir = dir;
    this.store = store;
    this.log = log;
    fs.mkdirSync(dir, { recursive: true });
  }
  list() {
    return fs
      .readdirSync(this.dir)
      .filter((n) => NAME_RE.test(n))
      .map((name) => {
        const st = fs.statSync(path.join(this.dir, name));
        return { name, size: st.size, mtime: st.mtimeMs, kind: name.includes('pre-restore') ? 'pre-restore' : 'daily' };
      })
      .sort((a, b) => b.mtime - a.mtime || (a.name < b.name ? 1 : -1));
  }
  create(name) {
    const file = path.join(this.dir, name);
    const gz = zlib.gzipSync(JSON.stringify(this.store.snapshot()));
    fs.writeFileSync(file + '.tmp', gz);
    fs.renameSync(file + '.tmp', file);
    for (const n of rotation(fs.readdirSync(this.dir))) fs.rmSync(path.join(this.dir, n), { force: true });
    return file;
  }
  daily(now = new Date()) {
    this.create(`${APP}-${dayStamp(now)}.json.gz`);
    this.log?.info(`daily backup written (${dayStamp(now)})`);
  }
  lastDailyDay() {
    // Two prefixes now live side by side, and «docloom-» sorts before «md2html-» whatever the
    // date is — so the newest backup is found by its date, never by its filename.
    const days = fs.readdirSync(this.dir).filter((n) => DAILY_RE.test(n)).map(dayOf).filter(Boolean).sort();
    return days.pop() || null;
  }
  /** Writes a daily backup if one is due. Returns true when it did. */
  runIfDue(now = new Date()) {
    if (!backupDue(now, this.lastDailyDay())) return false;
    this.daily(now);
    return true;
  }
  start() {
    this.runIfDue();
    this.timer = setInterval(() => {
      try {
        this.runIfDue();
      } catch (e) {
        this.log?.error('backup failed: ' + e.message);
      }
    }, 10 * 60 * 1000);
    this.timer.unref();
  }
  restore(name) {
    if (!NAME_RE.test(name)) throw Object.assign(new Error('bad name'), { status: 400 });
    const file = path.join(this.dir, name);
    if (!fs.existsSync(file)) throw Object.assign(new Error('not found'), { status: 404 });
    const backup = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
    if (!/^(docloom|md2html)-backup$/.test(String(backup.format)) || !Array.isArray(backup.documents)) throw Object.assign(new Error('invalid backup'), { status: 422 });
    const pre = `${APP}-pre-restore-${timeStamp(new Date())}.json.gz`;
    this.create(pre);
    this.store.restore(backup);
    this.log?.info(`restored ${name} (pre-restore backup ${pre})`);
    return { restored: name, preRestore: pre };
  }
}
