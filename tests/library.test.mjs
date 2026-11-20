import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createDb } from '../src/js/library/db.js';
import { pruneVersions, pickVersionsToFree, shouldAutoVersion, isDuplicateVersion, MAX_VERSIONS } from '../src/js/library/version-rules.js';
import { buildBackup, validateBackup, planMerge } from '../src/js/library/backup.js';
import { queryDocs, allTags } from '../src/js/library/query.js';
import { captureDoc, docToPatch, normalizeTags, displayTitle, isBlankDoc, dedupeBrandImages, LAYOUT_KEYS, BRAND_IMAGE_KEYS } from '../src/js/library/doc-model.js';
import { IMAGE_FIELDS } from '../src/js/brand/brand-model.js';
import { sanitizePrefs } from '../src/js/library/prefs-schema.js';
import { DEFAULTS } from '../src/js/core/store.js';

const doc = (o = {}) => ({ id: 'd1', title: 'سند', source: '# x', html: '<p>x</p>', createdAt: 1, updatedAt: 2, tags: [], ...o });
const ver = (id, savedAt, reason = 'auto', docId = 'd1') => ({ id, docId, savedAt, reason, title: 't', source: 's', html: 'h' });

test('pruneVersions: no-op under the cap', () => {
  assert.deepEqual(pruneVersions([ver('a', 1)], 30), []);
});

test('pruneVersions: drops oldest auto first, keeps manual', () => {
  const list = [ver('m1', 1, 'manual'), ver('a1', 2), ver('a2', 3), ver('a3', 4), ver('b1', 0, 'before-import')];
  assert.deepEqual(pruneVersions(list, 4), ['a1']);
  assert.deepEqual(pruneVersions(list, 2).sort(), ['a1', 'a2', 'a3']);
  // when autos run out, safety snapshots go before manual ones
  assert.deepEqual(pruneVersions(list, 1).sort(), ['a1', 'a2', 'a3', 'b1']);
});

test('pruneVersions: cap of 30 is the default', () => {
  const list = Array.from({ length: 35 }, (_, i) => ver('v' + i, i));
  const drop = pruneVersions(list);
  assert.equal(MAX_VERSIONS, 30);
  assert.equal(drop.length, 5);
  assert.deepEqual(drop, ['v0', 'v1', 'v2', 'v3', 'v4']);
});

test('pickVersionsToFree only touches automatic versions, oldest first', () => {
  const all = [ver('a', 5), ver('b', 1), ver('m', 0, 'manual'), ver('c', 3, 'auto', 'd2')];
  assert.deepEqual(pickVersionsToFree(all, 2), ['b', 'c']);
});

test('shouldAutoVersion: needs changes and 5 minutes', () => {
  assert.equal(shouldAutoVersion({ lastAt: 0, now: 299999, changed: true }), false);
  assert.equal(shouldAutoVersion({ lastAt: 0, now: 300000, changed: true }), true);
  assert.equal(shouldAutoVersion({ lastAt: 0, now: 999999, changed: false }), false);
  assert.equal(shouldAutoVersion({ lastAt: null, now: 999999, changed: true }), false);
});

test('isDuplicateVersion', () => {
  assert.equal(isDuplicateVersion(null, { source: 'a', html: 'b', title: 'c' }), false);
  assert.equal(isDuplicateVersion({ source: 'a', html: 'b', title: 'c' }, { source: 'a', html: 'b', title: 'c' }), true);
  assert.equal(isDuplicateVersion({ source: 'a', html: 'b', title: 'c' }, { source: 'a', html: 'B', title: 'c' }), false);
});

test('backup round trip validates and counts', () => {
  const b = buildBackup({ documents: [doc()], versions: [ver('v1', 1, 'manual')], brands: [{ id: 'b1', name: 'برند' }], settings: { appTheme: 'dark', evil: 1 } });
  const r = validateBackup(JSON.parse(JSON.stringify(b)));
  assert.equal(r.ok, true);
  assert.deepEqual(r.counts, { documents: 1, versions: 1, brands: 1 });
  assert.deepEqual(r.data.settings, { appTheme: 'dark' });
});

test('backup validation rejects bad input', () => {
  const good = buildBackup({ documents: [doc()] });
  for (const bad of [null, [], { format: 'x' }, { ...good, version: 9 }, { ...good, documents: 'no' }, { ...good, documents: [{ id: 5 }] },
    { ...good, documents: [doc({ createdAt: 'x' })] }, { ...good, versions: [ver('v', 1, 'weird')] }]) {
    assert.equal(validateBackup(bad).ok, false);
  }
});

test('backup drops orphan versions and duplicate ids', () => {
  const b = buildBackup({ documents: [doc(), doc()], versions: [ver('v1', 1, 'auto', 'd1'), ver('v2', 1, 'auto', 'gone')] });
  const r = validateBackup(b);
  assert.equal(r.counts.documents, 1);
  assert.equal(r.counts.versions, 1);
});

test('planMerge keeps the newer document and unions the rest', () => {
  const existing = { documents: [doc({ id: 'a', updatedAt: 10 }), doc({ id: 'b', updatedAt: 5 })], versions: [ver('v1', 1)], brands: [] };
  const incoming = { documents: [doc({ id: 'a', updatedAt: 3 }), doc({ id: 'b', updatedAt: 9 }), doc({ id: 'c' })], versions: [ver('v1', 1), ver('v2', 2)], brands: [{ id: 'x', name: 'x' }] };
  const m = planMerge(existing, incoming);
  assert.deepEqual(m.documents.map((d) => d.id), ['b', 'c']);
  assert.deepEqual(m.versions.map((v) => v.id), ['v2']);
  assert.equal(m.brands.length, 1);
});

test('prefs sanitising drops unknown keys and invalid values', () => {
  assert.deepEqual(sanitizePrefs({ appTheme: 'neon', autosave: false, foo: 1, uploadEndpoint: 'http://x' }), { autosave: false });
});

test('captureDoc / docToPatch restore layout, mode and furniture', () => {
  const state = { ...DEFAULTS, title: 'T', subtitle: 'S', source: '# a', webLayout: true, theme: 'green', font: 17, mastheadImage: 'data:image/png;base64,AA' };
  const d = captureDoc({ id: 'x', state, html: '<p>a</p>', text: 'a', meta: { tags: ['k'], pinned: true, createdAt: 5 }, now: 9 });
  assert.equal(d.mode, 'web');
  assert.equal(d.createdAt, 5);
  assert.equal(d.updatedAt, 9);
  assert.deepEqual(Object.keys(d.layout), LAYOUT_KEYS, 'no brand → every layout key is carried');
  const p = docToPatch(d);
  assert.equal(p.webLayout, true);
  assert.equal(p.theme, 'green');
  assert.equal(p.mastheadImage, 'data:image/png;base64,AA');
  assert.equal(p.subtitle, 'S');
});

test('the brand image list matches the brand record', () => {
  // Two modules name these fields; if they drift, documents would inherit a field no brand has.
  assert.deepEqual([...BRAND_IMAGE_KEYS].sort(), [...IMAGE_FIELDS].sort());
  for (const k of BRAND_IMAGE_KEYS) assert.ok(LAYOUT_KEYS.includes(k), k + ' must be a layout key');
});

test('captureDoc references the brand images instead of copying them', () => {
  const big = 'data:image/png;base64,' + 'A'.repeat(5000);
  const brand = { id: 'b1', mastheadImage: big, footerImage: 'data:image/png;base64,FF', signatureImage: '', stampImage: 'data:image/png;base64,SS' };
  const state = {
    ...DEFAULTS, title: 'نامه', brandId: 'b1',
    mastheadImage: big, // same as the brand → referenced
    footerImage: 'data:image/png;base64,OWN', // overridden → kept
    stampImage: brand.stampImage, // same as the brand → referenced
  };
  const d = captureDoc({ id: 'x', state, html: '<p>a</p>', text: 'a', brand });

  assert.equal(d.layout.mastheadImage, undefined, 'the shared letterhead is not copied');
  assert.equal(d.layout.stampImage, undefined, 'the shared stamp is not copied');
  assert.equal(d.layout.footerImage, 'data:image/png;base64,OWN', 'an overridden image stays with the document');
  assert.deepEqual(d.layout.brandImages, ['mastheadImage', 'stampImage']);
  assert.ok(JSON.stringify(d).length < 2000, 'the record no longer carries the 5 KB image: ' + JSON.stringify(d).length);

  // ... and opening it puts the real images back.
  const p = docToPatch(d, brand);
  assert.equal(p.mastheadImage, big);
  assert.equal(p.stampImage, brand.stampImage);
  assert.equal(p.footerImage, 'data:image/png;base64,OWN');
});

test('a document keeps its own images when there is no brand to share them with', () => {
  const state = { ...DEFAULTS, brandId: 'b1', mastheadImage: 'data:image/png;base64,AA' };
  const noBrand = captureDoc({ id: 'x', state, html: '', text: '' });
  assert.equal(noBrand.layout.mastheadImage, 'data:image/png;base64,AA');
  assert.equal(noBrand.layout.brandImages, undefined);
  // A brand that is not this document's brand changes nothing either.
  const other = captureDoc({ id: 'x', state, html: '', text: '', brand: { id: 'b2', mastheadImage: 'data:image/png;base64,AA' } });
  assert.equal(other.layout.mastheadImage, 'data:image/png;base64,AA');
});

test('docToPatch: an inherited image survives a missing brand, and never overrules an explicit one', () => {
  const doc = { id: 'x', brandId: 'b1', mode: 'doc', layout: { theme: 'navy', brandImages: ['mastheadImage'] } };
  assert.equal(docToPatch(doc, null).mastheadImage, '', 'no brand: empty, not undefined');
  assert.equal(docToPatch(doc, { id: 'b1', mastheadImage: 'data:image/png;base64,BB' }).mastheadImage, 'data:image/png;base64,BB');
  // restoreVersion merges layouts: a version that carries its own image must win over the brand.
  const merged = { ...doc, layout: { ...doc.layout, mastheadImage: 'data:image/png;base64,OLD' } };
  assert.equal(docToPatch(merged, { id: 'b1', mastheadImage: 'data:image/png;base64,BB' }).mastheadImage, 'data:image/png;base64,OLD');
});

test('dedupeBrandImages shrinks a document saved before images were referenced', () => {
  const big = 'data:image/png;base64,' + 'A'.repeat(4000);
  const brand = { id: 'b1', mastheadImage: big, footerImage: '', signatureImage: '', stampImage: '' };
  const old = { id: 'd1', brandId: 'b1', layout: { theme: 'navy', mastheadImage: big, footerImage: 'data:image/png;base64,OWN' } };
  const out = dedupeBrandImages(old, brand);
  assert.equal(out.layout.mastheadImage, undefined);
  assert.deepEqual(out.layout.brandImages, ['mastheadImage']);
  assert.equal(out.layout.footerImage, 'data:image/png;base64,OWN', 'an image the brand does not have is left alone');
  assert.equal(out.layout.theme, 'navy');
  assert.equal(docToPatch(out, brand).mastheadImage, big, 'and it still opens with the letterhead');

  assert.equal(dedupeBrandImages(old, { id: 'b2', mastheadImage: big }), old, 'another brand: untouched (same object)');
  assert.equal(dedupeBrandImages(old, null), old);
  assert.equal(dedupeBrandImages(out, brand), out, 'running twice changes nothing');
});

test('normalizeTags / displayTitle / isBlankDoc', () => {
  assert.deepEqual(normalizeTags('الف، ب, الف ;  '), ['الف', 'ب']);
  assert.equal(displayTitle({ title: '', text: '# سلام دنیا\nمتن' }), 'سلام دنیا');
  assert.equal(displayTitle({ title: '', text: '' }), 'بدون عنوان');
  assert.equal(isBlankDoc({ text: ' ', title: '', html: '' }), true);
  assert.equal(isBlankDoc({ text: '', title: '', html: '<img src=x>' }), false);
});

test('queryDocs: Persian-normalised search in title and text, tags, sort, pinned first', () => {
  const docs = [
    doc({ id: '1', title: 'گزارش فروش', text: 'كتاب و دفتر', updatedAt: 5, createdAt: 3, tags: ['کار'] }),
    doc({ id: '2', title: 'نامه', text: 'می‌خواهم', updatedAt: 9, createdAt: 1, pinned: true }),
    doc({ id: '3', title: 'آرشیو', text: '', updatedAt: 7, createdAt: 2, tags: ['کار', 'شخصی'] }),
  ];
  assert.deepEqual(queryDocs(docs, { query: 'کتاب' }).map((d) => d.id), ['1']); // ك in text, ک in query
  assert.deepEqual(queryDocs(docs, { query: 'میخواهم' }).map((d) => d.id), ['2']); // ZWNJ ignored
  assert.deepEqual(queryDocs(docs, { sort: 'recent' }).map((d) => d.id), ['2', '3', '1']);
  assert.deepEqual(queryDocs(docs, { sort: 'created' }).map((d) => d.id), ['2', '1', '3']);
  assert.deepEqual(queryDocs(docs, { tag: 'کار', sort: 'title' }).map((d) => d.id), ['3', '1']);
  assert.deepEqual(allTags(docs), ['کار', 'شخصی']);
});

test('db (fake-indexeddb): CRUD, version index, clear', async () => {
  const db = createDb(new IDBFactory(), 't1');
  assert.equal(await db.open(), true);
  await db.put('documents', doc());
  assert.equal((await db.get('documents', 'd1')).title, 'سند');
  await db.putMany('versions', [ver('v1', 1), ver('v2', 2, 'manual'), ver('v3', 3, 'auto', 'other')]);
  assert.deepEqual((await db.versionsOf('d1')).map((v) => v.id).sort(), ['v1', 'v2']);
  await db.delMany('versions', ['v1']);
  assert.equal((await db.all('versions')).length, 2);
  await db.put('settings', { key: 'autosave', value: false });
  assert.equal((await db.get('settings', 'autosave')).value, false);
  await db.clearAll();
  assert.equal((await db.all('documents')).length, 0);
});

test('db falls back to memory with the same API when IndexedDB is missing', async () => {
  const db = createDb(null);
  assert.equal(await db.open(), false);
  assert.equal(db.persistent, false);
  await db.put('documents', doc());
  assert.equal((await db.all('documents')).length, 1);
  await db.putMany('versions', [ver('v1', 1)]);
  assert.equal((await db.versionsOf('d1')).length, 1);
});

test('saveVersion: dedupes identical content, enforces the cap with oldest auto dropped first', async () => {
  const { saveVersion } = await import('../src/js/library/versions.js');
  const db = createDb(new IDBFactory(), 't2');
  const base = { docId: 'd1', title: 'T', source: 's', html: 'h' };
  const first = await saveVersion(base, 'manual', { db, now: 1, cap: 3 });
  assert.ok(first.version);
  assert.deepEqual(await saveVersion(base, 'auto', { db, now: 2, cap: 3 }), { skipped: 'same' });
  for (let i = 0; i < 4; i++) await saveVersion({ ...base, source: 's' + i }, 'auto', { db, now: 10 + i, cap: 3 });
  const left = await db.versionsOf('d1');
  assert.equal(left.length, 3);
  assert.ok(left.some((v) => v.reason === 'manual'), 'manual version survives');
  assert.deepEqual(left.filter((v) => v.reason === 'auto').map((v) => v.savedAt).sort(), [12, 13]);
});
