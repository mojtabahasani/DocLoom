import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { findChrome, CHROME_MAC, RenderQueue, RenderError, chromeRender, RenderService } from '../../server/lib/pdf.js';

test('findChrome: default path, env override, graceful null', () => {
  assert.equal(findChrome({ env: {}, exists: (p) => p === CHROME_MAC }), CHROME_MAC);
  assert.equal(findChrome({ env: {}, exists: () => false }), null);
  assert.equal(findChrome({ env: { MD2HTML_CHROME: '/opt/c' }, exists: (p) => p === '/opt/c' }), '/opt/c');
  assert.equal(findChrome({ env: { MD2HTML_CHROME: '/nope' }, exists: (p) => p === CHROME_MAC }), null, 'a bad override is not silently replaced');
});

test('RenderQueue: one job at a time, in order', async () => {
  let running = 0;
  let max = 0;
  const order = [];
  const q = new RenderQueue({ run: async (j) => { running++; max = Math.max(max, running); await new Promise((r) => setTimeout(r, 15)); order.push(j); running--; return j; } });
  assert.deepEqual(await Promise.all([1, 2, 3, 4].map((j) => q.add(j))), [1, 2, 3, 4]);
  assert.equal(max, 1);
  assert.deepEqual(order, [1, 2, 3, 4]);
});

test('RenderQueue: timeout aborts the job and the next one still runs', async () => {
  let aborted = false;
  const q = new RenderQueue({ timeoutMs: 40, run: (j, signal) => (j === 'hang' ? new Promise((_, rej) => signal.addEventListener('abort', () => { aborted = true; rej(new Error('x')); })) : Promise.resolve(j)) });
  const a = q.add('hang');
  const b = q.add('ok');
  await assert.rejects(a, (e) => e.code === 'render-timeout');
  assert.equal(await b, 'ok');
  assert.ok(aborted, 'abort signal fired');
});

test('RenderQueue: cancel a queued job and the running one', async () => {
  const q = new RenderQueue({ run: (j, signal) => new Promise((res, rej) => { signal.addEventListener('abort', () => rej(new Error('aborted'))); if (j === 'fast') res('fast'); }) });
  const run = q.add('slow');
  const queued = q.add('fast');
  const cancelled = queued.cancel();
  await assert.rejects(queued, (e) => e.code === 'cancelled');
  void cancelled;
  run.cancel();
  await assert.rejects(run, (e) => e.code === 'cancelled');
  assert.equal(q.length, 0);
});

// A fake Chrome speaking the pipe protocol: answers every command; "ready" after `readyAfter` polls.
function fakeSpawn({ readyAfter = 1, error = '' } = {}) {
  const calls = [];
  const spawn = (cmd, args) => {
    const toChrome = new PassThrough();
    const fromChrome = new PassThrough();
    const child = new EventEmitter();
    child.stdio = [null, null, null, toChrome, fromChrome];
    child.kill = () => { child.killed = true; setImmediate(() => child.emit('exit')); };
    child.profile = args.find((a) => a.startsWith('--user-data-dir=')).split('=')[1];
    spawn.last = child;
    let polls = 0;
    let buf = '';
    toChrome.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\0')) >= 0) {
        const m = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        calls.push(m.method);
        let result = {};
        if (m.method === 'Target.createTarget') result = { targetId: 't1' };
        if (m.method === 'Target.attachToTarget') result = { sessionId: 's1' };
        if (m.method === 'Runtime.evaluate') {
          const ex = m.params.expression;
          if (ex.includes('document.fonts')) result = { result: { value: 'ok' } };
          else if (ex.includes('__md2htmlReady')) result = { result: { value: error ? 'E:' + error : ++polls >= readyAfter ? 'ok' : '' } };
          else result = { result: { value: '<html>x</html>' } };
        }
        if (m.method === 'Page.printToPDF') result = { data: Buffer.from('%PDF-fake').toString('base64'), _params: m.params };
        fromChrome.write(JSON.stringify({ id: m.id, result }) + '\0');
      }
    });
    return child;
  };
  spawn.calls = calls;
  return spawn;
}

test('chromeRender drives the protocol, honours page numbers, and removes the profile folder', async () => {
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'md2h-cdp-'));
  const spawn = fakeSpawn({ readyAfter: 3 });
  const out = await chromeRender({ chrome: '/fake', url: 'http://x/render', want: { pdf: true, html: true }, pageNumbers: true, spawn, tmpBase: tmp });
  assert.equal(out.pdf.toString(), '%PDF-fake');
  assert.equal(out.html, '<html>x</html>');
  assert.ok(spawn.calls.includes('Page.navigate') && spawn.calls.includes('Page.printToPDF'));
  assert.ok(spawn.last.killed);
  assert.deepEqual(fs.readdirSync(tmp), [], 'temp profile removed');
  fs.rmSync(tmp, { recursive: true });
});

test('chromeRender: page error, missing Chrome, ready timeout', async () => {
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'md2h-cdp-'));
  await assert.rejects(chromeRender({ chrome: '/fake', url: 'u', spawn: fakeSpawn({ error: 'boom' }), tmpBase: tmp }), (e) => e.code === 'render-failed' && e.message === 'boom');
  await assert.rejects(chromeRender({ chrome: null, url: 'u' }), (e) => e.code === 'chrome-unavailable');
  await assert.rejects(chromeRender({ chrome: '/fake', url: 'u', spawn: fakeSpawn({ readyAfter: 1e9 }), tmpBase: tmp, readyTimeoutMs: 300 }), (e) => e.code === 'render-timeout');
  assert.deepEqual(fs.readdirSync(tmp), []);
  fs.rmSync(tmp, { recursive: true });
});

test('RenderService: tokens live only during the job; no Chrome means a clean error', async () => {
  const seen = {};
  const svc = new RenderService({ chrome: '/fake', getBase: () => 'http://127.0.0.1:1', renderer: async ({ url }) => {
    const u = new URL(url);
    seen.token = u.searchParams.get('t');
    seen.valid = svc.validToken(seen.token);
    seen.staged = svc.stagedHtml(u.searchParams.get('staged'));
    return { pdf: Buffer.from('%PDF') };
  } });
  await svc.render({ html: '<p>hi</p>' });
  assert.equal(seen.valid, true);
  assert.equal(seen.staged, '<p>hi</p>');
  assert.equal(svc.validToken(seen.token), false, 'token revoked after the job');
  svc.close();
  const none = new RenderService({ chrome: null, getBase: () => '' });
  assert.equal(none.available(), false);
  await assert.rejects(none.render({ path: '/x' }), (e) => e instanceof RenderError && e.code === 'chrome-unavailable');
  none.close();
});
