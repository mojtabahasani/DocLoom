import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isPrivateIp, isLoopback, normalizeIp, hostAllowed } from '../../server/lib/net.js';
import { csrfOk, LoginLimiter, confine, extAllowed, isProtectedName, CSP } from '../../server/lib/security.js';
import { lanEnabled, listenHost } from '../../server/index.js';
import { Auth, sessionValid, SESSION_MS, newPin } from '../../server/lib/auth.js';
import { clientIp } from '../../server/lib/app.js';

const tmp = () => fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'md2h-sec-'));

test('private-IP check accepts LAN/loopback/link-local/ULA and refuses public addresses', () => {
  for (const ip of ['127.0.0.1', '::1', '10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.1.20', '169.254.1.1', 'fd12:3456::1', 'fe80::1', '::ffff:192.168.0.5']) assert.ok(isPrivateIp(ip), ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '192.169.0.1', '2001:db8::1', '', 'garbage', '::ffff:8.8.8.8']) assert.ok(!isPrivateIp(ip), ip);
  assert.ok(isLoopback('::ffff:127.0.0.1'));
  assert.equal(normalizeIp('::ffff:10.0.0.1'), '10.0.0.1');
});

test('Host allowlist: localhost, loopback, LAN IPs and *.local only', () => {
  const lan = ['192.168.1.20'];
  for (const h of ['localhost:7123', 'localhost', '127.0.0.1:7123', '[::1]:7123', '192.168.1.20:7123', 'MacMiniM4s-Mac-mini-245.local:7123', 'mac.local']) assert.ok(hostAllowed(h, lan), h);
  for (const h of ['evil.com', 'evil.com:7123', '192.168.1.99:7123', 'localhost.evil.com', 'x.local.evil.com', '', undefined, '10.0.0.1']) assert.ok(!hostAllowed(h, lan), String(h));
});

test('CSRF: non-GET /api needs X-DocLoom: 1 and the same Origin', () => {
  const h = { host: 'localhost:7123', origin: 'http://localhost:7123', 'x-docloom': '1' };
  assert.ok(csrfOk('POST', '/api/lib/documents/a', h));
  assert.ok(csrfOk('GET', '/api/health', { host: 'localhost:7123' }));
  assert.ok(csrfOk('POST', '/not-api', { host: 'x' }));
  assert.ok(!csrfOk('POST', '/api/x', { ...h, 'x-docloom': undefined }));
  assert.ok(!csrfOk('POST', '/api/x', { ...h, origin: 'http://evil.com' }));
  assert.ok(!csrfOk('POST', '/api/x', { ...h, origin: 'http://localhost:9999' }));
  assert.ok(!csrfOk('DELETE', '/api/x', { ...h, origin: undefined }));
  assert.ok(!csrfOk('PUT', '/api/x', { ...h, origin: 'null' }));
});

test('CSRF: the Origin check compares hosts, so https does not 403 every write', () => {
  const h = { host: 'mac.local:7123', 'x-docloom': '1' };
  assert.ok(csrfOk('POST', '/api/x', { ...h, origin: 'http://mac.local:7123' }));
  assert.ok(csrfOk('POST', '/api/x', { ...h, origin: 'https://mac.local:7123' }));
  // Anything that is not an http(s) page origin still fails.
  for (const origin of ['file://', 'chrome-extension://abc', 'ws://mac.local:7123', 'data:text/html,x']) {
    assert.ok(!csrfOk('POST', '/api/x', { ...h, origin }), origin);
  }
});

test('CSP forbids framing and plugins', () => {
  assert.match(CSP, /frame-ancestors 'none'/);
  assert.match(CSP, /object-src 'none'/);
});

test('PIN lockout: 5 wrong attempts lock the IP for 15 minutes, per IP', () => {
  const l = new LoginLimiter();
  const t0 = 1_000_000;
  for (let i = 1; i <= 4; i++) assert.equal(l.fail('1.1.1.1', t0).locked, false);
  assert.equal(l.lockedFor('1.1.1.1', t0), 0);
  assert.equal(l.fail('1.1.1.1', t0).locked, true);
  assert.equal(l.lockedFor('1.1.1.1', t0 + 1000), 15 * 60 * 1000 - 1000);
  assert.equal(l.lockedFor('2.2.2.2', t0 + 1000), 0);
  assert.equal(l.lockedFor('1.1.1.1', t0 + 15 * 60 * 1000), 0);
  l.fail('3.3.3.3', t0);
  l.success('3.3.3.3');
  assert.equal(l.fail('3.3.3.3', t0).fails, 1);
});

test('sessions: valid for 30 days since last seen', () => {
  const now = 10 * SESSION_MS;
  assert.ok(sessionValid({ created: now - 5, lastSeen: now - 5 }, now));
  assert.ok(sessionValid({ created: 0, lastSeen: now - SESSION_MS + 1 }, now));
  assert.ok(!sessionValid({ created: 0, lastSeen: now - SESSION_MS }, now));
  assert.ok(!sessionValid(null, now));
});

test('Auth: PIN hash/verify, session lifecycle, expiry and PIN reset', async () => {
  const dir = tmp();
  const a = new Auth(dir);
  const pin = await a.ensurePin();
  assert.match(pin, /^\d{6}$/);
  assert.equal(await a.ensurePin(), null);
  const cfg = fs.readFileSync(path.join(dir, 'config.json'), 'utf8');
  assert.ok(!cfg.includes(pin) || pin.length < 6 || !cfg.includes(`"${pin}"`), 'plain PIN must not be stored');
  assert.ok(await a.verify(pin));
  assert.ok(!(await a.verify(pin === '000000' ? '000001' : '000000')));
  assert.ok(!(await a.verify('12345')));
  const t = a.createSession({ ua: 'iPhone Safari', label: 'iPhone · Safari', ip: '192.168.1.5' }, 1000);
  assert.ok(a.find(t, 2000));
  assert.equal(a.devices().length, 1);
  assert.ok(!JSON.stringify(a.devices()).includes(t));
  assert.equal(a.find(t, 1000 + SESSION_MS + 5000), null, 'expired');
  assert.equal(a.devices().length, 0, 'expired session is dropped');
  const t2 = a.createSession({}, Date.now());
  const id = a.devices()[0].id;
  assert.ok(a.revoke(id));
  assert.equal(a.find(t2), null);
  a.createSession({}, Date.now());
  const pin2 = await a.resetPin();
  assert.match(pin2, /^\d{6}$/);
  assert.equal(a.devices().length, 0, 'PIN reset signs everyone out');
  assert.ok(await new Auth(dir).verify(pin2), 'persisted');
  assert.match(newPin(), /^\d{6}$/);
});

test('clientIp honours the test override header only when DOCLOOM_TEST=1', () => {
  const req = { headers: { 'x-test-remote-addr': '192.168.1.50' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(clientIp(req, { DOCLOOM_TEST: '1' }), '192.168.1.50');
  assert.equal(clientIp(req, {}), '127.0.0.1');
  assert.equal(clientIp(req, { DOCLOOM_TEST: '0' }), '127.0.0.1');
});

test('confine: realpath root confinement (traversal, symlink escape, ignored dirs, new files)', () => {
  const base = tmp();
  const root = path.join(base, 'root');
  const outside = path.join(base, 'outside');
  fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.mkdirSync(path.join(root, '.hidden'), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(root, 'sub', 'a.md'), 'x');
  fs.writeFileSync(path.join(root, 'node_modules', 'b.md'), 'x');
  fs.writeFileSync(path.join(root, '.hidden', 'c.md'), 'x');
  fs.writeFileSync(path.join(outside, 'secret.md'), 'x');
  fs.symlinkSync(outside, path.join(root, 'link'));
  fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'sub', 'evil.md'));
  const roots = [root];
  assert.ok(confine(path.join(root, 'sub', 'a.md'), roots).ok);
  assert.equal(confine(path.join(root, 'sub', '..', '..', 'outside', 'secret.md'), roots).reason, 'outside-roots');
  assert.equal(confine(path.join(root, 'link', 'secret.md'), roots).reason, 'outside-roots', 'symlinked dir escape');
  assert.equal(confine(path.join(root, 'sub', 'evil.md'), roots).reason, 'outside-roots', 'symlinked file escape');
  assert.equal(confine(path.join(root, 'node_modules', 'b.md'), roots).reason, 'ignored-dir');
  assert.equal(confine(path.join(root, '.hidden', 'c.md'), roots).reason, 'ignored-dir');
  assert.equal(confine(path.join(root, 'sub', 'missing.md'), roots).reason, 'not-found');
  assert.ok(confine(path.join(root, 'sub', 'new.md'), roots, { mustExist: false }).ok, 'new file in an allowed folder');
  assert.equal(confine(path.join(root, 'link', 'new.md'), roots, { mustExist: false }).reason, 'outside-roots', 'new file through symlinked dir');
  assert.equal(confine('relative/a.md', roots).reason, 'not-absolute');
  assert.equal(confine(path.join(root, 'a\0.md'), roots).reason, 'bad-path');
  assert.equal(confine(root + '-sibling', roots).ok, false, 'prefix sibling is not inside');
  assert.ok(extAllowed('a.MD') && extAllowed('b.html') && !extAllowed('c.png') && extAllowed('c.png', true) && !extAllowed('x.sh', true));
});

test('onLocalSubnet: directly connected public-looking LAN is local; other public IPs are not', async () => {
  const { onLocalSubnet } = await import('../../server/lib/net.js');
  const ifaces = { en0: [{ family: 'IPv4', address: '123.123.1.56', netmask: '255.255.255.0', internal: false }], lo0: [{ family: 'IPv4', address: '127.0.0.1', netmask: '255.0.0.0', internal: true }] };
  assert.ok(onLocalSubnet('123.123.1.20', ifaces));
  assert.ok(onLocalSubnet('::ffff:123.123.1.200', ifaces));
  assert.ok(!onLocalSubnet('123.123.2.20', ifaces));
  assert.ok(!onLocalSubnet('8.8.8.8', ifaces));
  assert.ok(!onLocalSubnet('fe80::1', ifaces));
  // a /8 interface is too broad to trust
  assert.ok(!onLocalSubnet('11.2.3.4', { en1: [{ family: 'IPv4', address: '11.0.0.5', netmask: '255.0.0.0', internal: false }] }));
});

test('PIN lockout: many failures from many addresses lock every login', () => {
  const l = new LoginLimiter({ globalMax: 20 });
  const t0 = 5_000_000;
  // 19 failures, each from a fresh address: no single IP reaches its own limit
  for (let i = 0; i < 19; i++) assert.equal(l.fail(`10.0.0.${i}`, t0 + i).locked, false);
  assert.equal(l.lockedFor('10.9.9.9', t0 + 30), 0, 'a new address may still try');
  assert.equal(l.fail('10.0.0.19', t0 + 40).locked, true, 'the 20th failure locks everyone');
  assert.ok(l.lockedFor('10.9.9.9', t0 + 50) > 0, 'an address that never failed is locked too');
  assert.equal(l.lockedFor('10.9.9.9', t0 + 40 + 15 * 60 * 1000), 0, 'and released after the lock time');
  // failures spread wider than the window never add up
  const slow = new LoginLimiter({ globalMax: 3 });
  for (let i = 0; i < 6; i++) assert.equal(slow.fail(`10.1.0.${i}`, i * 16 * 60 * 1000).locked, false);
  // a correct PIN from one address does not lift the global lock
  l.success('10.0.0.1');
  assert.ok(l.lockedFor('10.0.0.1', t0 + 60) > 0);
});

test('agent instruction files are write-protected by name, any case', () => {
  for (const n of ['CLAUDE.md', 'claude.md', 'AGENTS.md', 'Agents.MD', 'GEMINI.md', 'MEMORY.md', 'SKILL.md', 'CLAUDE.local.md']) assert.ok(isProtectedName('/x/y/' + n), n);
  for (const n of ['README.md', 'claude-notes.md', 'my-AGENTS.md', 'CLAUDE.md.txt']) assert.ok(!isProtectedName('/x/' + n), n);
});

test('network access: env wins, then the saved choice; an upgraded install keeps a signed-in phone', () => {
  const cfg = (o) => ({ get: (k) => o[k] });
  assert.equal(lanEnabled(cfg({}), {}), false, 'a fresh install is closed');
  assert.equal(lanEnabled(cfg({ sessions: [{ id: 'a' }] }), {}), true, 'an install with a signed-in device stays open');
  assert.equal(lanEnabled(cfg({ lan: false, sessions: [{ id: 'a' }] }), {}), false, 'the saved choice beats the guess');
  assert.equal(lanEnabled(cfg({ lan: true }), {}), true);
  assert.equal(lanEnabled(cfg({ lan: true }), { DOCLOOM_LAN: '0' }), false);
  assert.equal(lanEnabled(cfg({ lan: false }), { DOCLOOM_LAN: '1' }), true);
  assert.equal(listenHost(false), '127.0.0.1');
  assert.equal(listenHost(true), '0.0.0.0');
});
