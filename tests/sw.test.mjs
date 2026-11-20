// pwa/sw.js is copied verbatim into dist/pwa (only __VERSION__ is substituted), so it is tested
// as a script: run it in a vm with a fake `self` and ask the fetch handler what it intercepts.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const ORIGIN = 'http://localhost:7123';

async function loadSW() {
  const src = (await readFile(new URL('../pwa/sw.js', import.meta.url), 'utf8')).replaceAll('__VERSION__', 'testver');
  const handlers = {};
  const cache = { addAll: async () => {}, put: async () => {} };
  const self = {
    addEventListener: (type, fn) => (handlers[type] = fn),
    location: { origin: ORIGIN },
    skipWaiting: () => {},
    clients: { claim: () => {} },
  };
  const ctx = {
    self,
    caches: { open: async () => cache, match: async () => undefined, keys: async () => [], delete: async () => true },
    fetch: async () => ({ ok: true, clone: () => ({}) }),
    Response: { error: () => 'network-error' },
    URL,
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return handlers;
}

/** Did the worker take over this request (i.e. may it serve or store a cached copy)? */
function intercepts(handlers, url, { method = 'GET', mode = 'navigate' } = {}) {
  let taken = false;
  handlers.fetch({ request: { url, method, mode }, respondWith: () => (taken = true) });
  return taken;
}

test('the worker caches the app shell', async () => {
  const h = await loadSW();
  for (const p of ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png']) {
    assert.ok(intercepts(h, ORIGIN + p), p + ' should be cached');
  }
});

test('revocable server pages are never cached', async () => {
  const h = await loadSW();
  // A cached /s/<id> would keep serving a share after it is revoked or expires; Cache-Control: no-store
  // does not stop caches.put(), so the worker has to skip these paths itself.
  for (const p of ['/s/abc123', '/s/abc123?x=1', '/render', '/render?doc=7']) {
    assert.ok(!intercepts(h, ORIGIN + p), p + ' must not be cached');
  }
});

test('the API, other origins and non-GET requests are left alone', async () => {
  const h = await loadSW();
  for (const p of ['/api/health', '/api/watch?path=/x', '/api/files/read']) assert.ok(!intercepts(h, ORIGIN + p), p);
  assert.ok(!intercepts(h, 'https://zi2.ir/api/v1/upload.php'), 'cross-origin upload');
  assert.ok(!intercepts(h, ORIGIN + '/index.html', { method: 'POST' }), 'POST');
});

test('the cache name carries the build version so a rebuild drops the old shell', async () => {
  const src = await readFile(new URL('../pwa/sw.js', import.meta.url), 'utf8');
  assert.match(src, /const VERSION = '__VERSION__'/, 'build.mjs substitutes this placeholder');
  assert.match(src, /docloom-' \+ VERSION/);
});
