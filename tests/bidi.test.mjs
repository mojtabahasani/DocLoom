import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { detectTextDir, applyBidi } from '../src/js/content/bidi.js';

test('detectTextDir: identifies LTR, RTL, accented Latin, and neutral strings', () => {
  assert.equal(detectTextDir('Why DocLoom?'), 'ltr');
  assert.equal(detectTextDir('چرا داک‌لوم؟'), 'rtl');
  assert.equal(detectTextDir('123 - 456!'), null);
  assert.equal(detectTextDir('Café Menu'), 'ltr');
  assert.equal(detectTextDir('گزارش Q3 سال 2026'), 'rtl');
  assert.equal(detectTextDir('DocLoom برای اسناد'), 'ltr');
  assert.equal(detectTextDir(''), null);
});

test('applyBidi: sets dir="ltr" on Latin headings, lists, cover, callouts, TOC, and tables while keeping Persian blocks RTL', () => {
  const { document } = parseHTML(`
    <article class="paper" dir="rtl">
      <header class="cover" data-md2-furniture="title"><h1>DocLoom</h1><p class="subtitle">Markdown Studio</p></header>
      <h3>Why DocLoom?</h3>
      <ol><li>First item with <code>.docx</code></li><li>Second item</li></ol>
      <h2>چرا داک‌لوم؟</h2>
      <p><code>DocLoom</code> یک ابزار تبدیل مستندات است.</p>
      <ul><li>مورد اول</li><li>مورد دوم</li></ul>
      <aside class="callout callout-note"><span class="callout-title">نکته</span><p>Always run tests first.</p></aside>
      <nav class="toc"><p class="toc-title">فهرست مطالب</p><ul><li><a href="#s-why">Why DocLoom?</a></li></ul></nav>
      <blockquote><p>Keep formatting clean.</p></blockquote>
      <table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>Width</td><td>100</td></tr></tbody></table>
      <table class="stmt"><tr><td>۱</td></tr></table>
    </article>
  `);
  const paper = document.querySelector('.paper');
  applyBidi(paper, 'rtl');

  assert.equal(paper.getAttribute('dir'), 'ltr');
  assert.equal(paper.querySelector('header.cover').getAttribute('dir'), 'ltr');
  assert.equal(paper.querySelector('header.cover h1').getAttribute('dir'), 'ltr');
  assert.equal(paper.querySelector('h3').getAttribute('dir'), 'ltr');
  assert.equal(paper.querySelector('ol').getAttribute('dir'), 'ltr');
  assert.equal(paper.querySelector('ol li').getAttribute('dir'), 'ltr');
  assert.equal(paper.querySelector('h2').getAttribute('dir'), 'rtl');
  assert.equal(paper.querySelector('h2 + p').getAttribute('dir'), 'rtl');
  assert.equal(paper.querySelector('h2 + p + ul').getAttribute('dir'), 'rtl');
  assert.equal(paper.querySelector('aside.callout').getAttribute('dir'), 'ltr');
  assert.equal(paper.querySelector('nav.toc').getAttribute('dir'), 'ltr');
  assert.equal(paper.querySelector('blockquote').getAttribute('dir'), 'ltr');
  assert.equal(paper.querySelector('table:not(.stmt)').getAttribute('dir'), 'ltr');
  assert.equal(paper.querySelector('table.stmt').getAttribute('dir'), null);
});

test('applyBidi: skips cover furniture when picking overall body direction, respects fallback on empty paper, and clears stale dir', () => {
  const { document } = parseHTML(`
    <article class="paper">
      <header class="cover" data-md2-furniture="title"><h1>DocLoom</h1></header>
      <p>سلام دنیا</p>
      <p dir="ltr">12345</p>
    </article>
  `);
  const paper = document.querySelector('.paper');
  applyBidi(paper, 'ltr');

  assert.equal(paper.querySelector('header.cover').getAttribute('dir'), 'ltr');
  assert.equal(paper.getAttribute('dir'), 'rtl');
  const ps = paper.querySelectorAll('p');
  assert.equal(ps[0].getAttribute('dir'), 'rtl');
  assert.equal(ps[1].getAttribute('dir'), null);

  const emptyDoc = parseHTML('<article class="paper"></article>').document.querySelector('.paper');
  applyBidi(emptyDoc, 'ltr');
  assert.equal(emptyDoc.getAttribute('dir'), 'ltr');
  applyBidi(emptyDoc, 'rtl');
  assert.equal(emptyDoc.getAttribute('dir'), 'rtl');
});
