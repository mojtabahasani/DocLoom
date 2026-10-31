import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, waitFor } from './_s3.mjs';

let S;
let calls;
before(async () => {
  S = await startServer();
  fs.mkdirSync(path.join(S.root, 'docs/sub'), { recursive: true });
  fs.writeFileSync(path.join(S.root, 'docs/a.md'), '# الف');
  fs.writeFileSync(path.join(S.root, 'docs/b.md'), '# ب');
  fs.writeFileSync(path.join(S.root, 'docs/b.html'), '<p>old output of b.md</p>');
  fs.writeFileSync(path.join(S.root, 'docs/c.txt'), 'سی');
  fs.writeFileSync(path.join(S.root, 'docs/sub/a.md'), '# الف دو');
  fs.writeFileSync(path.join(S.root, 'docs/page.html'), '<p>standalone html</p>');
});
after(() => S.stop());

const mock = (fn) => {
  calls = [];
  S.srv.render.renderer = async ({ url, want, signal }) => {
    const q = new URL(url).searchParams;
    calls.push({ path: q.get('path'), brand: q.get('brand'), cleanup: q.get('cleanup') });
    return fn({ path: q.get('path'), want, signal });
  };
};
const start = (body) => S.call('POST', '/api/batch', { body });
const finished = (id) => waitFor(async () => { const j = (await S.call('GET', `/api/batch/${id}`)).json; return j.status !== 'running' && j; });

test('batch: folder job, both formats, outputs beside the sources, stale x.html skipped, per-file report', async () => {
  mock(async () => ({ pdf: Buffer.from('%PDF-mock'), html: '<p>html</p>' }));
  const r = await start({ paths: [path.join(S.root, 'docs')], formats: ['pdf', 'html'] });
  assert.equal(r.status, 202);
  assert.equal(r.json.total, 5, 'a.md b.md c.txt sub/a.md page.html (b.html is an output of b.md)');
  const j = await finished(r.json.id);
  assert.equal(j.status, 'done');
  assert.equal(j.ok, 5);
  assert.equal(j.failed, 0);
  assert.ok(fs.existsSync(path.join(S.root, 'docs/a.pdf')) && fs.existsSync(path.join(S.root, 'docs/sub/a.pdf')));
  assert.equal(fs.readFileSync(path.join(S.root, 'docs/a.html'), 'utf8'), '<p>html</p>');
  assert.ok(fs.existsSync(path.join(S.root, 'docs/page-خروجی.html')), 'never overwrites the source html');
  assert.equal(fs.readFileSync(path.join(S.root, 'docs/page.html'), 'utf8'), '<p>standalone html</p>');
  const txt = (await S.call('GET', `/api/batch/${r.json.id}?text=1`)).text;
  assert.match(txt, /^STATUS done 5\/5 ok=5 failed=0\n/);
});

test('batch: one failing file does not stop the rest; the report says why', async () => {
  mock(async ({ path: p }) => {
    if (p.endsWith('b.md')) throw Object.assign(new Error('x'), { code: 'render-timeout' });
    return { pdf: Buffer.from('%PDF-mock') };
  });
  fs.rmSync(path.join(S.root, 'docs/a.pdf'));
  const r = await start({ paths: [path.join(S.root, 'docs/a.md'), path.join(S.root, 'docs/b.md'), path.join(S.root, 'docs/c.txt')], formats: ['pdf'] });
  const j = await finished(r.json.id);
  assert.equal(j.status, 'done');
  assert.deepEqual([j.ok, j.failed], [2, 1]);
  assert.equal(j.results.find((x) => !x.ok).error, 'render-timeout');
  assert.ok(fs.existsSync(path.join(S.root, 'docs/c.pdf')));
});

test('batch: cancel stops the job after the running file', async () => {
  let release;
  mock(({ signal }) => new Promise((res, rej) => { release = () => res({ pdf: Buffer.from('%PDF') }); signal.addEventListener('abort', () => rej(new Error('aborted'))); }));
  const r = await start({ paths: [path.join(S.root, 'docs/a.md'), path.join(S.root, 'docs/c.txt'), path.join(S.root, 'docs/page.html')], formats: ['pdf'] });
  await waitFor(() => calls.length === 1);
  const del = await S.call('DELETE', `/api/batch/${r.json.id}`);
  assert.equal(del.status, 200);
  const j = await finished(r.json.id);
  assert.equal(j.status, 'cancelled');
  assert.equal(calls.length, 1, 'later files were never started');
  assert.ok(j.done < 3);
  void release;
});

test('batch: destination folder, brand by name, options pass through, collisions get a suffix', async () => {
  S.srv.store.put('brands', 'bX1', { ts: 1, data: { id: 'bX1', name: 'برند من' } });
  mock(async () => ({ pdf: Buffer.from('%PDF') }));
  const out = path.join(S.root, 'out');
  fs.mkdirSync(out);
  const r = await start({ paths: [path.join(S.root, 'docs/a.md'), path.join(S.root, 'docs/sub/a.md')], formats: ['pdf'], brand: 'برند من', cleanup: true, dest: { mode: 'folder', dir: out } });
  const j = await finished(r.json.id);
  assert.equal(j.ok, 2);
  assert.deepEqual(fs.readdirSync(out).sort(), ['a-2.pdf', 'a.pdf']);
  assert.ok(calls.every((c) => c.brand === 'bX1' && c.cleanup === '1'));
});

test('batch: validation (unknown brand, outside roots, no files, no format, unknown job, no Chrome)', async () => {
  mock(async () => ({ pdf: Buffer.from('%PDF') }));
  const f = path.join(S.root, 'docs/a.md');
  assert.equal((await start({ paths: [f], brand: 'ناشناس' })).json.error, 'brand-not-found');
  assert.equal((await start({ paths: ['/etc/passwd'] })).status, 403);
  assert.equal((await start({ paths: [] })).status, 400);
  assert.equal((await start({ paths: [f], formats: ['docx'] })).json.error, 'no-format');
  assert.equal((await start({ paths: [f], dest: { mode: 'folder', dir: '/etc' } })).status, 403);
  assert.equal((await S.call('GET', '/api/batch/zzz')).status, 404);
  S.srv.render.chrome = null;
  assert.equal((await start({ paths: [f] })).status, 503);
  S.srv.render.chrome = '/fake/chrome';
});
