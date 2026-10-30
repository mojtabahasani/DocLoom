import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHTML as md } from '../src/js/content/markdown.js';

test('headings h1-h6 and trailing hashes', () => {
  assert.equal(md('# عنوان'), '<h1>عنوان</h1>');
  assert.equal(md('### Third ###'), '<h3>Third</h3>');
  assert.equal(md('###### six'), '<h6>six</h6>');
  assert.equal(md('####### seven'), '<p>####### seven</p>');
});

test('paragraphs and line breaks', () => {
  assert.equal(md('a\nb\n\nc'), '<p>a<br>b</p><p>c</p>');
  assert.equal(md('a\r\nb'), '<p>a<br>b</p>');
});

test('emphasis, strong, strike, inline code', () => {
  assert.equal(md('**bold** and *it* and ~~del~~ and `x<y`'),
    '<p><strong>bold</strong> and <em>it</em> and <del>del</del> and <code>x&lt;y</code></p>');
  assert.equal(md('snake_case_name stays'), '<p>snake_case_name stays</p>');
  assert.equal(md('_it_ here'), '<p><em>it</em> here</p>');
  assert.equal(md('**bold *nested* x**'), '<p><strong>bold <em>nested</em> x</strong></p>');
});

test('links: safe urls become anchors, unsafe stay text', () => {
  assert.equal(md('[go](https://a.com/x?y=1&z=2)'), '<p><a href="https://a.com/x?y=1&amp;z=2" rel="noopener noreferrer">go</a></p>');
  assert.equal(md('[m](mailto:a@b.co)'), '<p><a href="mailto:a@b.co" rel="noopener noreferrer">m</a></p>');
  assert.ok(!md('[x](javascript:alert(1))').includes('<a'));
  assert.ok(!md('[x](data:text/html;base64,AAAA)').includes('<a'));
});

test('images allow https and data:image only', () => {
  assert.match(md('![a](https://a.com/i.png)'), /<img src="https:\/\/a\.com\/i\.png" alt="a"/);
  assert.match(md('![a](data:image/png;base64,iVBOR)'), /<img src="data:image\/png;base64,iVBOR"/);
  assert.ok(!md('![a](javascript:alert(1))').includes('<img'));
});

test('raw HTML in markdown is escaped', () => {
  assert.equal(md('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(md('a <b>x</b>'), '<p>a &lt;b&gt;x&lt;/b&gt;</p>');
});

test('unordered, ordered and nested lists', () => {
  assert.equal(md('- a\n- b\n- c'), '<ul><li>a</li><li>b</li><li>c</li></ul>');
  assert.equal(md('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
  assert.equal(md('۱. الف\n۲. ب'), '<ol><li>الف</li><li>ب</li></ol>');
  assert.equal(md('- a\n  - a1\n  - a2\n- b'), '<ul><li>a<ul><li>a1</li><li>a2</li></ul></li><li>b</li></ul>');
  assert.equal(md('1. a\n   - x\n2. b'), '<ol><li>a<ul><li>x</li></ul></li><li>b</li></ol>');
  assert.equal(md('- a\n\n  more\n- b'), '<ul><li><p>a</p><p>more</p></li><li>b</li></ul>');
});

test('tables with separator, alignment and legacy form', () => {
  const t = md('| a | b |\n|---|:-:|\n| 1 | 2 |');
  assert.equal(t, '<table><thead><tr><th>a</th><th style="text-align:center">b</th></tr></thead><tbody><tr><td>1</td><td style="text-align:center">2</td></tr></tbody></table>');
  const noPipes = md('a | b\n--- | ---\n1 | 2');
  assert.match(noPipes, /<th>a<\/th><th>b<\/th>/);
  assert.match(noPipes, /<td>1<\/td><td>2<\/td>/);
  assert.match(md('| x | y |\n| 1 | 2 |'), /<th>x<\/th>.*<td>1<\/td>/);
  assert.match(md('| `a\\|b` | **c** |\n|---|---|\n| 1 | 2 |'), /<strong>c<\/strong>/);
});

test('blockquotes, including nesting and inner blocks', () => {
  assert.equal(md('> one\n> two'), '<blockquote><p>one<br>two</p></blockquote>');
  assert.equal(md('> a\n>\n> b'), '<blockquote><p>a</p><p>b</p></blockquote>');
  assert.equal(md('> a\n> > b'), '<blockquote><p>a</p><blockquote><p>b</p></blockquote></blockquote>');
  assert.equal(md('> - x\n> - y'), '<blockquote><ul><li>x</li><li>y</li></ul></blockquote>');
});

test('fenced code keeps content literal', () => {
  assert.equal(md('```js\nlet a = "<b>";\n# not heading\n```'), '<pre><code>let a = &quot;&lt;b&gt;&quot;;\n# not heading</code></pre>');
  assert.equal(md('~~~\nx\n~~~'), '<pre><code>x</code></pre>');
  assert.equal(md('```\nunclosed'), '<pre><code>unclosed</code></pre>');
});

test('horizontal rules', () => {
  assert.equal(md('---'), '<hr>');
  assert.equal(md('***'), '<hr>');
  assert.equal(md('a\n\n___\n\nb'), '<p>a</p><hr><p>b</p>');
});

test('Persian + Latin mixed content', () => {
  assert.equal(md('## گزارش Q3 سال ۱۴۰۵'), '<h2>گزارش Q3 سال ۱۴۰۵</h2>');
  assert.equal(md('متن **پررنگ** و `code` و [لینک](https://computer123.ir)'),
    '<p>متن <strong>پررنگ</strong> و <code>code</code> و <a href="https://computer123.ir/" rel="noopener noreferrer">لینک</a></p>');
  assert.equal(md('- مورد اول (item 1)\n- مورد دوم'), '<ul><li>مورد اول (item 1)</li><li>مورد دوم</li></ul>');
  assert.equal(md('نام_فایل_من.md'), '<p>نام_فایل_من.md</p>');
});

test('empty and whitespace input', () => {
  assert.equal(md(''), '');
  assert.equal(md('   \n\n  '), '');
  assert.equal(md(null), '');
});
