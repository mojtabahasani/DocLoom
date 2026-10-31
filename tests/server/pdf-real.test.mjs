// Real headless Chrome: runs only where Chrome exists.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { findChrome } from '../../server/lib/pdf.js';
import { startServer } from './_s3.mjs';

const chrome = findChrome();
let S;
before(async () => { if (chrome) S = await startServer({ chrome }); });
after(() => S?.stop());

const letter = (n) => `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>نامه</title><style>
@page{size:A4 portrait;margin:18mm}body{font-family:Tahoma,sans-serif;direction:rtl}
.pg{break-after:page;height:240mm}.md-wm{position:fixed;inset:0;display:grid;place-items:center;font-size:90px;opacity:.1}
</style></head><body><div class="md-wm"><span>پیش‌نویس</span></div>${Array.from({ length: n }, (_, i) => `<section class="pg"><h1>نامهٔ رسمی ${i + 1}</h1><p>با سلام و احترام، این متن آزمایشی صفحهٔ ${i + 1} است.</p></section>`).join('')}</body></html>`;

test('real Chrome: a 3-page letter becomes an A4 PDF with at least 3 pages', { skip: chrome ? false : 'Chrome is not installed', timeout: 90000 }, async () => {
  const r = await S.call('POST', '/api/pdf', { body: { html: letter(3), pageNumbers: true } });
  assert.equal(r.status, 200, r.text.slice(0, 200));
  const pdf = r.buf.toString('latin1');
  assert.ok(pdf.startsWith('%PDF'));
  const pages = (pdf.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
  assert.ok(pages >= 3, `pages: ${pages}`);
  const boxes = [...pdf.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
  assert.ok(boxes.length >= 1);
  for (const [, w, h] of boxes) {
    assert.ok(Math.abs(Number(w) - 595) <= 1, 'width ' + w);
    assert.ok(Math.abs(Number(h) - 842) <= 1, 'height ' + h);
  }
});
