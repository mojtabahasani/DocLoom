import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, LAN } from './_s3.mjs';
import { Shares, SHARE_ID_RE, EXPIRY } from '../../server/lib/shares.js';

let S;
before(async () => { S = await startServer(); });
after(() => S.stop());

const html = '<!doctype html><html><body><main>سلام</main><script>1</script></body></html>';

test('share: create → public read-only page (no PIN) with a strict CSP; views are counted', async () => {
  const c = await S.call('POST', '/api/shares', { body: { html, title: 'سند', expires: '1d' } });
  assert.equal(c.status, 201);
  const { id, path: p } = c.json;
  assert.match(id, SHARE_ID_RE);
  assert.equal(p, `/s/${id}`);
  // LAN visitor without session: allowed
  const r = await S.call('GET', p, { headers: LAN });
  assert.equal(r.status, 200);
  assert.equal(r.text, html);
  const csp = r.headers['content-security-policy'];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(r.headers['set-cookie'], undefined);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  await S.call('GET', p);
  const list = (await S.call('GET', '/api/shares')).json.shares;
  assert.equal(list.find((x) => x.id === id).views, 2);
  // the meta file holds no visitor data
  const meta = fs.readFileSync(path.join(S.data, 'shares', id, 'meta.json'), 'utf8');
  assert.doesNotMatch(meta, /192\.168|127\.0\.0\.1/);
  // other routes stay behind the PIN
  assert.equal((await S.call('GET', '/api/shares', { headers: LAN })).status, 401);
  assert.equal((await S.call('DELETE', `/api/shares/${id}`, { headers: LAN })).status, 401);
});

test('share: revoke → 410 Persian page; unknown id → 404; bad ids never touch the disk', async () => {
  const { id } = (await S.call('POST', '/api/shares', { body: { html, expires: 'none' } })).json;
  assert.equal((await S.call('DELETE', `/api/shares/${id}`)).status, 200);
  const gone = await S.call('GET', `/s/${id}`, { headers: LAN });
  assert.equal(gone.status, 410);
  assert.match(gone.text, /دیگر معتبر نیست/);
  assert.equal((await S.call('DELETE', `/api/shares/${id}`)).status, 404, 'already revoked');
  assert.equal((await S.call('GET', `/s/${Shares.newId()}`)).status, 404);
  assert.equal((await S.call('GET', '/s/..%2F..%2Fconfig')).status, 404);
  assert.equal((await S.call('GET', '/s/')).status, 404);
  assert.ok(!(await S.call('GET', '/api/shares')).json.shares.some((x) => x.id === id));
});

test('share: validation', async () => {
  assert.equal((await S.call('POST', '/api/shares', { body: { html: '' } })).status, 400);
  assert.equal((await S.call('POST', '/api/shares', { body: { html, expires: '3y' } })).status, 400);
});

test('Shares: expiry, sweep, 128-bit ids', () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(S.data), 'sh-'));
  const sh = new Shares(dir);
  const t0 = 1_000_000;
  const a = sh.create({ html, expires: '1d' }, t0);
  const b = sh.create({ html, expires: '7d' }, t0);
  const n = sh.create({ html, expires: 'none' }, t0);
  assert.equal(a.expiresAt, t0 + EXPIRY['1d']);
  assert.equal(n.expiresAt, null);
  assert.equal(sh.open(a.id, {}, t0 + 1000).status, 'ok');
  assert.equal(sh.open(a.id, {}, t0 + EXPIRY['1d'] + 1).status, 'gone');
  assert.ok(!fs.existsSync(path.join(dir, a.id, 'index.html')), 'html deleted once expired');
  assert.equal(sh.open(b.id, {}, t0 + EXPIRY['1d'] + 1).status, 'ok');
  assert.deepEqual(sh.list(t0 + EXPIRY['1d'] + 1).map((x) => x.id).sort(), [b.id, n.id].sort());
  // sweep removes the folder a week after expiry; the immortal one stays
  assert.equal(sh.sweep(t0 + EXPIRY['7d'] + 8 * 86400000), 2);
  assert.ok(!fs.existsSync(path.join(dir, a.id)) && !fs.existsSync(path.join(dir, b.id)));
  assert.ok(fs.existsSync(path.join(dir, n.id, 'index.html')));
  // ids: 22 base64url chars = 128 bits, no repeats
  const ids = new Set(Array.from({ length: 2000 }, () => Shares.newId()));
  assert.equal(ids.size, 2000);
  for (const id of ids) assert.match(id, SHARE_ID_RE);
  assert.equal(Buffer.from([...ids][0], 'base64url').length, 16);
  assert.equal(sh.p('../x'), null);
});
