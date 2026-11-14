import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { FileService, FileError, MAX_READ, KEEP_FILE_BACKUPS } from '../../server/lib/files.js';
import { createServer } from '../../server/index.js';

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md2h-files-')));
const rootA = path.join(tmp, 'rootA');
const rootB = path.join(tmp, 'rootB');
const outside = path.join(tmp, 'outside');
const data = path.join(tmp, 'data');
for (const d of [rootA, rootB, outside, data, path.join(rootA, 'پوشه'), path.join(rootA, 'node_modules', 'x'), path.join(rootA, '.git'), path.join(rootA, '.hidden')]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(rootA, 'گزارش ماهانه.md'), '# گزارش');
fs.writeFileSync(path.join(rootA, 'پوشه', 'یادداشت‌ها.txt'), 'note');
fs.writeFileSync(path.join(rootA, 'page.html'), '<h1>x</h1>');
fs.writeFileSync(path.join(rootA, 'image.png'), 'png');
fs.writeFileSync(path.join(rootA, 'node_modules', 'x', 'readme.md'), 'ignored');
fs.writeFileSync(path.join(rootA, '.git', 'notes.md'), 'ignored');
fs.writeFileSync(path.join(rootA, '.hidden', 'a.md'), 'ignored');
fs.writeFileSync(path.join(outside, 'secret.md'), 'secret');
fs.symlinkSync(outside, path.join(rootA, 'escape'));
fs.symlinkSync(path.join(outside, 'secret.md'), path.join(rootA, 'link.md'));
fs.writeFileSync(path.join(rootB, 'b.md'), 'b');

const svc = new FileService({ roots: [rootA, rootB], dataDir: data, debounceMs: 40 });
after(() => {
  svc.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
const code = (fn) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof FileError, String(e));
    return e.status;
  }
  return 0;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await wait(40);
  }
  return false;
}

test('confinement: traversal, symlink escape, outside roots, relative and NUL paths', () => {
  assert.equal(code(() => svc.read(path.join(rootA, '..', 'outside', 'secret.md'))), 403);
  assert.equal(code(() => svc.read(path.join(rootA, 'escape', 'secret.md'))), 403);
  assert.equal(code(() => svc.read(path.join(rootA, 'link.md'))), 403);
  assert.equal(code(() => svc.read(path.join(outside, 'secret.md'))), 403);
  assert.equal(code(() => svc.read('گزارش ماهانه.md')), 400);
  assert.equal(code(() => svc.read(path.join(rootA, 'a\0.md'))), 400);
  assert.equal(code(() => svc.read(path.join(rootA, 'nope.md'))), 404);
  assert.equal(code(() => svc.list(outside)), 403);
  assert.equal(code(() => svc.write(path.join(rootA, 'escape', 'x.md'), 'x', { overwrite: true })), 403);
  assert.equal(code(() => svc.write(path.join(rootA, '..', 'x.md'), 'x', { overwrite: true })), 403);
});

test('extensions and ignored folders', () => {
  assert.equal(code(() => svc.read(path.join(rootA, 'image.png'))), 415); // png is write-only
  assert.equal(code(() => svc.read(path.join(rootA, 'node_modules', 'x', 'readme.md'))), 403);
  assert.equal(code(() => svc.read(path.join(rootA, '.git', 'notes.md'))), 403);
  assert.equal(code(() => svc.read(path.join(rootA, '.hidden', 'a.md'))), 403);
  assert.equal(code(() => svc.list(path.join(rootA, 'node_modules'))), 403);
  assert.equal(code(() => svc.write(path.join(rootA, 'run.sh'), 'x')), 415);
  assert.equal(code(() => svc.write(path.join(rootA, 'x.js'), 'x')), 415);
  assert.equal(code(() => svc.write(path.join(rootA, '.secret.md'), 'x')), 400);
  assert.equal(code(() => svc.write(path.join(rootA, 'node_modules', 'a.md'), 'x')), 403);
});

test('list: roots, folders first, ignored/dot/escaping entries hidden', () => {
  assert.deepEqual(svc.list('').entries.map((e) => e.name), ['rootA', 'rootB']);
  const l = svc.list(rootA);
  const names = l.entries.map((e) => e.name);
  assert.deepEqual(names.slice(0, 1), ['پوشه']);
  assert.ok(names.includes('گزارش ماهانه.md') && names.includes('page.html'));
  for (const bad of ['node_modules', '.git', '.hidden', 'escape', 'link.md', 'image.png']) assert.ok(!names.includes(bad), bad);
  assert.equal(l.parent, null);
  assert.equal(svc.list(path.join(rootA, 'پوشه')).parent, rootA);
});

test('read: content, etag, 5 MB cap', () => {
  const r = svc.read(path.join(rootA, 'گزارش ماهانه.md'));
  assert.equal(r.content, '# گزارش');
  assert.ok(r.etag && r.mtime);
  const big = path.join(rootA, 'big.txt');
  fs.writeFileSync(big, Buffer.alloc(MAX_READ + 1, 97));
  assert.equal(code(() => svc.read(big)), 413);
  fs.writeFileSync(big, Buffer.alloc(MAX_READ, 97));
  assert.equal(svc.read(big).size, MAX_READ);
  fs.rmSync(big);
});

test('write: backup before overwrite, rotation to the last 20, atomic result', () => {
  const f = path.join(rootA, 'doc.md');
  const first = svc.write(f, 'v0');
  assert.equal(fs.readFileSync(f, 'utf8'), 'v0');
  assert.deepEqual(svc.backupsOf(f), []);
  let etag = first.etag;
  for (let i = 1; i <= 25; i++) etag = svc.write(f, 'v' + i, { etag }).etag;
  assert.equal(fs.readFileSync(f, 'utf8'), 'v25');
  const b = svc.backupsOf(f);
  assert.equal(b.length, KEEP_FILE_BACKUPS);
  const dir = path.join(data, 'backups', 'files');
  const sub = fs.readdirSync(dir)[0];
  const texts = fs.readdirSync(path.join(dir, sub)).filter((n) => !n.startsWith('.')).map((n) => fs.readFileSync(path.join(dir, sub, n), 'utf8'));
  assert.ok(texts.includes('v24') && !texts.includes('v0') && !texts.includes('v4'), texts.join());
  assert.equal(fs.readdirSync(rootA).filter((n) => n.endsWith('.tmp')).length, 0);
});

test('write: 409 when the disk changed since open; exists without overwrite; gone', () => {
  const f = path.join(rootA, 'conflict.md');
  const a = svc.write(f, 'mine');
  fs.writeFileSync(f, 'someone else');
  let err;
  try {
    svc.write(f, 'my edit', { etag: a.etag });
  } catch (e) {
    err = e;
  }
  assert.equal(err.status, 409);
  assert.equal(err.message, 'conflict');
  assert.equal(err.current.size, 'someone else'.length);
  assert.equal(fs.readFileSync(f, 'utf8'), 'someone else');
  // overwrite with the fresh etag succeeds and the foreign version is backed up
  const ok = svc.write(f, 'my edit', { etag: err.current.etag });
  assert.equal(fs.readFileSync(f, 'utf8'), 'my edit');
  assert.ok(svc.backupsOf(f).length >= 1);
  assert.equal(code(() => svc.write(f, 'x')), 409); // no etag, no overwrite
  assert.equal(ok.name, 'conflict.md');
  fs.rmSync(f);
  assert.equal(code(() => svc.write(f, 'x', { etag: ok.etag })), 409); // vanished
  svc.write(f, 'recreated', { etag: ok.etag, overwrite: true });
  assert.equal(fs.readFileSync(f, 'utf8'), 'recreated');
});

test('write: binary exports (png/docx/pdf) land next to the file; no backup for binaries', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);
  const r = svc.write(path.join(rootA, 'پوشه', 'out.png'), png);
  assert.deepEqual(fs.readFileSync(r.path), png);
  svc.write(path.join(rootA, 'پوشه', 'out.png'), png, { overwrite: true });
  assert.equal(svc.backupsOf(r.path).length, 0);
  svc.write(path.join(rootA, 'x.docx'), Buffer.from('PK'));
  svc.write(path.join(rootA, 'x.pdf'), Buffer.from('%PDF'));
  assert.equal(code(() => svc.write(path.join(rootA, 'x.zip'), 'z')), 415);
});

test('mkdir stays confined and refuses ignored names', () => {
  assert.ok(svc.mkdir(path.join(rootA, 'تازه')).path.endsWith('تازه'));
  assert.equal(code(() => svc.mkdir(path.join(rootA, 'تازه'))), 409);
  assert.equal(code(() => svc.mkdir(path.join(rootA, 'node_modules2', 'a'))), 404);
  assert.equal(code(() => svc.mkdir(path.join(rootA, '.git'))), 400);
  assert.equal(code(() => svc.mkdir(path.join(outside, 'x'))), 403);
});

test('search index: Persian-aware, type filter, ignored dirs skipped, updates on create/rename/delete', async () => {
  let r = await svc.search('گزارش');
  assert.ok(r.results.some((x) => x.name === 'گزارش ماهانه.md'));
  // Arabic ye/kaf and ZWNJ variants match the same files
  r = await svc.search('يادداشت ها'); // every token matches the ZWNJ-less name
  assert.ok(r.results.some((x) => x.name === 'یادداشت‌ها.txt'));
  assert.equal((await svc.search('یادداشت نامربوط')).results.length, 0); // all tokens must match
  r = await svc.search('يادداشتها');
  assert.ok(r.results.some((x) => x.name === 'یادداشت‌ها.txt'));
  r = await svc.search('readme');
  assert.equal(r.results.length, 0);
  r = await svc.search('', { type: 'html' });
  assert.ok(r.results.length >= 1 && r.results.every((x) => x.ext === '.html'));
  assert.ok((await svc.search('b.md')).results.some((x) => x.root === rootB));

  await wait(300); // FSEvents needs a moment after the watcher starts before it reports changes
  const nf = path.join(rootA, 'پوشه', 'تازه-ساخته.md');
  fs.writeFileSync(nf, 'new');
  assert.ok(await until(async () => (await svc.search('تازه-ساخته')).results.length === 1), 'created file is indexed');
  const renamed = path.join(rootA, 'پوشه', 'تغییرنام.md');
  fs.renameSync(nf, renamed);
  assert.ok(await until(async () => (await svc.search('تغییرنام')).results.length === 1 && (await svc.search('تازه-ساخته')).results.length === 0), 'rename is reflected');
  fs.mkdirSync(path.join(rootB, 'sub'));
  fs.writeFileSync(path.join(rootB, 'sub', 'deep.md'), 'd');
  assert.ok(await until(async () => (await svc.search('deep')).results.length === 1), 'file in a new folder is indexed');
  fs.rmSync(path.join(rootB, 'sub'), { recursive: true });
  assert.ok(await until(async () => (await svc.search('deep')).results.length === 0), 'deleted folder leaves the index');
  fs.rmSync(renamed);
  assert.ok(await until(async () => (await svc.search('تغییرنام')).results.length === 0), 'deleted file leaves the index');
  fs.writeFileSync(path.join(rootA, 'node_modules', 'x', 'late.md'), 'x');
  await wait(200);
  assert.equal((await svc.search('late')).results.length, 0);
});

test('watch: one debounced event per burst, no event for identical content, delete event', async () => {
  const f = path.join(rootA, 'live.md');
  fs.writeFileSync(f, 'one');
  const events = [];
  const off = svc.watch(f, (e) => events.push(e));
  assert.equal(events[0].type, 'ready');
  for (let i = 0; i < 5; i++) {
    fs.writeFileSync(f, 'two' + (i === 4 ? '' : i));
    await wait(5);
  }
  assert.ok(await until(() => events.some((e) => e.type === 'change')));
  await wait(250);
  assert.equal(events.filter((e) => e.type === 'change').length, 1);
  assert.equal(events.at(-1).etag, svc.stamp(f).etag);
  fs.writeFileSync(f, 'two'); // same bytes: touches mtime only
  await wait(250);
  assert.equal(events.filter((e) => e.type === 'change').length, 1);
  fs.rmSync(f);
  assert.ok(await until(() => events.some((e) => e.type === 'deleted')));
  off();
  assert.equal(svc.fileWatchers.size, 0);
  assert.equal(code(() => svc.watch(path.join(outside, 'secret.md'), () => {})), 403);
});

test('recent and pinned persist in the data dir and survive a restart', () => {
  const a = path.join(rootA, 'page.html');
  const b = path.join(rootA, 'گزارش ماهانه.md');
  svc.recent(a);
  svc.recent(b);
  svc.recent(a);
  svc.setPinned(b, true);
  let v = svc.metaView();
  assert.deepEqual(v.recent.slice(0, 2).map((r) => r.name), ['page.html', 'گزارش ماهانه.md']);
  assert.equal(v.pinned[0].path, b);
  const again = new FileService({ roots: [rootA, rootB], dataDir: data });
  assert.equal(again.metaView().pinned[0].path, b);
  again.close();
  svc.setPinned(b, false);
  assert.equal(svc.metaView().pinned.length, 0);
  assert.equal(code(() => svc.recent(path.join(outside, 'secret.md'))), 403);
  // files that vanished drop out of the lists
  fs.writeFileSync(path.join(rootA, 'tmp-recent.md'), 'x');
  svc.recent(path.join(rootA, 'tmp-recent.md'));
  fs.rmSync(path.join(rootA, 'tmp-recent.md'));
  assert.ok(!svc.metaView().recent.some((r) => r.name === 'tmp-recent.md'));
});

test('writes: agent instruction files and read-only roots are refused; reading still works', () => {
  const claude = path.join(rootA, 'CLAUDE.md');
  fs.writeFileSync(claude, 'rules');
  fs.symlinkSync(claude, path.join(rootA, 'innocent.md'));
  assert.equal(svc.read(claude).content, 'rules');
  for (const p of [claude, path.join(rootA, 'innocent.md'), path.join(rootA, 'پوشه', 'AGENTS.md'), path.join(rootA, 'memory.md')]) {
    let err;
    try { svc.write(p, 'planted', { overwrite: true }); } catch (e) { err = e; }
    assert.equal(err?.status, 403, p);
    assert.equal(err?.message, 'protected-file', p);
  }
  assert.equal(fs.readFileSync(claude, 'utf8'), 'rules');
  assert.ok(!fs.existsSync(path.join(rootA, 'پوشه', 'AGENTS.md')));

  const ro = new FileService({ roots: [rootA, rootB], readOnlyRoots: [rootB], dataDir: data, watchIndex: false });
  try {
    assert.deepEqual(ro.roots.map((r) => r.readOnly), [false, true]);
    assert.equal(ro.read(path.join(rootB, 'b.md')).content, 'b');
    for (const fn of [() => ro.write(path.join(rootB, 'b.md'), 'x', { overwrite: true }), () => ro.write(path.join(rootB, 'new.md'), 'x'), () => ro.mkdir(path.join(rootB, 'sub'))]) {
      let err;
      try { fn(); } catch (e) { err = e; }
      assert.equal(err?.message, 'read-only-root');
    }
    assert.equal(fs.readFileSync(path.join(rootB, 'b.md'), 'utf8'), 'b');
    ro.write(path.join(rootA, 'ro-ok.md'), 'fine');
    fs.rmSync(path.join(rootA, 'ro-ok.md'));
  } finally {
    ro.close();
  }
  fs.rmSync(path.join(rootA, 'innocent.md'));
  fs.rmSync(claude);
});

// ---- HTTP layer ----
test('HTTP: auth, CSRF, 409 payload, SSE watch', async () => {
  process.env.MD2HTML_TEST = '1';
  const dd = path.join(tmp, 'data2');
  const srv = await createServer({ dataDir: dd, echo: false, roots: [rootA] });
  await new Promise((r) => srv.server.listen(0, '127.0.0.1', r));
  const port = srv.server.address().port;
  const call = (method, p, { body, headers = {} } = {}) =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? null : JSON.stringify(body);
      const h = { Host: `127.0.0.1:${port}`, ...(method !== 'GET' ? { 'X-MD2Html': '1', Origin: `http://127.0.0.1:${port}` } : {}), ...headers };
      if (payload) h['Content-Length'] = Buffer.byteLength(payload);
      const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: h }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode, json: (() => { try { return JSON.parse(text); } catch { return null; } })() });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  try {
    const f = path.join(rootA, 'http.md');
    const q = (p) => '/api/files/read?path=' + encodeURIComponent(p);
    assert.equal((await call('GET', q(f), { headers: { 'x-test-remote-addr': '192.168.1.5' } })).status, 401); // LAN without session
    assert.equal((await call('GET', q(path.join(outside, 'secret.md')))).status, 403);
    assert.equal((await call('POST', '/api/files/write', { body: { path: f, content: 'a' }, headers: { Origin: 'http://evil.example' } })).status, 403);
    const w1 = await call('POST', '/api/files/write', { body: { path: f, content: 'سلام' } });
    assert.equal(w1.status, 200);
    const rd = await call('GET', q(f));
    assert.equal(rd.json.content, 'سلام');
    fs.writeFileSync(f, 'changed');
    const w2 = await call('POST', '/api/files/write', { body: { path: f, content: 'mine', etag: w1.json.etag } });
    assert.equal(w2.status, 409);
    assert.equal(w2.json.error, 'conflict');
    assert.ok(w2.json.current.etag);
    const b64 = await call('POST', '/api/files/write', { body: { path: path.join(rootA, 'e.png'), content: Buffer.from([1, 2, 3]).toString('base64'), encoding: 'base64' } });
    assert.equal(b64.status, 200);
    assert.deepEqual([...fs.readFileSync(path.join(rootA, 'e.png'))], [1, 2, 3]);
    assert.equal((await call('GET', '/api/files/search?q=http')).json.results.length, 1);

    // SSE
    const got = [];
    const sse = http.request({ host: '127.0.0.1', port, path: '/api/watch?path=' + encodeURIComponent(f), headers: { Host: `127.0.0.1:${port}` } }, (res) => {
      assert.match(res.headers['content-type'], /event-stream/);
      res.on('data', (c) => got.push(String(c)));
    });
    sse.end();
    assert.ok(await until(() => got.join('').includes('event: ready')));
    fs.writeFileSync(f, 'from disk');
    assert.ok(await until(() => got.join('').includes('event: change')));
    sse.destroy();
  } finally {
    delete process.env.MD2HTML_TEST;
    srv.server.closeAllConnections?.();
    srv.server.close();
  }
});
