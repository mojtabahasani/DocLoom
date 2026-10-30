import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { slugify, uniqueSlug, buildToc, tocHTML, readingMinutes } from '../src/js/content/toc.js';
import { assignHeadingIds } from '../src/js/content/toc-dom.js';

test('slugify keeps Persian letters and digits, hyphenates the rest', () => {
  assert.equal(slugify('مقدمه'), 'مقدمه');
  assert.equal(slugify('  فصل ۱: شروع کار! '), 'فصل-۱-شروع-کار');
  assert.equal(slugify('می‌روم به خانه'), 'می-روم-به-خانه'); // ZWNJ -> hyphen
  assert.equal(slugify('علي و كتاب'), 'علی-و-کتاب'); // Arabic letters normalised
  assert.equal(slugify('Hello, World 2'), 'hello-world-2');
  assert.equal(slugify('!!!'), 'section');
  assert.equal(slugify(''), 'section');
  assert.ok(slugify('الف '.repeat(60)).length <= 60);
});
test('slugs are stable and unique', () => {
  const used = new Set();
  assert.deepEqual(['مقدمه', 'مقدمه', 'مقدمه', 'نتیجه'].map((t) => uniqueSlug(slugify(t), used)), ['مقدمه', 'مقدمه-2', 'مقدمه-3', 'نتیجه']);
  assert.equal(slugify('مقدمه'), slugify('مقدمه'));
});
test('buildToc: h1-h3 tree, deeper levels ignored, skipped levels nest under the closest parent', () => {
  const tree = buildToc([
    { level: 1, text: 'الف', id: 'a' }, { level: 2, text: 'ب', id: 'b' }, { level: 3, text: 'ج', id: 'c' },
    { level: 4, text: 'د', id: 'd' }, { level: 2, text: 'ه', id: 'e' }, { level: 1, text: 'و', id: 'f' }, { level: 3, text: 'ز', id: 'g' },
  ]);
  assert.equal(tree.length, 2);
  assert.deepEqual(tree[0].children.map((c) => c.id), ['b', 'e']);
  assert.deepEqual(tree[0].children[0].children.map((c) => c.id), ['c']);
  assert.deepEqual(tree[1].children.map((c) => c.id), ['g']);
  assert.deepEqual(buildToc([]), []);
});
test('tocHTML: in-page links, escaped', () => {
  const html = tocHTML(buildToc([{ level: 1, text: 'a<b>', id: 's-x' }]));
  assert.ok(html.startsWith('<nav class="toc">') && html.includes('href="#s-x"') && html.includes('a&lt;b&gt;'));
});
test('assignHeadingIds: prefix, unique, kept when valid, furniture and TOC skipped', () => {
  const { document } = parseHTML('<!doctype html><html><body><div id="r"></div></body></html>');
  const r = document.getElementById('r');
  r.innerHTML = '<header data-md2-furniture="title"><h1>عنوان سند</h1></header><h1>مقدمه</h1><h2>مقدمه</h2><h2 id="s-keep">چیز دیگر</h2><h4>نه</h4><nav class="toc"><h2>x</h2></nav>';
  const hs = assignHeadingIds(r);
  assert.deepEqual(hs.map((h) => h.id), ['s-مقدمه', 's-مقدمه-2', 's-keep']);
  assert.deepEqual(assignHeadingIds(r).map((h) => h.id), ['s-مقدمه', 's-مقدمه-2', 's-keep']); // idempotent
});
test('readingMinutes: Persian ~200 words per minute, at least one', () => {
  assert.deepEqual(readingMinutes(''), { words: 0, minutes: 1 });
  assert.equal(readingMinutes('کلمه '.repeat(200)).minutes, 1);
  assert.equal(readingMinutes('کلمه '.repeat(201)).minutes, 2);
  assert.equal(readingMinutes('کلمه '.repeat(1000)).minutes, 5);
});
