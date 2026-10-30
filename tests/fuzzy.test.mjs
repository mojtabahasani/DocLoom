import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, fuzzyScore, fuzzyFilter } from '../src/js/ui/fuzzy.js';

test('normalize: Arabic letters, ZWNJ, diacritics, digits, case', () => {
  assert.equal(normalize('كتابي'), 'کتابی');
  assert.equal(normalize('می‌خواهم'), 'میخواهم');
  assert.equal(normalize('مُحَمَّد'), 'محمد');
  assert.equal(normalize('ســلام'), 'سلام');
  assert.equal(normalize('۱۲۳ ٤٥٦'), '123 456');
  assert.equal(normalize('  Export   HTML '), 'export html');
  assert.equal(normalize(null), '');
});

test('fuzzyScore: substring, prefix bonus, subsequence, no match', () => {
  assert.ok(fuzzyScore('خروجی', 'خروجی HTML') > 0);
  assert.ok(fuzzyScore('خروجی', 'خروجی HTML') > fuzzyScore('خروجی', 'دریافت خروجی'));
  assert.ok(fuzzyScore('exp', 'Export HTML') > 0);
  assert.ok(fuzzyScore('exh', 'Export HTML') > 0); // subsequence
  assert.equal(fuzzyScore('zzz', 'Export HTML'), -1);
  assert.equal(fuzzyScore('', 'anything'), 0);
});

test('fuzzyScore: Persian variants and ZWNJ match across spellings', () => {
  assert.ok(fuzzyScore('كتاب', 'کتابخانه') > 0);
  assert.ok(fuzzyScore('میخواهم', 'می‌خواهم') > 0);
  assert.ok(fuzzyScore('می‌خواهم', 'میخواهم') > 0);
  assert.ok(fuzzyScore('۱۲', 'بند 12') > 0);
});

test('fuzzyFilter ranks by score, weights fields, requires all tokens', () => {
  const items = [
    { t: 'ذخیرهٔ تنظیمات JSON', k: 'settings export' },
    { t: 'خروجی HTML', k: 'export html' },
    { t: 'خروجی Markdown', k: 'md' },
  ];
  const f = (i) => [{ text: i.t }, { text: i.k, weight: 0.6 }];
  assert.deepEqual(fuzzyFilter(items, 'خروجی', f).map((i) => i.t), ['خروجی HTML', 'خروجی Markdown']);
  assert.deepEqual(fuzzyFilter(items, 'export html', f).map((i) => i.t)[0], 'خروجی HTML');
  assert.deepEqual(fuzzyFilter(items, 'خروجی md', f).map((i) => i.t), ['خروجی Markdown']);
  assert.equal(fuzzyFilter(items, '', f).length, 3);
});
