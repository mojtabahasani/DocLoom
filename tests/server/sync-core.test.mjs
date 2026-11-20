import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, conflictCopy, sameDocContent, localTs, isSynced, keyOf, splitKey, CONFLICT_SUFFIX } from '../../src/js/server/sync-core.js';

const L = (ts, deleted) => ({ ts, deleted });
const d = (o) => decide({ store: 'documents', ...o });

test('decide: presence on one side only', () => {
  assert.equal(d({ local: null, remote: null }).act, 'noop');
  assert.equal(d({ local: L(5), remote: null }).act, 'push');
  assert.equal(d({ local: L(5, true), remote: null }).act, 'noop');
  assert.equal(d({ local: null, remote: L(5) }).act, 'pull');
  assert.equal(d({ local: null, remote: L(5, true) }).act, 'noop');
});

test('decide: only one side changed since the last sync', () => {
  assert.equal(d({ local: L(5), remote: L(5), base: 5 }).act, 'noop');
  assert.equal(d({ local: L(9), remote: L(5), base: 5 }).act, 'push');
  assert.equal(d({ local: L(5), remote: L(9), base: 5 }).act, 'pull');
  assert.equal(d({ local: L(7, true), remote: L(5), base: 5 }).act, 'push-delete');
  assert.equal(d({ local: L(5), remote: L(9, true), base: 5 }).act, 'pull-delete');
  assert.equal(d({ local: L(7, true), remote: L(9, true), base: 5 }).act, 'noop');
});

test('decide: both changed → keep both, newer keeps the id', () => {
  assert.deepEqual(d({ local: L(9), remote: L(8), base: 5 }), { act: 'conflict', winner: 'local' });
  assert.deepEqual(d({ local: L(8), remote: L(9), base: 5 }), { act: 'conflict', winner: 'remote' });
});

test('decide: a missing base asks for a content comparison, never a blind conflict', () => {
  // This is the bug that made 60 «(تعارض)» copies out of 80 documents: with no base the old code
  // called both sides changed and split every document in two.
  assert.deepEqual(d({ local: L(8), remote: L(9) }), { act: 'compare', winner: 'remote' });
  assert.deepEqual(d({ local: L(9), remote: L(8) }), { act: 'compare', winner: 'local' });
  // A real conflict — a base exists and both sides moved past it — still keeps both copies.
  assert.equal(d({ local: L(9), remote: L(8), base: 5 }).act, 'conflict');
});

test('decide: edit beats delete when both changed', () => {
  assert.equal(d({ local: L(9), remote: L(8, true), base: 5 }).act, 'push');
  assert.equal(d({ local: L(8, true), remote: L(9), base: 5 }).act, 'pull');
});

test('decide: identical timestamps are a no-op even without a base', () => {
  assert.equal(d({ local: L(5), remote: L(5) }).act, 'noop');
});

test('decide: brands and settings → newer wins, no copy; versions → delete wins', () => {
  assert.equal(decide({ store: 'brands', local: L(9), remote: L(8), base: 5 }).act, 'push');
  assert.equal(decide({ store: 'settings', local: L(8), remote: L(9), base: 5 }).act, 'pull');
  assert.equal(decide({ store: 'settings', local: L(0), remote: L(9) }).act, 'pull', 'unknown local time (0) loses');
  assert.equal(decide({ store: 'versions', local: L(9, true), remote: L(2), base: 1 }).act, 'push-delete');
  assert.equal(decide({ store: 'versions', local: L(2), remote: L(9, true), base: 1 }).act, 'pull-delete');
});

test('conflictCopy renames and detaches the losing side', () => {
  const c = conflictCopy({ id: 'a', title: 'گزارش', pinned: true, updatedAt: 1, createdAt: 1, html: '<p>x</p>' }, 'b', 100);
  assert.equal(c.id, 'b');
  assert.equal(c.title, 'گزارش' + CONFLICT_SUFFIX);
  assert.equal(c.title, 'گزارش (تعارض)');
  assert.equal(c.pinned, false);
  assert.equal(c.updatedAt, 100);
  assert.equal(c.html, '<p>x</p>');
  assert.equal(conflictCopy({ id: 'a', title: '' }, 'b').title, 'بدون عنوان (تعارض)');
});

test('sameDocContent: content decides, ids and times do not', () => {
  const doc = { id: 'a', title: 'گزارش', subtitle: '', source: '# a', html: '<p>a</p>', text: 'a', mode: 'doc', brandId: 'b1', link: null, watermark: { preset: 'none', text: '' }, letter: null, layout: { theme: 'navy', font: 16 } };
  assert.equal(sameDocContent(doc, { ...doc }), true);
  assert.equal(sameDocContent(doc, { ...doc, id: 'zzz', updatedAt: 999, createdAt: 1, tags: ['x'], pinned: true }), true, 'metadata is not content');
  assert.equal(sameDocContent(doc, { ...doc, layout: { font: 16, theme: 'navy' } }), true, 'key order is not content');
  assert.equal(sameDocContent(doc, { ...doc, html: '<p>b</p>' }), false);
  assert.equal(sameDocContent(doc, { ...doc, title: 'گزارش ۲' }), false);
  assert.equal(sameDocContent(doc, { ...doc, layout: { theme: 'green', font: 16 } }), false);
  assert.equal(sameDocContent(doc, { ...doc, letter: undefined }), true, 'absent and null are the same absence');
  assert.equal(sameDocContent(doc, null), false);
});

test('sameDocContent: one side referencing a brand image is not a different document', () => {
  // The state while the «no image copies» migration is half propagated: slim on the server, still
  // fat in a browser that has not saved since. Calling that a conflict is what we are preventing.
  const img = 'data:image/png;base64,' + 'A'.repeat(200);
  const brand = { id: 'b1', mastheadImage: img, footerImage: '', signatureImage: '', stampImage: '' };
  const base = { title: 'نامه', source: 'x', html: '<p>x</p>', text: 'x', mode: 'doc', brandId: 'b1' };
  const fat = { ...base, layout: { theme: 'navy', mastheadImage: img } };
  const slim = { ...base, layout: { theme: 'navy', brandImages: ['mastheadImage'] } };
  assert.equal(sameDocContent(fat, slim, brand), true);
  assert.equal(sameDocContent(slim, fat, brand), true);
  // A genuinely different image is still a different document.
  const other = { ...base, layout: { theme: 'navy', mastheadImage: 'data:image/png;base64,ZZ' } };
  assert.equal(sameDocContent(other, slim, brand), false);
});

test('timestamps and key helpers', () => {
  assert.equal(localTs('documents', { updatedAt: 7 }), 7);
  assert.equal(localTs('versions', { savedAt: 3 }), 3);
  assert.equal(localTs('settings', { key: 'autosave' }, { 'settings/autosave': 11 }), 11);
  assert.equal(localTs('brands', { id: 'b1' }, {}), 0);
  assert.ok(isSynced('documents', 'x') && isSynced('settings', 'autosave') && !isSynced('settings', 'lastDocId') && !isSynced('settings', 'appTheme'));
  assert.deepEqual(splitKey(keyOf('documents', 'd1')), ['documents', 'd1']);
});
