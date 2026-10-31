import test from 'node:test';
import assert from 'node:assert/strict';
import { crumbs, besideTarget, cleanFileName, diskAction, bytesToBase64, kindOfPath, joinPath, dirName } from '../../src/js/server/files-core.js';

test('crumbs: root to leaf', () => {
  assert.deepEqual(crumbs('/Users/m/MyApp/a/ب', '/Users/m/MyApp').map((c) => c.name), ['MyApp', 'a', 'ب']);
  assert.equal(crumbs('/Users/m/MyApp', '/Users/m/MyApp').length, 1);
  assert.deepEqual(crumbs('/elsewhere', '/Users/m/MyApp'), []);
});

test('besideTarget: linked name + export suffix + export extension, never the source itself', () => {
  const link = '/r/گزارش.md';
  assert.equal(besideTarget({ linkPath: link, name: 'عنوان-سند.html', titleBase: 'عنوان-سند' }), '/r/گزارش.html');
  assert.equal(besideTarget({ linkPath: link, name: 'عنوان-سند-تعاملی.html', titleBase: 'عنوان-سند' }), '/r/گزارش-تعاملی.html');
  assert.equal(besideTarget({ linkPath: '/r/page.html', name: 'x.html', titleBase: 'x' }), '/r/page-خروجی.html');
  assert.equal(besideTarget({ linkPath: link, name: 'other.png', titleBase: 'x' }), '/r/گزارش-other.png');
});

test('cleanFileName and path helpers', () => {
  assert.equal(cleanFileName('a/b:c', '.md'), 'a-b-c.md');
  assert.equal(cleanFileName('..hidden.md'), 'hidden.md');
  assert.equal(cleanFileName('   '), '');
  assert.equal(cleanFileName('x.html'), 'x.html');
  assert.equal(joinPath('/a/', 'b'), '/a/b');
  assert.equal(dirName('/a/b.md'), '/a');
  assert.equal(kindOfPath('/a/b.HTM'), 'html');
  assert.equal(kindOfPath('/a/b.md'), 'text');
  assert.equal(bytesToBase64(new Uint8Array([1, 2, 3, 250])), Buffer.from([1, 2, 3, 250]).toString('base64'));
});

test('diskAction: reload when clean, conflict bar when edited, ignore own saves', () => {
  const link = { etag: 'A', dirty: false };
  assert.equal(diskAction({ link, event: { exists: true, etag: 'A' } }), 'same');
  assert.equal(diskAction({ link, event: { exists: true, etag: 'B' } }), 'reload');
  assert.equal(diskAction({ link: { ...link, dirty: true }, event: { exists: true, etag: 'B' } }), 'conflict');
  assert.equal(diskAction({ link, event: { exists: false } }), 'missing');
  assert.equal(diskAction({ link, event: { exists: true, etag: 'B' }, saving: true }), 'ignore');
  assert.equal(diskAction({ link: null, event: { exists: true, etag: 'B' } }), 'ignore');
});
