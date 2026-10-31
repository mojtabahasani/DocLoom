import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, conflictCopy, localTs, isSynced, keyOf, splitKey, CONFLICT_SUFFIX } from '../../src/js/server/sync-core.js';

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
  assert.deepEqual(d({ local: L(8), remote: L(9) }), { act: 'conflict', winner: 'remote' }, 'never synced before behaves the same');
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

test('timestamps and key helpers', () => {
  assert.equal(localTs('documents', { updatedAt: 7 }), 7);
  assert.equal(localTs('versions', { savedAt: 3 }), 3);
  assert.equal(localTs('settings', { key: 'autosave' }, { 'settings/autosave': 11 }), 11);
  assert.equal(localTs('brands', { id: 'b1' }, {}), 0);
  assert.ok(isSynced('documents', 'x') && isSynced('settings', 'autosave') && !isSynced('settings', 'lastDocId') && !isSynced('settings', 'appTheme'));
  assert.deepEqual(splitKey(keyOf('documents', 'd1')), ['documents', 'd1']);
});
