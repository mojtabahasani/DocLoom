import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { unzipSync, strFromU8 } from 'fflate';
import { buildDocxParts, buildDocx, imageSize, xmlEscape } from '../src/js/export/docx.js';
import { domToBlocks } from '../src/js/export/docx-dom.js';
import { paginate } from '../src/js/export/paginate.js';
import { splitSlides, renderPresentation } from '../src/js/export/present-core.js';
import { renderInteractive } from '../src/js/export/interactive-core.js';

// minimal strict well-formedness check: balanced tags, quoted attributes, one root, no stray '<' or '&'
function assertWellFormed(xml, name) {
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, '');
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g;
  const stack = [];
  let pos = 0;
  let roots = 0;
  let m;
  while ((m = re.exec(body))) {
    const between = body.slice(pos, m.index);
    assert.ok(!/</.test(between), `${name}: stray "<" near ${between.slice(0, 40)}`);
    assert.ok(!/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(between), `${name}: bad entity`);
    if (m[1]) assert.equal(stack.pop(), m[2], `${name}: mismatched </${m[2]}>`);
    else {
      if (!stack.length) roots++;
      if (!m[4]) stack.push(m[2]);
    }
    pos = re.lastIndex;
  }
  assert.ok(!/</.test(body.slice(pos)), `${name}: trailing junk`);
  assert.deepEqual(stack, [], `${name}: unclosed tags`);
  assert.equal(roots, 1, `${name}: needs exactly one root`);
}

// 1x1 PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

const model = () => ({
  title: 'گزارش «آزمون» & <تست>',
  accent: '#1c5263',
  images: { a: { bytes: PNG, ext: 'png', w: 1, h: 1 }, b: { bytes: PNG, ext: 'png', w: 1, h: 1 } },
  header: { text: 'مجتمع کامپیوتر', image: { id: 'a', w: 60, h: 30 } },
  footer: { text: 'پاورقی' },
  blocks: [
    { k: 'h', level: 1, runs: [{ t: 'عنوان اصلی' }] },
    { k: 'h', level: 2, runs: [{ t: 'زیرعنوان' }] },
    { k: 'p', runs: [{ t: 'متن ' }, { t: 'پررنگ', b: true }, { t: ' و ' }, { t: 'کج', i: true }, { t: ' و ' }, { t: 'پیوند', href: 'https://example.com/?a=1&b=2' }, { t: ' و ' }, { t: 'code', code: true }] },
    { k: 'list', ordered: false, items: [{ runs: [{ t: 'الف' }], level: 0 }, { runs: [{ t: 'ب' }], level: 1 }] },
    { k: 'list', ordered: true, items: [{ runs: [{ t: 'یک' }], level: 0 }, { runs: [{ t: 'دو' }], level: 0 }] },
    { k: 'list', ordered: true, items: [{ runs: [{ t: 'دوباره یک' }], level: 0 }] },
    { k: 'table', header: [[{ t: 'نام' }], [{ t: 'مقدار' }]], rows: [[[{ t: 'الف' }], [{ t: '۱' }]], [[{ t: 'ب' }], [{ t: '۲' }]]] },
    { k: 'code', lines: ['const a = 1;', '  if (a) { b(); } // <ok> & "x"'] },
    { k: 'img', id: 'b', w: 200, h: 100 },
    { k: 'letterMeta', lines: [{ label: 'تاریخ:', value: '۱۴۰۵/۰۸/۰۸' }, { label: 'شماره:', value: '۱۲۳/۱۷' }], qr: { id: 'a', w: 80, h: 80 } },
    { k: 'p', runs: [{ t: 'نقل' }], quote: { color: '1C5263', fill: 'EDF3F2' } },
    { k: 'sign', imgs: [{ id: 'a', w: 100, h: 50 }], name: 'مجتبی حسنی', role: 'مدیرعامل' },
  ],
});

test('docx: every XML part is well-formed and the package structure is complete', () => {
  const parts = buildDocxParts(model());
  for (const need of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/fontTable.xml', 'word/settings.xml', 'word/_rels/document.xml.rels', 'word/header1.xml', 'word/footer1.xml', 'word/_rels/header1.xml.rels', 'docProps/core.xml'])
    assert.ok(need in parts, 'missing ' + need);
  assert.equal(Object.keys(parts)[0], '[Content_Types].xml');
  for (const [k, v] of Object.entries(parts)) if (typeof v === 'string') assertWellFormed(v, k);
  assert.ok(Object.keys(parts).some((k) => k.startsWith('word/media/image')));
  const ct = parts['[Content_Types].xml'];
  assert.match(ct, /Extension="png"/);
  assert.match(ct, /\/word\/document\.xml/);
});

test('docx: RTL/bidi paragraphs, rtl runs, cs fonts with Tahoma fallback, headings', () => {
  const p = buildDocxParts(model());
  const doc = p['word/document.xml'];
  assert.match(doc, /<w:bidi\/>/);
  assert.match(doc, /<w:rtl\/>/);
  assert.match(doc, /w:cs="Vazirmatn"/);
  assert.match(doc, /<w:pStyle w:val="Heading1"\/>/);
  assert.match(doc, /<w:pStyle w:val="Heading2"\/>/);
  assert.match(doc, /<w:b\/><w:bCs\/>/);
  assert.match(doc, /<w:i\/><w:iCs\/>/);
  assert.match(doc, /<w:bidiVisual\/>/);
  assert.match(p['word/styles.xml'], /w:styleId="Heading3"/);
  assert.match(p['word/styles.xml'], /Vazirmatn/);
  assert.match(p['word/fontTable.xml'], /altName w:val="Tahoma"/);
  assert.match(p['word/styles.xml'], /<w:bidi\/>/);
});

test('docx: tables repeat the header row, code is monospace LTR, text is escaped', () => {
  const p = buildDocxParts(model());
  const doc = p['word/document.xml'];
  assert.equal((doc.match(/<w:tblHeader\/>/g) || []).length, 1);
  assert.match(doc, /<w:tr><w:trPr><w:cantSplit\/><w:tblHeader\/>/);
  assert.match(doc, /w:ascii="Consolas"/);
  assert.match(doc, /<w:pStyle w:val="CodeBlock"\/>[^]*?<w:bidi w:val="0"\/>/);
  assert.match(doc, /&lt;ok&gt; &amp; &quot;x&quot;/);
  assert.equal(xmlEscape('a<b&c\u0001'), 'a&lt;b&amp;c');
  assert.match(p['docProps/core.xml'], /&lt;تست&gt;/);
});

test('docx: numbering defines bullets and restarting ordered lists', () => {
  const p = buildDocxParts(model());
  const num = p['word/numbering.xml'];
  assert.match(num, /w:numFmt w:val="bullet"/);
  assert.match(num, /w:numFmt w:val="decimal"/);
  assert.equal((num.match(/<w:num w:numId/g) || []).length, 3); // bullets + 2 ordered lists
  assert.equal((num.match(/w:startOverride/g) || []).length, 2);
  const doc = p['word/document.xml'];
  assert.match(doc, /<w:numId w:val="1"\/>/);
  assert.match(doc, /<w:numId w:val="2"\/>/);
  assert.match(doc, /<w:numId w:val="3"\/>/);
});

test('docx: hyperlinks and images get relationships (header/footer have their own)', () => {
  const p = buildDocxParts(model());
  const rels = p['word/_rels/document.xml.rels'];
  assert.match(rels, /Target="https:\/\/example\.com\/\?a=1&amp;b=2" TargetMode="External"/);
  assert.match(rels, /relationships\/hyperlink/);
  assert.match(rels, /relationships\/image/);
  assert.match(p['word/document.xml'], /<w:hyperlink r:id="rId\d+"/);
  assert.match(p['word/document.xml'], /<a:blip r:embed="rId\d+"/);
  assert.match(p['word/_rels/header1.xml.rels'], /relationships\/image/);
  assert.match(p['word/header1.xml'], /<a:blip r:embed=/);
  assert.match(p['word/footer1.xml'], /fldSimple w:instr=" PAGE "/);
  assert.match(p['word/document.xml'], /<w:headerReference/);
  // every rId used in the body exists in the rels
  for (const m of p['word/document.xml'].matchAll(/r:(?:id|embed)="(rId\d+)"/g)) assert.ok(rels.includes(`Id="${m[1]}"`), m[1]);
  // docPr ids are unique across the package
  const ids = [...p['word/document.xml'].matchAll(/<wp:docPr id="(\d+)"/g), ...p['word/header1.xml'].matchAll(/<wp:docPr id="(\d+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('docx: zip round-trips and letter blocks are borderless tables', () => {
  const bytes = buildDocx(model());
  const files = unzipSync(bytes);
  assert.ok(files['word/document.xml'] && files['word/media/image1.png']);
  assert.deepEqual(Object.keys(files)[0], '[Content_Types].xml');
  const doc = strFromU8(files['word/document.xml']);
  assert.match(doc, /w:val="nil"/);
  assert.match(doc, /تاریخ:/);
  assert.match(doc, /مجتبی حسنی/);
  assert.deepEqual(imageSize(PNG), { ext: 'png', w: 1, h: 1 });
  assert.equal(imageSize(Uint8Array.from([1, 2, 3])), null);
});

test('docx-dom: converts the document DOM into blocks', () => {
  const { document } = parseHTML(
    `<div><div class="masthead" data-md2-furniture="header"><b>x</b></div><header class="cover" data-md2-furniture="title"><h1>تیتر</h1><p class="subtitle">زیر</p></header>
    <h2>بخش</h2><p>سلام <strong>دنیا</strong> <a href="https://a.b/c">لینک</a> <a href="javascript:x">بد</a></p>
    <ul class="task-list"><li class="task task-done">انجام</li><li class="task">باقی</li></ul><ol><li>یک<ul><li>زیر</li></ul></li></ol>
    <table><thead><tr><th>الف</th><th>ب</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
    <pre class="code">a\nb</pre><blockquote><p>نقل</p></blockquote><hr><figure class="chart"><svg class="chart-svg" viewBox="0 0 640 300"><rect width="3" height="3"/></svg></figure></div>`,
  );
  const blocks = domToBlocks(document.querySelector('div'));
  const kinds = blocks.map((b) => b.k);
  assert.ok(!JSON.stringify(blocks).includes('"x"'), 'masthead skipped');
  assert.deepEqual(kinds, ['h', 'p', 'h', 'p', 'list', 'list', 'table', 'code', 'p', 'hr', 'img']);
  assert.equal(blocks[0].level, 1);
  const para = blocks[3];
  assert.ok(para.runs.some((r) => r.b && r.t === 'دنیا'));
  assert.ok(para.runs.some((r) => r.href === 'https://a.b/c'));
  assert.ok(!para.runs.some((r) => r.href && r.href.startsWith('javascript')));
  assert.equal(blocks[4].items[0].runs[0].t, '☑ ');
  assert.equal(blocks[5].items[1].level, 1);
  assert.equal(blocks[6].header.length, 2);
  assert.deepEqual(blocks[7].lines, ['a', 'b']);
  assert.ok(blocks[8].quote);
  assert.equal(blocks[10].w, 640);
});

test('paginate: never cuts an atom, keeps headings with the next block, hard-splits oversized atoms', () => {
  const atoms = [];
  let y = 0;
  for (let i = 0; i < 20; i++) {
    atoms.push({ top: y, bottom: y + 90 });
    y += 100;
  }
  const pages = paginate(atoms, 450, y);
  assert.ok(pages.length >= 4);
  for (const p of pages) for (const a of atoms) assert.ok(!(a.top < p.end - 0.5 && a.bottom > p.end + 0.5 && a.top >= p.start), 'cut through an atom');
  assert.equal(pages[0].start, 0);
  assert.ok(pages.at(-1).end >= atoms.at(-1).bottom);
  // pages are contiguous-forward and within height
  pages.forEach((p, i) => {
    assert.ok(p.end - p.start <= 450 + 0.5);
    if (i) assert.ok(p.start >= pages[i - 1].end - 0.5);
  });
  // heading kept with the next atom
  const hd = [{ top: 0, bottom: 300 }, { top: 310, bottom: 400, keepNext: true }, { top: 410, bottom: 700 }];
  const p2 = paginate(hd, 450, 700);
  assert.equal(p2[0].end, 300);
  assert.equal(p2[1].start, 310);
  // oversized atom is split as a last resort
  const big = paginate([{ top: 0, bottom: 1000 }], 400, 1000);
  assert.deepEqual(big.map((p) => [p.start, p.end]), [[0, 400], [400, 800], [800, 1000]]);
  assert.equal(paginate([], 400, 300).length, 1);
});

test('slides: split at h1/h2 and hr; furniture handled; footer parts go to the last slide', () => {
  const { document } = parseHTML(
    `<div><header class="cover" data-md2-furniture="title"><h1>عنوان سند</h1></header><p>مقدمه</p><h1>فصل ۱</h1><p>الف</p><hr><p>ب</p><h2>بخش</h2><ul><li>x</li></ul>
    <div class="page-footer" data-md2-furniture="footer">پا</div></div>`,
  );
  const slides = splitSlides(document.querySelector('div'));
  assert.equal(slides.length, 4);
  assert.equal(slides[0].kind, 'title');
  assert.match(slides[0].html, /عنوان سند/);
  assert.equal(slides[1].kind, 'title'); // h1 slide
  assert.ok(!slides.some((s) => /<hr/.test(s.html)));
  assert.match(slides.at(-1).html, /پا/);
  assert.equal(splitSlides(parseHTML('<div></div>').document.querySelector('div')).length, 0);
});

test('presentation html: next on the right, prev on the left, keys not mirrored, ltr controls, no editor code', () => {
  const html = renderPresentation({ title: 'ارائه', slides: [{ html: '<h1>الف</h1>', kind: 'title' }, { html: '<p>ب</p>', kind: 'content' }], accent: '#1c5263', tint: '#edf3f2' });
  const { document } = parseHTML(html);
  const ctl = document.querySelector('.ctl');
  assert.equal(ctl.getAttribute('dir'), 'ltr');
  const ids = Array.from(ctl.children).map((c) => c.id || c.className);
  assert.ok(ids.indexOf('prev') < ids.indexOf('count') || ids.indexOf('prev') < ids.indexOf('next'));
  assert.ok(ids.indexOf('prev') < ids.indexOf('next'));
  assert.match(html, /\.ctl\{[^}]*direction:ltr/);
  assert.match(html, /\.pbar\{[^}]*direction:ltr/);
  assert.match(html, /k==="ArrowRight"|k === 'ArrowRight'/);
  assert.match(html, /ArrowRight[^]*?show\(i ?\+ ?1\)/);
  assert.match(html, /ArrowLeft[^]*?show\(i ?- ?1\)/);
  assert.equal(document.querySelectorAll('.slide').length, 2);
  assert.ok(!/contenteditable|indexedDB|md2html-font/i.test(html));
});

test('interactive html: features present, no editor code, no external URLs', () => {
  const html = renderInteractive({
    title: 'سند', mainHTML: '<main class="md-export" style="font-size:15px"><h1>الف</h1><ul class="task-list"><li class="task">x</li></ul><pre class="code">x</pre></main>',
    accent: '#1c5263', tint: '#edf3f2', css: 'body{margin:0}', fontCss: '@font-face{font-family:Vazirmatn;src:url(data:font/woff2;base64,AAAA)}',
  });
  assert.doesNotThrow(() => parseHTML(html));
  for (const needle of ['xi-toc', 'xi-progress', 'xi-top', 'xi-copy', 'prefers-color-scheme', 'li.task']) assert.ok(html.includes(needle), needle);
  assert.match(html, /\.xi-group\{[^}]*direction:ltr/);
  assert.match(html, /\.xi-progress\{[^}]*direction:ltr/);
  assert.ok(!/contenteditable|indexedDB|serviceWorker|md2html-font/i.test(html), 'editor code leaked');
  assert.ok(!/(src|href)=["']https?:/i.test(html), 'external reference');
  assert.ok(!/url\(["']?https?:|@import|<script[^>]+src=|<link/i.test(html), 'external resource');
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket/.test(html));
  assert.ok(html.length < 20000);
});
