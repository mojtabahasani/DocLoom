import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, LAN } from './_s3.mjs';

let S;
before(async () => { S = await startServer(); });
after(() => S.stop());

test('/render: a LAN client without a token is rejected, even with a valid session', async () => {
  assert.equal((await S.call('GET', '/render?path=/x', { headers: LAN })).status, 403);
  assert.equal((await S.call('GET', '/render?path=/x&t=nope', { headers: LAN })).status, 403);
  assert.equal((await S.call('GET', '/render?staged=abc&t=nope', { headers: LAN })).status, 403);
});

test('/render: loopback gets the app; staged HTML needs the job token', async () => {
  const r = await S.call('GET', '/render?path=/x');
  assert.equal(r.status, 200);
  assert.match(r.text, /<html/i);
  assert.equal((await S.call('GET', '/render?staged=abc')).status, 403, 'loopback without a token cannot read staged pages');
  const token = 'tok123';
  S.srv.render.tokens.set(token, Date.now() + 60000);
  const id = S.srv.render.stage('<p>سلام</p>');
  const ok = await S.call('GET', `/render?staged=${id}&t=${token}`, { headers: LAN });
  assert.equal(ok.status, 200);
  assert.equal(ok.text, '<p>سلام</p>');
  assert.equal((await S.call('GET', `/render?staged=nope&t=${token}`)).status, 404);
  assert.equal((await S.call('GET', `/render?path=/x&t=${token}`, { headers: LAN })).status, 200, 'a LAN client holding the token is fine');
});

test('/api/pdf: needs auth, a document, and reports a missing Chrome as 503', async () => {
  assert.equal((await S.call('POST', '/api/pdf', { headers: LAN, body: { html: '<p>x</p>' } })).status, 401);
  assert.equal((await S.call('POST', '/api/pdf', { body: {} })).status, 400);
  S.srv.render.renderer = async () => ({ pdf: Buffer.from('%PDF-1.4 mock') });
  const ok = await S.call('POST', '/api/pdf', { body: { html: '<p>x</p>' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['content-type'], 'application/pdf');
  assert.ok(ok.buf.toString().startsWith('%PDF'));
  assert.equal((await S.call('GET', '/api/pdf/status')).json.available, true);
  const saved = S.srv.render.chrome;
  S.srv.render.chrome = null;
  const no = await S.call('POST', '/api/pdf', { body: { html: '<p>x</p>' } });
  assert.equal(no.status, 503);
  assert.equal(no.json.error, 'chrome-unavailable');
  assert.equal((await S.call('GET', '/api/pdf/status')).json.available, false);
  S.srv.render.chrome = saved;
});
