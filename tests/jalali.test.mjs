import test from 'node:test';
import assert from 'node:assert/strict';
import { toJalali, toGregorian, isLeapJalali, jalaliMonthLength, formatJalali, parseJalali, todayJalali, isValidJalali } from '../src/js/brand/jalali.js';

const J = (y, m, d) => ({ y, m, d });

test('known pairs, including leap-year Esfand 30', () => {
  assert.deepEqual(toGregorian(1403, 12, 30), J(2025, 3, 20));
  assert.deepEqual(toJalali(2025, 3, 20), J(1403, 12, 30));
  assert.deepEqual(toGregorian(1405, 8, 8), J(2026, 10, 30));
  assert.deepEqual(toJalali(2026, 10, 30), J(1405, 8, 8));
  assert.deepEqual(toJalali(1983, 6, 1), J(1362, 3, 11)); // 11 Khordad 1362
  assert.deepEqual(toGregorian(1400, 1, 1), J(2021, 3, 21));
  assert.deepEqual(toJalali(2000, 1, 1), J(1378, 10, 11));
});

test('Nowruz boundaries', () => {
  assert.deepEqual(toJalali(2025, 3, 21), J(1404, 1, 1)); // day after leap 1403 ends
  assert.deepEqual(toJalali(2024, 3, 19), J(1402, 12, 29));
  assert.deepEqual(toJalali(2024, 3, 20), J(1403, 1, 1));
  assert.deepEqual(toJalali(2026, 3, 20), J(1404, 12, 29));
  assert.deepEqual(toJalali(2026, 3, 21), J(1405, 1, 1));
});

test('leap years and month lengths', () => {
  assert.equal(isLeapJalali(1403), true);
  assert.equal(isLeapJalali(1399), true);
  assert.equal(isLeapJalali(1404), false);
  assert.equal(jalaliMonthLength(1403, 12), 30);
  assert.equal(jalaliMonthLength(1404, 12), 29);
  assert.equal(jalaliMonthLength(1404, 6), 31);
  assert.equal(jalaliMonthLength(1404, 7), 30);
  assert.equal(isValidJalali(J(1404, 12, 30)), false);
  assert.equal(isValidJalali(J(1403, 12, 30)), true);
  assert.equal(isValidJalali(J(1404, 13, 1)), false);
});

test('round trip over 1300..1500 (every day)', () => {
  const start = Date.UTC(1921, 2, 21);
  const end = Date.UTC(2122, 2, 21);
  let prev = null;
  for (let t = start; t < end; t += 86400000) {
    const g = new Date(t);
    const j = toJalali(g.getUTCFullYear(), g.getUTCMonth() + 1, g.getUTCDate());
    const back = toGregorian(j.y, j.m, j.d);
    assert.deepEqual(back, J(g.getUTCFullYear(), g.getUTCMonth() + 1, g.getUTCDate()));
    assert.ok(isValidJalali(j));
    if (prev) assert.ok(j.y * 10000 + j.m * 100 + j.d > prev, 'strictly increasing');
    prev = j.y * 10000 + j.m * 100 + j.d;
  }
});

test('formatJalali: Persian and Latin digits, custom separator', () => {
  assert.equal(formatJalali(J(1405, 8, 8)), '۱۴۰۵/۰۸/۰۸');
  assert.equal(formatJalali(J(1405, 8, 8), { digits: 'en' }), '1405/08/08');
  assert.equal(formatJalali(J(1403, 12, 30), { digits: 'en', sep: '-' }), '1403-12-30');
});

test('parseJalali accepts any digit script and separator, rejects bad dates', () => {
  assert.deepEqual(parseJalali('۱۴۰۵/۰۸/۰۸'), J(1405, 8, 8));
  assert.deepEqual(parseJalali('1405-8-8'), J(1405, 8, 8));
  assert.deepEqual(parseJalali('١٤٠٥.٨.٨'), J(1405, 8, 8));
  assert.equal(parseJalali('1404/12/30'), null);
  assert.equal(parseJalali('1405/13/01'), null);
  assert.equal(parseJalali('امروز'), null);
});

test('todayJalali uses the local calendar day', () => {
  assert.deepEqual(todayJalali(new Date(2026, 9, 30, 23, 59)), J(1405, 8, 8));
  assert.deepEqual(todayJalali(new Date(2026, 2, 21, 0, 1)), J(1405, 1, 1));
});
