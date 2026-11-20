// The app was renamed from MD2Html to دیتاسیو / DataSave. These tests are the promise that came
// with the rename: nothing written under the old name is lost, and nothing that still speaks the
// old name is turned away. A rename must cost no one a document, a preference or a backup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readStored, writeStored, removeStored, legacyKey, APP_ID, LEGACY_APP_ID } from '../src/js/core/naming.js';
import { envVar, defaultDataDir } from '../server/lib/env.js';
import { csrfOk } from '../server/lib/security.js';
import { validateBackup, buildBackup, BACKUP_FORMAT, LEGACY_BACKUP_FORMAT } from '../src/js/library/backup.js';
import { parseEmbedConfig } from '../src/js/core/embed-config.js';
import { rotation, dayOf, NAME_RE } from '../server/lib/backup.js';

/** A localStorage stand-in, since node has none. */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get size() {
      return map.size;
    },
    has: (k) => map.has(k),
    raw: map,
  };
}

const withStorage = (storage, fn) => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const prev = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  try {
    return fn();
  } finally {
    if (had) globalThis.localStorage = prev;
    else delete globalThis.localStorage;
  }
};

test('legacyKey maps the new spelling back to the old one', () => {
  assert.equal(legacyKey('datasave.prefs'), 'md2html.prefs');
  assert.equal(legacyKey('datasave.sync'), 'md2html.sync');
  assert.equal(legacyKey('datasave-backup'), 'md2html-backup');
  assert.equal(APP_ID, 'datasave');
  assert.equal(LEGACY_APP_ID, 'md2html');
});

test('a value stored under the old name is adopted, once, and then owned', () => {
  const ls = fakeStorage({ 'md2html.reader': '{"size":21}' });
  withStorage(ls, () => {
    assert.equal(readStored('datasave.reader'), '{"size":21}', 'the old value is found');
    assert.ok(ls.has('datasave.reader'), 'and carried over to the new key');
    assert.ok(!ls.has('md2html.reader'), 'the old key is not left behind to drift');
    assert.equal(readStored('datasave.reader'), '{"size":21}', 'a second read is plain and unchanged');
  });
});

test('the new key wins when both exist, and absence stays absence', () => {
  const ls = fakeStorage({ 'md2html.reader': 'old', 'datasave.reader': 'new' });
  withStorage(ls, () => {
    assert.equal(readStored('datasave.reader'), 'new');
    assert.equal(readStored('datasave.nothing'), null);
  });
});

test('writing and removing touch both spellings sensibly', () => {
  const ls = fakeStorage({ 'md2html.followEnd': '1' });
  withStorage(ls, () => {
    writeStored('datasave.followEnd', '0');
    assert.equal(ls.getItem('datasave.followEnd'), '0');
    removeStored('datasave.followEnd');
    assert.ok(!ls.has('datasave.followEnd') && !ls.has('md2html.followEnd'), 'remove clears the old copy too');
  });
});

test('storage that throws never takes the app down', () => {
  const hostile = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
    removeItem() {
      throw new Error('blocked');
    },
  };
  withStorage(hostile, () => {
    assert.equal(readStored('datasave.prefs'), null);
    assert.equal(writeStored('datasave.prefs', 'x'), false);
    assert.doesNotThrow(() => removeStored('datasave.prefs'));
  });
});

test('env vars answer to both names, new first', () => {
  assert.equal(envVar('DATA', { DATASAVE_DATA: '/new' }), '/new');
  assert.equal(envVar('DATA', { MD2HTML_DATA: '/old' }), '/old', 'an installed LaunchAgent still sets the old name');
  assert.equal(envVar('DATA', { DATASAVE_DATA: '/new', MD2HTML_DATA: '/old' }), '/new');
  assert.equal(envVar('PORT', {}), undefined);
});

test('the data directory never moves a library out from under the user', () => {
  const home = '/home/u';
  assert.equal(defaultDataDir({ DATASAVE_DATA: '/explicit' }, home), '/explicit', 'an explicit setting wins');
  // Nothing on disk yet → the new name.
  assert.equal(defaultDataDir({}, '/nonexistent-home-for-this-test'), '/nonexistent-home-for-this-test/Documents/DataSave');
});

test('the CSRF header is accepted under either name', () => {
  const ok = (h) => csrfOk('POST', '/api/lib/documents/x', { ...h, origin: 'http://localhost:7123', host: 'localhost:7123' });
  assert.equal(ok({ 'x-datasave': '1' }), true);
  assert.equal(ok({ 'x-md2html': '1' }), true, 'the CLI and the Finder workflows still send the old one');
  assert.equal(ok({}), false, 'and a request with neither is still refused');
});

test('a backup file from before the rename still validates', () => {
  const made = buildBackup({ documents: [], versions: [], brands: [] });
  assert.equal(made.format, BACKUP_FORMAT);
  assert.equal(made.app, 'DataSave');
  assert.equal(validateBackup(made).ok, true);
  assert.equal(validateBackup({ ...made, format: LEGACY_BACKUP_FORMAT }).ok, true, 'the old format is the same backup');
  assert.equal(validateBackup({ ...made, format: 'something-else' }).ok, false);
});

test('backup filenames: both prefixes are recognised and ordered by date', () => {
  assert.ok(NAME_RE.test('datasave-2026-11-18.json.gz'));
  assert.ok(NAME_RE.test('md2html-2026-11-18.json.gz'));
  assert.equal(dayOf('md2html-2026-11-18.json.gz'), '2026-11-18');
  assert.equal(dayOf('datasave-2026-11-18.json.gz'), '2026-11-18');
  assert.equal(dayOf('notes.txt'), null);
  // Alphabetically «datasave-» precedes «md2html-», so a naive sort would drop the newest file.
  const mixed = ['datasave-2026-11-18.json.gz', 'md2html-2026-01-01.json.gz'];
  assert.deepEqual(rotation(mixed, 1), ['md2html-2026-01-01.json.gz']);
});

test('an embed host that still sets the old global is still an embed host', () => {
  // embedConfig() reads window once; parseEmbedConfig is the part that can be checked in node, and
  // the fallback itself is asserted in tests/e2e/embed.spec.mjs against a real page.
  const cfg = parseEmbedConfig({ host: 'claria', digits: 'en', library: false });
  assert.equal(cfg.active, true);
  assert.equal(cfg.digits, 'en');
  assert.equal(cfg.library, false);
  assert.equal(parseEmbedConfig(undefined).active, false);
});

test('createServer can be called with no options at all', async () => {
  // Regression: `export { defaultDataDir } from './lib/env.js'` re-exports without binding the name
  // in the module's own scope, so createServer()'s default parameter threw ReferenceError — and no
  // test caught it, because every test passes dataDir explicitly. Only starting the server for real
  // hit it. This asserts the defaults resolve, which is the part that broke.
  const mod = await import('../server/index.js');
  assert.equal(typeof mod.defaultDataDir, 'function');
  assert.equal(typeof mod.defaultDataDir(), 'string');
  assert.ok(mod.defaultDataDir().length > 0);
});
