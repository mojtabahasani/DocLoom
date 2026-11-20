import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../../server/index.js';

const data = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'md2h-int-'));
let srv;
let port;
const LAN = { 'x-test-remote-addr': '192.168.1.50' };
const lanChanges = [];

before(async () => {
  process.env.DOCLOOM_TEST = '1';
  srv = await createServer({ dataDir: data, echo: false, onLanChange: (on) => lanChanges.push(on) });
  await new Promise((r) => srv.server.listen(0, '127.0.0.1', r));
  port = srv.server.address().port;
});
after(() => {
  delete process.env.DOCLOOM_TEST;
  srv.server.closeAllConnections?.();
  srv.server.close();
  fs.rmSync(data, { recursive: true, force: true });
});

function call(method, p, { headers = {}, body, raw } = {}) {
  return new Promise((resolve, reject) => {
    const payload = raw ?? (body === undefined ? null : JSON.stringify(body));
    const h = { Host: `127.0.0.1:${port}`, ...headers };
    if (method !== 'GET' && h['X-DocLoom'] === undefined && !h.noapi) {
      h['X-DocLoom'] = '1';
      h.Origin ??= `http://127.0.0.1:${port}`;
    }
    if (payload) h['Content-Length'] = Buffer.byteLength(payload);
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: h }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not json */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
const doc = (id, o = {}) => ({ id, title: 'سند ' + id, source: '# x', html: '<h1>x</h1>', createdAt: 1, updatedAt: 2, ...o });

test('static: app, standalone file, security headers; traversal is refused', async () => {
  const r = await call('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/html/);
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['referrer-policy'], 'no-referrer');
  assert.equal((await call('GET', '/DocLoom.html')).status, 200);
  assert.equal((await call('GET', '/manifest.webmanifest')).status, 200);
  assert.equal((await call('GET', '/sw.js')).status, 200);
  for (const p of ['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/icons/../../package.json', '/%00']) {
    const x = await call('GET', p);
    assert.ok([400, 404].includes(x.status), `${p} → ${x.status}`);
    assert.ok(!x.text.includes('docloom'), p);
  }
  assert.equal((await call('GET', '/nope.txt')).status, 404);
});

test('localhost needs no PIN; health is open', async () => {
  const h = await call('GET', '/api/health');
  assert.equal(h.json.ok, true);
  assert.equal(h.json.app, 'docloom');
  assert.equal((await call('GET', '/api/lib/documents')).status, 200);
});

test('guards: public IP, bad Host, CSRF, body limit', async () => {
  assert.equal((await call('GET', '/api/health', { headers: { 'x-test-remote-addr': '8.8.8.8' } })).status, 403);
  assert.equal((await call('GET', '/api/health', { headers: { Host: 'evil.com' } })).status, 421);
  assert.equal((await call('GET', '/api/health', { headers: { Host: 'evil.com:80' } })).status, 421);
  const put = (headers) => call('PUT', '/api/lib/documents/c1', { headers, body: { ts: 1, data: doc('c1') } });
  assert.equal((await put({ 'X-DocLoom': '0' })).status, 403, 'wrong CSRF header');
  assert.equal((await put({ Origin: 'http://evil.com' })).status, 403, 'foreign Origin');
  assert.equal((await put({ Origin: 'null' })).status, 403);
  assert.equal((await put({})).status, 200);
  const big = await call('PUT', '/api/lib/documents/big', { raw: '{"ts":1,"data":"' + 'a'.repeat(21 * 1024 * 1024) + '"}' }).catch((e) => ({ status: e.code === 'ECONNRESET' || e.code === 'EPIPE' ? 413 : 0 }));
  assert.equal(big.status, 413);
});

test('the test-only remote address header is ignored when DOCLOOM_TEST is not 1', async () => {
  delete process.env.DOCLOOM_TEST;
  try {
    const r = await call('GET', '/api/lib/documents', { headers: LAN });
    assert.equal(r.status, 200, 'treated as the real (loopback) peer, not as a LAN client');
    assert.equal((await call('GET', '/api/health', { headers: { 'x-test-remote-addr': '8.8.8.8' } })).status, 200);
  } finally {
    process.env.DOCLOOM_TEST = '1';
  }
});

test('LAN client: login page, API refused, PIN login, lockout, devices', async () => {
  const pin = srv.firstPin;
  const page = await call('GET', '/', { headers: LAN });
  assert.equal(page.status, 200);
  assert.match(page.text, /dir="rtl"/);
  assert.match(page.text, /رمز ۶ رقمی/);
  assert.ok(!page.text.includes('docloom-font'), 'app is not served without a session');
  assert.equal((await call('GET', '/api/lib/documents', { headers: LAN })).status, 401);
  assert.equal((await call('GET', '/api/health', { headers: LAN })).status, 200);
  assert.ok(!(await call('GET', '/DocLoom.html', { headers: LAN })).text.includes('docloom-font'), 'standalone app is not served without a session');
  // lockout (other IP so the real login below is unaffected)
  const bad = { 'x-test-remote-addr': '192.168.1.77' };
  const wrong = pin === '000000' ? '000001' : '000000';
  for (let i = 1; i <= 4; i++) {
    const r = await call('POST', '/api/login', { headers: bad, body: { pin: wrong } });
    assert.equal(r.status, 401);
    assert.equal(r.json.left, 5 - i);
  }
  const fifth = await call('POST', '/api/login', { headers: bad, body: { pin: wrong } });
  assert.equal(fifth.status, 429);
  const locked = await call('POST', '/api/login', { headers: bad, body: { pin } });
  assert.equal(locked.status, 429, 'correct PIN is refused while locked');
  assert.ok(locked.json.retryAfter > 800);
  // a different LAN IP is unaffected, and logs in
  const ok = await call('POST', '/api/login', { headers: { ...LAN, 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Safari/605.1' }, body: { pin } });
  assert.equal(ok.status, 200);
  const cookie = ok.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Max-Age=2592000/);
  const c = { ...LAN, Cookie: cookie.split(';')[0] };
  assert.equal((await call('GET', '/', { headers: c })).status, 200);
  assert.equal((await call('GET', '/api/lib/documents', { headers: c })).status, 200);
  assert.equal((await call('POST', '/api/pin/reset', { headers: c })).status, 403, 'PIN reset is Mac-only');
  const devs = (await call('GET', '/api/devices', { headers: c })).json.devices;
  assert.equal(devs.length, 1);
  assert.equal(devs[0].label, 'iPhone · Safari');
  assert.equal(devs[0].current, true);
  assert.equal((await call('GET', '/api/session', { headers: c })).json.local, false);
  // revoke from the Mac
  assert.equal((await call('DELETE', '/api/devices/' + devs[0].id)).status, 200);
  assert.equal((await call('GET', '/api/lib/documents', { headers: c })).status, 401);
});

test('network access: only the Mac may change it; the choice is saved and reported', async () => {
  const login = await call('POST', '/api/login', { headers: LAN, body: { pin: srv.firstPin } });
  const c = { ...LAN, Cookie: login.headers['set-cookie'][0].split(';')[0] };
  assert.equal((await call('POST', '/api/server/lan', { headers: c, body: { on: true } })).status, 403, 'a signed-in phone cannot open the network');
  assert.equal((await call('POST', '/api/server/lan', { body: { on: 'yes' } })).status, 400);
  assert.equal((await call('POST', '/api/server/lan', { body: { on: false } })).status, 200);
  assert.equal(srv.auth.get('lan'), false);
  const off = (await call('GET', '/api/server/info')).json;
  assert.equal(off.lan, false);
  assert.deepEqual(off.urls, [], 'no LAN address is advertised while the network is closed');
  assert.equal((await call('POST', '/api/server/lan', { body: { on: true } })).json.lan, true);
  assert.equal(srv.auth.get('lan'), true);
  assert.equal((await call('GET', '/api/server/info')).json.lan, true);
  assert.deepEqual(lanChanges, [false, true], 'the listener is told once per real change');
  await call('DELETE', '/api/devices/' + (await call('GET', '/api/devices', { headers: c })).json.devices[0].id);
});

test('PIN reset from the Mac signs everyone out and issues a working PIN', async () => {
  const login = await call('POST', '/api/login', { headers: LAN, body: { pin: srv.firstPin } });
  assert.equal(login.status, 200);
  const c = { ...LAN, Cookie: login.headers['set-cookie'][0].split(';')[0] };
  const r = await call('POST', '/api/pin/reset');
  assert.match(r.json.pin, /^\d{6}$/);
  assert.equal((await call('GET', '/api/lib/documents', { headers: c })).status, 401);
  assert.equal((await call('POST', '/api/login', { headers: LAN, body: { pin: r.json.pin } })).status, 200);
});

test('library API: put / get / list / delete / conditional write / batch fetch / index', async () => {
  const p = await call('PUT', '/api/lib/documents/s1', { body: { ts: 10, data: doc('s1'), ifTs: null } });
  assert.equal(p.status, 200);
  assert.equal((await call('PUT', '/api/lib/documents/s1', { body: { ts: 11, data: doc('s1'), ifTs: null } })).status, 409);
  assert.equal((await call('GET', '/api/lib/documents/s1')).json.data.title, 'سند s1');
  assert.ok((await call('GET', '/api/lib/documents')).json.items.some((i) => i.id === 's1' && i.ts === 10));
  assert.ok(fs.readdirSync(path.join(data, 'library', 'documents')).some((f) => f.endsWith('-s1.md')), 'readable copy on disk');
  const f = await call('POST', '/api/lib/fetch', { body: { keys: [{ store: 'documents', id: 's1' }, { store: 'documents', id: 'missing' }] } });
  assert.equal(f.json.items.length, 1);
  const del = await call('DELETE', '/api/lib/documents/s1?ts=20');
  assert.equal(del.status, 200);
  const idx = (await call('GET', '/api/sync/index')).json.items.find((i) => i.id === 's1');
  assert.deepEqual({ ts: idx.ts, deleted: idx.deleted }, { ts: 20, deleted: true });
  assert.equal((await call('GET', '/api/lib/nope')).status, 404);
  assert.equal((await call('PUT', '/api/lib/documents/..%2Fx', { body: { ts: 1, data: doc('x') } })).status, 400);
  assert.equal((await call('PUT', '/api/lib/documents/bad', { raw: '{nope' })).status, 400);
});

test('retired API: a deleted document and a pruned version stay readable; nothing can remove them', async () => {
  await call('PUT', '/api/lib/documents/r1', { body: { ts: 10, data: doc('r1', { title: 'بازنشسته' }) } });
  await call('PUT', '/api/lib/versions/rv1', { body: { ts: 11, data: { id: 'rv1', docId: 'r1', savedAt: 11, reason: 'auto', title: 'بازنشسته', source: '# قدیمی', html: '' } } });
  await call('DELETE', '/api/lib/versions/rv1?ts=30');
  await call('DELETE', '/api/lib/documents/r1?ts=31');
  const list = await call('GET', '/api/retired?doc=r1');
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.versions.map((v) => v.name), ['rv1-30.json.gz']);
  assert.deepEqual(list.json.documents.map((v) => v.name), ['r1-31.json.gz']);
  assert.equal((await call('GET', '/api/retired/versions/r1/rv1-30.json.gz')).json.data.source, '# قدیمی');
  assert.equal((await call('GET', '/api/retired/documents/r1-31.json.gz')).json.data.title, 'بازنشسته');
  assert.equal((await call('GET', '/api/retired/documents/zz-1.json.gz')).status, 404);
  assert.equal((await call('GET', '/api/retired?doc=..%2Fx')).status, 400);
  assert.equal((await call('GET', '/api/retired/documents/..%2F..%2Fconfig.json')).status, 400);
  assert.equal((await call('DELETE', '/api/retired/documents/r1-31.json.gz')).status, 404);
  assert.equal((await call('GET', '/api/retired?doc=r1', { headers: LAN })).status, 401, 'needs a session from the network, like the rest of the API');
});

test('SSE: another client sees changes immediately', async () => {
  const got = await new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/events', headers: { Host: `127.0.0.1:${port}` } }, (res) => {
      assert.match(res.headers['content-type'], /text\/event-stream/);
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        if (buf.includes('event: change')) { req.destroy(); resolve(buf); }
      });
      setTimeout(() => call('PUT', '/api/lib/documents/e1', { headers: { 'X-DocLoom-Client': 'abc' }, body: { ts: 1, data: doc('e1') } }), 100);
    });
    req.on('error', (e) => (e.code === 'ECONNRESET' ? null : reject(e)));
    setTimeout(() => reject(new Error('no SSE event')), 4000);
  });
  assert.match(got, /"id":"e1"/);
  assert.match(got, /"by":"abc"/);
});

test('backups API: list, create, restore (pre-restore snapshot first)', async () => {
  await call('PUT', '/api/lib/documents/r1', { body: { ts: 1, data: doc('r1') } });
  const made = await call('POST', '/api/backups');
  assert.equal(made.status, 200);
  const name = made.json.backups.find((b) => b.kind === 'daily').name;
  await call('DELETE', '/api/lib/documents/r1?ts=500');
  const r = await call('POST', `/api/backups/${name}/restore`);
  assert.equal(r.status, 200);
  assert.ok(r.json.preRestore);
  assert.equal((await call('GET', '/api/lib/documents/r1')).json.deleted, undefined, 'document is back');
  assert.equal((await call('POST', '/api/backups/..%2F..%2Fx/restore')).status, 400);
  assert.equal((await call('POST', '/api/backups/docloom-1999-01-01.json.gz/restore')).status, 404);
  const info = await call('GET', '/api/server/info');
  assert.equal(info.json.dataDir, data);
  assert.equal(info.json.local, true);
  assert.ok(info.json.lastBackup);
});
