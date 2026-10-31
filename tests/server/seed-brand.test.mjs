import test from 'node:test';
import assert from 'node:assert/strict';
import { seedBrand, planSeedMigration, SEED_ID, SEED_NAME, normalizeBrand } from '../../src/js/brand/brand-model.js';
import { ID_RE } from '../../server/lib/store.js';

const oldSeed = (id, extra = {}) => normalizeBrand({ ...seedBrand(), id, ...extra });

test('seed brand has a deterministic id the server accepts, so seeding is idempotent', () => {
  assert.equal(seedBrand().id, SEED_ID);
  assert.equal(seedBrand().id, seedBrand().id);
  assert.ok(ID_RE.test(SEED_ID));
  assert.deepEqual(seedBrand(), seedBrand());
});

test('migration: nothing to do for a clean list', () => {
  assert.equal(planSeedMigration([]), null);
  assert.equal(planSeedMigration([seedBrand()]), null);
  assert.equal(planSeedMigration([normalizeBrand({ id: 'bX', name: 'برند دیگر' })]), null);
});

test('migration: old random-id seed copies fold into the canonical one (counter kept at the max)', () => {
  const list = [oldSeed('b1abc', { letterCounter: 4 }), oldSeed('b2def', { letterCounter: 9 })];
  const plan = planSeedMigration(list);
  assert.deepEqual(plan.drop.sort(), ['b1abc', 'b2def']);
  assert.equal(plan.save.id, SEED_ID);
  assert.equal(plan.save.letterCounter, 9);
});

test('migration: existing canonical brand is kept and only gains a higher counter', () => {
  const plan = planSeedMigration([seedBrand(), oldSeed('b1abc')]);
  assert.deepEqual(plan.drop, ['b1abc']);
  assert.equal(plan.save, null);
  const bumped = planSeedMigration([seedBrand(), oldSeed('b1abc', { letterCounter: 5 })]);
  assert.equal(bumped.save.letterCounter, 5);
});

test('migration: a customised copy of the seed is never removed', () => {
  const custom = oldSeed('b9zzz', { signer: { name: 'مجتبی', role: 'مدیر' } });
  assert.equal(planSeedMigration([custom]), null);
  const renamed = oldSeed('b8yyy', { name: SEED_NAME + ' ۲' });
  assert.equal(planSeedMigration([renamed]), null);
  const footer = oldSeed('b7xxx', { footerText: 'متن دیگر' });
  assert.equal(planSeedMigration([footer, oldSeed('b1abc')]).drop.join(), 'b1abc');
});
