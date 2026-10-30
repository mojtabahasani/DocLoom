import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/js/core/store.js';
import { createHistory } from '../src/js/core/history.js';
import { analyze } from '../src/js/content/analytics.js';
import { headerHTML, footerHTML } from '../src/js/content/furniture.js';
import { beautifyHTML, highlightHTML } from '../src/js/content/html-source.js';
import { htmlToMarkdown } from '../src/js/export/markdown.js';
import { toFaDigits, faPercent } from '../src/js/content/persian.js';
import { parseHTML } from 'linkedom';

test('store: get/set/on/emit, no event for identical values', () => {
  const s = createStore({ a: 1 });
  const seen = [];
  s.on('a', (v, p) => seen.push([v, p]));
  s.on('*', (k) => seen.push(k));
  s.on('evt', (x) => seen.push('evt' + x));
  s.set('a', 1);
  s.set('a', 2);
  s.emit('evt', 7);
  assert.deepEqual(seen, [[2, 1], 'a', 'evt7']);
  s.patch({ a: 3, b: 4 });
  assert.equal(s.get('b'), 4);
  const off = s.on('a', () => seen.push('x'));
  off();
  s.set('a', 9);
  assert.ok(!seen.includes('x'));
});

test('history: record, undo, redo, limit, reset', () => {
  let doc = 'a';
  const states = [];
  const h = createHistory({ read: () => doc, write: (v) => (doc = v), limit: 3, onChange: (s) => states.push(s) });
  assert.equal(h.record(), false);
  doc = 'b'; assert.equal(h.record(), true);
  doc = 'c'; h.record();
  assert.equal(h.undo(), true);
  assert.equal(doc, 'b');
  assert.equal(h.canRedo, true);
  assert.equal(h.redo(), true);
  assert.equal(doc, 'c');
  doc = 'd'; h.record(); doc = 'e'; h.record(); doc = 'f'; h.record();
  let n = 0;
  while (h.undo()) n++;
  assert.equal(n, 3); // limit
  h.reset();
  assert.equal(h.canUndo, false);
  assert.equal(h.undo(), false);
  assert.ok(states.length > 0);
});

test('history: new edit clears redo stack', () => {
  let doc = '1';
  const h = createHistory({ read: () => doc, write: (v) => (doc = v) });
  doc = '2'; h.record(); h.undo();
  doc = '3'; h.record();
  assert.equal(h.canRedo, false);
});

test('analytics counts Persian text', () => {
  const m = Object.fromEntries(analyze({ text: 'سلام دنیا\nhello', htmlBytes: 2048, links: 2, images: 1, tables: 1, headings: 3 }));
  assert.equal(m['سطر'], '۲');
  assert.equal(m['واژه'], '۳');
  assert.equal(m['حجم تقریبی'], '۲٫۰'.replace('٫', '.') + ' کیلوبایت');
  assert.equal(m['جدول / تیتر'], '۱ / ۳');
});

test('persian digits', () => {
  assert.equal(toFaDigits('1405/08'), '۱۴۰۵/۰۸');
  assert.equal(faPercent(100), '۱۰۰٪');
});

test('furniture markup', () => {
  const base = { showHeader: true, showTitle: true, showFooter: true, masthead: 'نام', mastheadImage: '', title: 'T<', subtitle: '', headerAlign: 'center', headerWidth: 220, headerHeight: 58, repeatHeader: true, footerText: '', footerImage: 'data:image/png;base64,AA', footerAlign: 'stretch', footerWidth: 100, footerHeight: 40, repeatFooter: false };
  const h = headerHTML(base);
  assert.match(h, /class="masthead repeat-header"/);
  assert.match(h, /justify-content:center/);
  assert.match(h, /<h1>T&lt;<\/h1>/);
  const f = footerHTML(base);
  assert.match(f, /justify-content:space-between/);
  assert.match(f, /width:100%/);
  assert.equal(headerHTML({ ...base, showHeader: false, showTitle: false }), '');
  assert.equal(footerHTML({ ...base, showFooter: false }), '');
});

test('html source: beautify and highlight', () => {
  const { DOMParser } = parseHTML('<html></html>');
  class P { parseFromString(h) { return parseHTML(`<!doctype html><html><head></head><body>${h}</body></html>`).document; } }
  const out = beautifyHTML('<div><p>a <b>b</b></p><ul><li>x</li></ul></div>', { DOMParser: P });
  assert.match(out, /^<!doctype html>/);
  assert.match(out, /\n {2}<body>/);
  assert.ok(out.includes('<p>a <b>b</b></p>'));
  const hl = highlightHTML('<a href="https://x.com" class="c">t &amp; u</a>');
  assert.ok(hl.includes('tok-tag') && hl.includes('tok-link') && hl.includes('tok-entity'));
  assert.ok(!highlightHTML('<script>').includes('<script>'));
});

test('markdown export from DOM', () => {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  const root = document.createElement('div');
  root.innerHTML = '<h1>عنوان</h1><p>متن <strong>پررنگ</strong> <em>مورب</em> <a href="https://a.com">لینک</a></p>' +
    '<ul><li>a<ul><li>a1</li></ul></li><li>b</li></ul><ol><li>x</li><li>y</li></ol>' +
    '<blockquote>q</blockquote><hr><pre><code>let a;</code></pre>' +
    '<table><thead><tr><th>h1</th><th>h2</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
  const md = htmlToMarkdown(root);
  assert.match(md, /^# عنوان\n\n/);
  assert.ok(md.includes('متن **پررنگ** *مورب* [لینک](https://a.com)'));
  assert.ok(md.includes('- a\n  - a1\n- b'));
  assert.ok(md.includes('1. x\n2. y'));
  assert.ok(md.includes('> q'));
  assert.ok(md.includes('```\nlet a;\n```'));
  assert.ok(md.includes('| h1 | h2 |\n| --- | --- |\n| 1 | 2 |'));
});
