import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { LibraryStore, slug, readableCopy, StoreError } from '../../server/lib/store.js';
import { Backups, rotation, backupDue, dayStamp, KEEP } from '../../server/lib/backup.js';
import { createLogger } from '../../server/lib/log.js';

const tmp = () => fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'md2h-st-'));
const doc = (id, o = {}) => ({ id, title: 'عنوان ' + id, source: '# سلام', html: '<h1>سلام</h1>', createdAt: 1, updatedAt: 2, ...o });

test('slug keeps Persian letters and drops punctuation', () => {
  assert.equal(slug('گزارش فروش: مهر ۱۴۰۵!'), 'گزارش-فروش-مهر-۱۴۰۵');
  assert.equal(slug('///'), 'untitled');
  assert.ok(slug('x'.repeat(100)).length <= 40);
});

test('readableCopy: .md from the Markdown source, .html otherwise', () => {
  assert.deepEqual(readableCopy({ source: '# a' }), { ext: '.md', text: '# a' });
  const h = readableCopy({ source: '', title: 'a<b', html: '<p>x</p>' });
  assert.equal(h.ext, '.html');
  assert.match(h.text, /<title>a&lt;b<\/title>/);
});

test('store: put writes JSON + readable copy named slug+id; rename replaces the copy; delete leaves a tombstone', () => {
  const dir = tmp();
  const s = new LibraryStore(dir);
  s.put('documents', 'd1', { ts: 5, data: doc('d1', { title: 'اول' }) });
  assert.ok(fs.existsSync(path.join(dir, 'documents', 'd1.json')));
  assert.ok(fs.existsSync(path.join(dir, 'documents', 'اول-d1.md')));
  s.put('documents', 'd1', { ts: 6, data: doc('d1', { title: 'دوم' }) });
  assert.deepEqual(fs.readdirSync(path.join(dir, 'documents')).sort(), ['d1.json', 'دوم-d1.md']);
  assert.deepEqual(s.list('documents'), [{ id: 'd1', ts: 6, deleted: false }]);
  s.del('documents', 'd1', { ts: 9 });
  assert.deepEqual(fs.readdirSync(path.join(dir, 'documents')), ['d1.json']);
  assert.deepEqual(s.list('documents'), [{ id: 'd1', ts: 9, deleted: true }]);
  assert.equal(s.get('documents', 'd1').deleted, true);
  // survives a restart
  const s2 = new LibraryStore(dir);
  assert.deepEqual(s2.list('documents'), [{ id: 'd1', ts: 9, deleted: true }]);
  s2.put('documents', 'd2', { ts: 1, data: doc('d2', { source: '' }) });
  assert.ok(fs.readdirSync(path.join(dir, 'documents')).includes('عنوان-d2-d2.html'));
});

test('store: validation and conditional writes', () => {
  const s = new LibraryStore(tmp());
  assert.throws(() => s.put('nope', 'a', { ts: 1, data: {} }), (e) => e instanceof StoreError && e.status === 404);
  assert.throws(() => s.put('documents', '../x', { ts: 1, data: {} }), (e) => e.status === 400);
  assert.throws(() => s.put('documents', 'a b', { ts: 1, data: {} }), (e) => e.status === 400);
  assert.throws(() => s.put('documents', 'a', { ts: 'x', data: {} }), (e) => e.status === 400);
  assert.throws(() => s.put('documents', 'a', { ts: 1, data: doc('other') }), (e) => e.status === 400);
  assert.throws(() => s.put('settings', 'autosave', { ts: 1, data: { key: 'other', value: 1 } }), (e) => e.status === 400);
  s.put('documents', 'a', { ts: 1, data: doc('a'), ifTs: null });
  assert.throws(() => s.put('documents', 'a', { ts: 2, data: doc('a'), ifTs: null }), (e) => e.status === 409 && e.current.ts === 1);
  assert.throws(() => s.put('documents', 'a', { ts: 2, data: doc('a'), ifTs: 7 }), (e) => e.status === 409);
  s.put('documents', 'a', { ts: 2, data: doc('a'), ifTs: 1 });
  const events = [];
  s.on('change', (e) => events.push(e));
  s.put('settings', 'autosave', { ts: 3, data: { key: 'autosave', value: true }, by: 'c1' });
  assert.deepEqual(events[0], { store: 'settings', id: 'autosave', ts: 3, deleted: false, by: 'c1' });
});

test('backup rotation keeps the newest 30 (daily and pre-restore separately)', () => {
  const names = [];
  for (let i = 1; i <= 35; i++) names.push(`docloom-2026-09-${String(i).padStart(2, '0')}.json.gz`.replace('2026-09-3', '2026-10-0'));
  const uniq = [...new Set(names)];
  const drop = rotation(uniq);
  assert.equal(drop.length, uniq.length - KEEP);
  assert.deepEqual(drop, uniq.slice().sort().slice(0, drop.length));
  assert.deepEqual(rotation(['docloom-2026-10-01.json.gz', 'notes.txt']), []);
  const pre = Array.from({ length: 32 }, (_, i) => `docloom-pre-restore-20261001-${String(100000 + i)}.json.gz`);
  assert.equal(rotation(pre).length, 2);
});

test('rotation and lastDailyDay go by the date, not the filename, once both app names are present', () => {
  // «docloom-» sorts before «docloom-» whatever the date says, so a plain filename sort would drop
  // this month's backup and keep last year's. The date in the name is the only ordering that holds.
  const mixed = [
    'docloom-2026-11-01.json.gz', 'docloom-2026-11-02.json.gz',
    'docloom-2026-11-03.json.gz', 'docloom-2026-11-04.json.gz',
  ];
  assert.deepEqual(rotation(mixed, 2), ['docloom-2026-11-01.json.gz', 'docloom-2026-11-02.json.gz'], 'the two oldest go, whatever they are called');
  assert.deepEqual(rotation(mixed, 3), ['docloom-2026-11-01.json.gz']);
  assert.deepEqual(rotation(mixed, 4), []);

  // And the newest day is found across both spellings.
  const dir = tmp();
  const store = new LibraryStore(path.join(dir, 'library'));
  const b = new Backups(path.join(dir, 'backups'), store);
  b.daily(new Date(2026, 10, 3, 12)); // writes docloom-2026-11-03
  fs.writeFileSync(path.join(dir, 'backups', 'docloom-2026-11-01.json.gz'), zlib.gzipSync('{}'));
  assert.equal(b.lastDailyDay(), '2026-11-03');
  fs.writeFileSync(path.join(dir, 'backups', 'docloom-2026-11-09.json.gz'), zlib.gzipSync('{}'));
  assert.equal(b.lastDailyDay(), '2026-11-09', 'an older-named file with a newer date still wins');
});

test('a backup written under the old app name is still restorable', () => {
  const dir = tmp();
  const store = new LibraryStore(path.join(dir, 'library'));
  const b = new Backups(path.join(dir, 'backups'), store);
  const legacy = { format: 'docloom-backup', version: 1, app: 'DocLoom', exportedAt: new Date().toISOString(), documents: [doc('old')], versions: [], brands: [], settings: {} };
  fs.writeFileSync(path.join(dir, 'backups', 'docloom-2026-10-30.json.gz'), zlib.gzipSync(JSON.stringify(legacy)));
  const r = b.restore('docloom-2026-10-30.json.gz');
  assert.ok(r.preRestore.startsWith('docloom-pre-restore-'), 'the safety copy it takes carries the new name');
  assert.deepEqual(store.list('documents').filter((e) => !e.deleted).map((e) => e.id), ['old']);
});

test('backupDue: first run, after 03:00, and catch-up rules', () => {
  const at = (h, day = 31) => new Date(2026, 9, day, h, 0, 0);
  assert.equal(dayStamp(at(12)), '2026-10-31');
  assert.equal(backupDue(at(12), null), true);
  assert.equal(backupDue(at(12), '2026-10-31'), false);
  assert.equal(backupDue(at(12), '2026-10-30'), true);
  assert.equal(backupDue(at(2), '2026-10-30'), false, 'before 03:00 yesterday is enough');
  assert.equal(backupDue(at(2), '2026-10-29'), true, 'missed yesterday → catch up');
  assert.equal(backupDue(at(3), '2026-10-30'), true);
});

test('Backups: create gz, list, restore takes a pre-restore backup and replaces the library', () => {
  const dir = tmp();
  const store = new LibraryStore(path.join(dir, 'library'));
  const b = new Backups(path.join(dir, 'backups'), store);
  store.put('documents', 'a', { ts: 1, data: doc('a') });
  store.put('settings', 'autosave', { ts: 1, data: { key: 'autosave', value: false } });
  b.daily(new Date(2026, 9, 30, 12));
  const name = 'docloom-2026-10-30.json.gz';
  const saved = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, 'backups', name))));
  assert.equal(saved.format, 'docloom-backup');
  assert.equal(saved.documents.length, 1);
  assert.deepEqual(saved.settings, { autosave: false });
  // change the library, then restore
  store.put('documents', 'b', { ts: 5, data: doc('b') });
  store.del('documents', 'a', { ts: 6 });
  const r = b.restore(name);
  assert.match(r.preRestore, /^docloom-pre-restore-\d{8}-\d{6}\.json\.gz$/);
  assert.ok(b.list().some((x) => x.name === r.preRestore));
  const live = store.list('documents').filter((e) => !e.deleted).map((e) => e.id);
  assert.deepEqual(live, ['a'], 'b removed, a back');
  assert.ok(store.list('documents').find((e) => e.id === 'a').ts > 6, 'restored items are newer than every client copy');
  assert.equal(store.get('documents', 'a').data.updatedAt, store.get('documents', 'a').ts);
  const pre = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, 'backups', r.preRestore))));
  assert.deepEqual(pre.documents.map((x) => x.id).sort(), ['b']);
  assert.throws(() => b.restore('../etc/passwd'), (e) => e.status === 400);
  assert.throws(() => b.restore('docloom-2020-01-01.json.gz'), (e) => e.status === 404);
  assert.equal(b.runIfDue(new Date(2026, 9, 30, 13)), false);
  assert.equal(b.runIfDue(new Date(2026, 9, 31, 13)), true);
});

test('logger rotates at the size limit', () => {
  const dir = tmp();
  const log = createLogger(dir, { maxBytes: 200, keep: 2, echo: false });
  for (let i = 0; i < 30; i++) log.info('line ' + i + ' ' + 'x'.repeat(30));
  const files = fs.readdirSync(dir).sort();
  assert.ok(files.includes('server.log') && files.includes('server.log.1'));
  assert.ok(!files.includes('server.log.3'));
});

test('store: a delete retires the content first — documents flat, versions under their document', () => {
  const dir = tmp();
  const s = new LibraryStore(dir);
  s.put('documents', 'd1', { ts: 5, data: doc('d1', { title: 'ماندنی' }) });
  s.put('versions', 'v1', { ts: 6, data: { id: 'v1', docId: 'd1', savedAt: 6, reason: 'auto', title: 'ماندنی', source: '# قدیمی', html: '<h1>قدیمی</h1>' } });
  s.put('versions', 'v2', { ts: 7, data: { id: 'v2', docId: 'd1', savedAt: 7, reason: 'manual', title: 'ماندنی', source: '# تازه', html: '' } });
  s.del('versions', 'v1', { ts: 100 });
  s.del('documents', 'd1', { ts: 101 });
  assert.equal(s.get('documents', 'd1').deleted, true); // clients still see the tombstone
  assert.deepEqual(fs.readdirSync(path.join(dir, '_retired', 'versions', 'd1')), ['v1-100.json.gz']);
  assert.deepEqual(fs.readdirSync(path.join(dir, '_retired', 'documents')), ['d1-101.json.gz']);

  const r = s.retiredOf('d1');
  assert.deepEqual(r.versions.map((v) => [v.name, v.id, v.savedAt, v.reason, v.retiredAt]), [['v1-100.json.gz', 'v1', 6, 'auto', 100]]);
  assert.equal(r.documents[0].title, 'ماندنی');
  assert.equal(s.getRetired('versions', 'v1-100.json.gz', 'd1').data.source, '# قدیمی');
  assert.equal(s.getRetired('documents', 'd1-101.json.gz').data.title, 'ماندنی');
  assert.deepEqual(s.retiredOf('nobody'), { versions: [], documents: [] });

  // Deleting a tombstone again retires nothing; a second life of the same id gets its own file.
  s.del('documents', 'd1', { ts: 200 });
  s.put('documents', 'd1', { ts: 300, data: doc('d1', { title: 'دوباره' }) });
  s.del('documents', 'd1', { ts: 301 });
  s.put('documents', 'd1', { ts: 302, data: doc('d1', { title: 'سه‌باره' }) });
  s.del('documents', 'd1', { ts: 301 }); // same stamp as before: must not overwrite the earlier retirement
  assert.deepEqual(fs.readdirSync(path.join(dir, '_retired', 'documents')).sort(), ['d1-101.json.gz', 'd1-301-2.json.gz', 'd1-301.json.gz']);
  // survives a restart and stays out of the live index
  assert.deepEqual(new LibraryStore(dir).list('documents').map((e) => e.id), ['d1']);
});

test('store: retired names are validated, so the read route cannot walk out of _retired', () => {
  const s = new LibraryStore(tmp());
  assert.throws(() => s.getRetired('documents', '../documents/d1.json'), (e) => e instanceof StoreError && e.status === 400);
  assert.throws(() => s.getRetired('versions', 'v1-1.json.gz', '..'), (e) => e.status === 400);
  assert.throws(() => s.getRetired('nope', 'v1-1.json.gz'), (e) => e.status === 404);
  assert.throws(() => s.retiredOf('../x'), (e) => e.status === 400);
  assert.equal(s.getRetired('documents', 'd9-1.json.gz'), null);
});

test('store: restoring a backup retires what the backup does not contain', () => {
  const dir = tmp();
  const s = new LibraryStore(dir);
  s.put('documents', 'keep', { ts: 1, data: doc('keep') });
  s.put('documents', 'gone', { ts: 1, data: doc('gone', { title: 'بیرون از پشتیبان' }) });
  s.restore({ documents: [doc('keep')] }, 50);
  assert.equal(s.getRetired('documents', 'gone-50.json.gz').data.title, 'بیرون از پشتیبان');
});
