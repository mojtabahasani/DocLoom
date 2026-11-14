// The archive rule (docs/superpowers/specs/2026-11-14-md2html-archive-design.md): no button destroys data.
// Every call that can destroy stored content is listed here with the reason it is allowed. A new one fails this
// test until it is either routed through archive/retire or added below with its reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTROYS = /\b(?:db|defaultDb|api|backend)\.(?:del|delMany|clear|clearAll)\(|\b(?:rmSync|unlinkSync|rmdirSync)\(|\bfs(?:\.promises)?\.(?:rm|unlink|rmdir)\(/g;

const ALLOWED = {
  // browser library
  'src/js/library/db.js': 4, // the wrapper itself: del→delMany, delMany→backend, clear→backend, clearAll→clear
  'src/js/library/library.js': 4, // auto versions freed on quota (the server keeps them) · a blank, never-filled document: leaveCurrent, and discardRecord (its versions + itself)
  'src/js/library/versions.js': 3, // the 30-version cap and the quota path (the server retires what the browser drops) · versions.remove
  'src/js/library/backup-ui.js': 1, // «جایگزینی» on backup import, behind its own confirmation
  'src/js/server/sync.js': 1, // mirrors a tombstone whose content the server has already retired
  // server
  'server/lib/store.js': 1, // the readable .md/.html copy, regenerated from the JSON on every put
  'server/lib/backup.js': 1, // rotation of whole-library backups (newest 30 kept)
  'server/lib/files.js': 1, // rotation of per-file backups — moves into the archive in step B
  'server/lib/shares.js': 5, // a share is a published copy of a document, not the document
  'server/lib/pdf.js': 1, // Chrome's temporary profile
  'server/lib/log.js': 1, // log rotation
};

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (/\.m?js$/.test(e.name)) yield full;
  }
}

test('no new code path destroys stored data', () => {
  const found = {};
  for (const base of ['src/js', 'server/lib']) {
    for (const file of walk(path.join(ROOT, base))) {
      const n = (fs.readFileSync(file, 'utf8').match(DESTROYS) || []).length;
      if (n) found[path.relative(ROOT, file)] = n;
    }
  }
  assert.deepEqual(found, ALLOWED);
});
