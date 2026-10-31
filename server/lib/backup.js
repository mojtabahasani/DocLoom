// Daily automatic backups: backups/md2html-YYYY-MM-DD.json.gz (whole library, client backup format). Keeps the newest 30.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const KEEP = 30;
export const NAME_RE = /^md2html-(\d{4}-\d{2}-\d{2}|pre-restore-\d{8}-\d{6})\.json\.gz$/;
const DAILY_RE = /^md2html-\d{4}-\d{2}-\d{2}\.json\.gz$/;

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

/** Names to delete so that only the newest `keep` daily backups remain (pre-restore snapshots are rotated separately, same cap). */
export function rotation(names, keep = KEEP) {
  const drop = [];
  for (const re of [DAILY_RE, /^md2html-pre-restore-/]) {
    const own = names.filter((n) => re.test(n)).sort();
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
    this.create(`md2html-${dayStamp(now)}.json.gz`);
    this.log?.info(`daily backup written (${dayStamp(now)})`);
  }
  lastDailyDay() {
    const d = fs.readdirSync(this.dir).filter((n) => DAILY_RE.test(n)).sort().pop();
    return d ? d.slice(8, 18) : null;
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
    if (backup.format !== 'md2html-backup' || !Array.isArray(backup.documents)) throw Object.assign(new Error('invalid backup'), { status: 422 });
    const pre = `md2html-pre-restore-${timeStamp(new Date())}.json.gz`;
    this.create(pre);
    this.store.restore(backup);
    this.log?.info(`restored ${name} (pre-restore backup ${pre})`);
    return { restored: name, preRestore: pre };
  }
}
