// The phone opens the app over plain http://192.168.x.x (not a secure context): no code may depend on secure-only APIs without a fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..', 'src', 'js');
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') && files.push(path.join(d, e.name)));
})(root);
const read = (f) => fs.readFileSync(f, 'utf8');

test('no crypto.subtle / randomUUID anywhere in the client', () => {
  for (const f of files) assert.ok(!/crypto\.(subtle|randomUUID)|\bSubtleCrypto\b/.test(read(f)), f);
});

test('secure-context-only APIs are feature-detected or wrapped in try/catch', () => {
  const png = read(path.join(root, 'export/png.js'));
  assert.match(png, /typeof ClipboardItem === 'undefined'/);
  assert.match(read(path.join(root, 'export/files.js')), /typeof window\.showSaveFilePicker === 'function'/);
  assert.match(read(path.join(root, 'pwa/register.js')), /'serviceWorker' in navigator/);
  assert.match(read(path.join(root, 'editor/images.js')), /navigator\.clipboard\?\.read/);
  const copy = read(path.join(root, 'export/files.js'));
  assert.match(copy, /await navigator\.clipboard\.writeText[\s\S]*catch[\s\S]*execCommand\('copy'\)/);
});

test('the sync module never fetches unless served over http(s)', () => {
  const s = read(path.join(root, 'server/sync.js'));
  const init = s.slice(s.indexOf('export async function initSync'));
  assert.ok(init.indexOf("location.protocol !== 'http:'") < init.indexOf('fetch('), 'protocol guard comes before the first fetch');
  assert.ok(!/fetch\(|EventSource/.test(s.slice(0, s.indexOf('export async function initSync')).replace(/async function req[\s\S]*?\n}\n/, '')), 'only req() fetches before init');
});
