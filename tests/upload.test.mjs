import test from 'node:test';
import assert from 'node:assert/strict';
import { ZI2_ENDPOINT, migrateEndpoint, fieldFor, imageUrlFrom } from '../src/js/editor/upload-profile.js';
import { uploadTarget, relayUpload } from '../server/lib/upload-proxy.js';

test('retired zi2 endpoint migrates; others are kept', () => {
  assert.equal(migrateEndpoint('https://zi2.ir/api/upload/upload.php'), ZI2_ENDPOINT);
  assert.equal(migrateEndpoint(' https://www.zi2.ir/api/upload/upload.php '), ZI2_ENDPOINT);
  assert.equal(migrateEndpoint('https://example.ir/up.php'), 'https://example.ir/up.php');
});

test('multipart field: image for /api/v1/upload.php, configured otherwise', () => {
  assert.equal(fieldFor(ZI2_ENDPOINT, 'file'), 'image');
  assert.equal(fieldFor('https://example.ir/up.php', 'file'), 'file');
  assert.equal(fieldFor('not a url', ''), 'file');
});

test('image URL from the v1 reply and from the legacy reply', () => {
  assert.equal(imageUrlFrom({ success: true, file: { id: 'a1', path: 'uploads/2026/x.png' } }, ZI2_ENDPOINT), 'https://zi2.ir/uploads/2026/x.png');
  assert.equal(imageUrlFrom({ success: true, file: { path: '/uploads/y.jpg' } }, ZI2_ENDPOINT), 'https://zi2.ir/uploads/y.jpg');
  assert.equal(imageUrlFrom({ data: { upload: { fileUrl: 'https://zi2.ir/api/upload/upload.php/storage/uploads/a/b.jpg' } } }, ZI2_ENDPOINT), 'https://zi2.ir/storage/uploads/a/b.jpg');
  assert.equal(imageUrlFrom({ success: true }, ZI2_ENDPOINT), '');
});

test('relay target: https + allowlisted host only', () => {
  assert.equal(uploadTarget(ZI2_ENDPOINT).hostname, 'zi2.ir');
  for (const bad of ['http://zi2.ir/api/v1/upload.php', 'https://evil.example/x', 'https://u:p@zi2.ir/x', 'https://zi2.ir.evil.example/x', '', 'javascript:alert(1)'])
    assert.throws(() => uploadTarget(bad), (e) => e.status === 400, bad);
});

test('relay forwards the multipart body unchanged and returns the upstream reply', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ success: true, file: { path: 'u/z.png' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const body = Buffer.from('--b\r\nContent-Disposition: form-data; name="image"; filename="z.png"\r\n\r\nPNG\r\n--b--\r\n');
  const out = await relayUpload(uploadTarget(ZI2_ENDPOINT), 'multipart/form-data; boundary=b', body, { fetchImpl });
  assert.equal(seen.url, ZI2_ENDPOINT);
  assert.equal(seen.init.redirect, 'error');
  assert.deepEqual(Buffer.from(seen.init.body), body);
  assert.equal(out.status, 200);
  assert.equal(JSON.parse(out.body).file.path, 'u/z.png');
  await assert.rejects(relayUpload(uploadTarget(ZI2_ENDPOINT), 'application/json', body, { fetchImpl }), (e) => e.status === 400);
  await assert.rejects(relayUpload(uploadTarget(ZI2_ENDPOINT), 'multipart/form-data; boundary=b', body, { fetchImpl: async () => { throw new TypeError('down'); } }), (e) => e.status === 502);
});
