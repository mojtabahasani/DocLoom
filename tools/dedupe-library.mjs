#!/usr/bin/env node
// Shrink an existing library on disk. Two jobs, both reversible, neither destroys a document:
//
//   1. «تصاویر برند»  A document used to copy its brand's letterhead, footer, signature and stamp
//      into itself — about 5 MB of base64 per document AND per version, while the brand itself is
//      stored once and the document already names its brandId. Those copies are dropped and listed
//      in `layout.brandImages`; the app fills them back in from the brand when the document opens
//      (src/js/library/doc-model.js).
//
//   2. «تعارض‌ها»      A sync bug (a missing base map was read as "edited on both sides") split
//      documents into «(تعارض)» copies, duplicates of duplicates included. Copies whose content is
//      byte-identical to a surviving sibling are ARCHIVED — `archivedAt`, the same thing the «حذف»
//      button does — so they leave the library list and stay recoverable. A copy whose content
//      actually differs is never touched: it is reported for a human to look at.
//
// Safe to run while the server is up: it keeps each record's `ts`, re-reads the envelope right
// before writing and skips anything that changed under it, and writes through a temp file + rename.
//
//   node tools/dedupe-library.mjs                      # report only (default)
//   node tools/dedupe-library.mjs --apply              # drop the image copies
//   node tools/dedupe-library.mjs --apply --conflicts  # ... and archive identical «تعارض» copies
//   node tools/dedupe-library.mjs --dir <path>         # another data directory (tests)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { dedupeBrandImages } from '../src/js/library/doc-model.js';
import { sameDocContent, CONFLICT_SUFFIX } from '../src/js/server/sync-core.js';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const APPLY = has('--apply');
const CONFLICTS = has('--conflicts');
const DIR = (() => {
  const i = argv.indexOf('--dir');
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  // Same rule as server/lib/env.js: an explicit setting wins, then the new name, then the
  // library that is actually on disk under the old one.
  const explicit = process.env.DATASAVE_DATA || process.env.MD2HTML_DATA;
  if (explicit) return explicit;
  const now = path.join(os.homedir(), 'Documents', 'DataSave');
  const legacy = path.join(os.homedir(), 'Documents', 'MD2Html');
  return !fs.existsSync(now) && fs.existsSync(legacy) ? legacy : now;
})();

const LIB = path.join(DIR, 'library');
const MB = (n) => (n / 1048576).toFixed(1) + ' MB';
const fa = (n) => n.toLocaleString('fa-IR');

const readEnvelope = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * Write only if the envelope on disk is still the one we transformed.
 * Returns the bytes saved (which is negative when the record grows, as archiving one does),
 * or null when the record changed under us and was left alone.
 */
function writeIfUnchanged(file, envelope, next) {
  const now = readEnvelope(file);
  if (!now || now.ts !== envelope.ts) return null; // someone saved it meanwhile: leave it alone
  const before = fs.statSync(file).size;
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next));
  fs.renameSync(tmp, file);
  return before - fs.statSync(file).size;
}

const listFiles = (store) => {
  const dir = path.join(LIB, store);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f));
};

// ---- brands, by id (archived ones included: a document may still reference one) ----
const brandsById = new Map();
for (const f of listFiles('brands')) {
  const e = readEnvelope(f);
  if (e?.data?.id) brandsById.set(e.data.id, e.data);
}

console.log(`دادهٔ کتابخانه: ${LIB}`);
console.log(`برندها: ${fa(brandsById.size)}${APPLY ? '' : '   —   گزارش‌گیری (برای اجرا --apply)'}\n`);

// ---- job 1: the image copies ----
let saved = 0;
let touched = 0;
let skipped = 0;
const report = [];
for (const store of ['documents', 'versions']) {
  let storeSaved = 0;
  let storeTouched = 0;
  for (const file of listFiles(store)) {
    const env = readEnvelope(file);
    const doc = env?.data;
    if (!doc || env.deleted) continue;
    // A version record carries the document's own brandId; both shapes work unchanged.
    const brand = brandsById.get(doc.brandId);
    if (!brand) continue;
    const slim = dedupeBrandImages(doc, brand);
    if (slim === doc) continue;
    const couldSave = JSON.stringify(doc).length - JSON.stringify(slim).length;
    storeTouched++;
    if (!APPLY) {
      storeSaved += couldSave;
      continue;
    }
    const got = writeIfUnchanged(file, env, { ...env, data: slim });
    if (got === null) skipped++;
    else storeSaved += got;
  }
  report.push(`  ${store}: ${fa(storeTouched)} رکورد، ${MB(storeSaved)}`);
  saved += storeSaved;
  touched += storeTouched;
}
console.log(APPLY ? '۱) تصاویر برند — حذف شد:' : '۱) تصاویر برند — قابل حذف:');
report.forEach((l) => console.log(l));
if (skipped) console.log(`  ${fa(skipped)} رکورد در همین لحظه تغییر کرده بود و دست‌نخورده ماند.`);
console.log(`  جمع: ${MB(saved)} روی ${fa(touched)} رکورد\n`);

// ---- job 2: the «(تعارض)» copies ----
const docs = [];
for (const file of listFiles('documents')) {
  const env = readEnvelope(file);
  if (env?.data && !env.deleted && !env.data.archivedAt) docs.push({ file, env, doc: env.data });
}

const isConflict = (d) => (d.title || '').includes(CONFLICT_SUFFIX.trim());
const groups = new Map(); // a cheap bucket key, then an exact comparison inside the bucket
for (const row of docs) {
  const k = [row.doc.title?.replace(/ \(تعارض\)/g, ''), (row.doc.html || '').length, (row.doc.source || '').length].join('|');
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(row);
}

let archived = 0;
let freed = 0;
const differing = [];
for (const rows of groups.values()) {
  if (rows.length < 2) continue;
  // The survivor: a copy that was never renamed, else the oldest.
  const survivor = rows.find((r) => !isConflict(r.doc)) || rows.slice().sort((a, b) => (a.doc.createdAt || 0) - (b.doc.createdAt || 0))[0];
  for (const row of rows) {
    if (row === survivor || !isConflict(row.doc)) continue;
    const brand = brandsById.get(row.doc.brandId) || brandsById.get(survivor.doc.brandId) || null;
    if (!sameDocContent(row.doc, survivor.doc, brand)) {
      differing.push(`${row.doc.title} (${path.basename(row.file)})`);
      continue;
    }
    const size = fs.statSync(row.file).size;
    if (CONFLICTS && APPLY) {
      // Archiving adds a field, so the file grows: `null` is the only "left alone" answer here.
      if (writeIfUnchanged(row.file, row.env, { ...row.env, data: { ...row.doc, archivedAt: Date.now() } }) === null) continue;
    }
    archived++;
    freed += size;
  }
}

console.log(CONFLICTS && APPLY ? '۲) نسخه‌های «تعارض» — بایگانی شد:' : '۲) نسخه‌های «تعارض» — قابل بایگانی:');
console.log(`  ${fa(archived)} نسخهٔ تکراریِ مو‌به‌مو یکسان، ${MB(freed)} که از فهرست کتابخانه بیرون می‌رود`);
console.log('  (بایگانی = همان کاری که دکمهٔ «حذف» می‌کند: رکورد می‌ماند و برگشت‌پذیر است)');
if (differing.length) {
  console.log(`\n  ⚠️  ${fa(differing.length)} نسخهٔ «تعارض» محتوایش با خواهرش یکسان نیست و دست‌نخورده ماند:`);
  differing.slice(0, 15).forEach((t) => console.log('     • ' + t));
  if (differing.length > 15) console.log(`     … و ${fa(differing.length - 15)} مورد دیگر`);
}
if (!CONFLICTS) console.log('\n  برای بایگانی‌شان --conflicts را هم بده.');
