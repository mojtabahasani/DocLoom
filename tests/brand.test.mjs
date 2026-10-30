import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBrand, validateBrand, seedBrand, duplicateBrand, tintOf, brandThemeColors, SEED_NAME } from '../src/js/brand/brand-model.js';
import { formatLetterNumber, issueNumber, normalizeLetter, letterHTML, signatureHTML, footerQrHTML } from '../src/js/brand/letter.js';
import { watermarkText, normalizeWatermark, watermarkExportHTML, WATERMARK_PRESETS } from '../src/js/brand/watermark.js';
import { validateBackup, buildBackup } from '../src/js/library/backup.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('seed brand: text-only masthead, website and prefix', () => {
  const b = seedBrand();
  assert.equal(b.name, SEED_NAME);
  assert.equal(b.mastheadText, SEED_NAME);
  assert.equal(b.mastheadImage, '');
  assert.equal(b.website, 'https://www.computer123.ir');
  assert.equal(b.letterPrefix, '۱۲۳');
  assert.equal(b.letterCounter, 1);
  assert.equal(validateBrand(b), null);
});

test('normalizeBrand: bad values are reset, images must be data:image', () => {
  const b = normalizeBrand({ id: 'x', name: ' برند ', theme: 'neon', colors: { primary: 'red', accent: '#ABC' }, signatureImage: PNG, stampImage: 'https://evil/x.png', mastheadImage: 'data:text/html;base64,AA', letterCounter: -4, qr: { kind: 'zzz', size: 9999 }, extra: 1 });
  assert.equal(b.name, 'برند');
  assert.equal(b.theme, 'navy');
  assert.deepEqual(b.colors, { primary: '', accent: '#abc' });
  assert.equal(b.signatureImage, PNG);
  assert.equal(b.stampImage, '');
  assert.equal(b.mastheadImage, '');
  assert.equal(b.letterCounter, 1);
  assert.equal(b.qr.kind, 'url');
  assert.equal(b.qr.size, 180);
  assert.equal('extra' in b, false);
});

test('validateBrand', () => {
  assert.match(validateBrand({ name: '  ' }), /نام/);
  assert.match(validateBrand({ name: 'a', website: 'not a site' }), /وب‌سایت/);
  assert.equal(validateBrand({ name: 'a', website: 'computer123.ir' }), null);
  assert.match(validateBrand({ name: 'a', colors: { primary: 'blue' } }), /رنگ/);
});

test('duplicateBrand gets a new id, a copy name and a fresh counter', () => {
  const src = normalizeBrand({ id: 'a', name: 'الف', letterCounter: 40, signatureImage: PNG });
  const d = duplicateBrand(src, 'b');
  assert.equal(d.id, 'b');
  assert.equal(d.name, 'الف (کپی)');
  assert.equal(d.letterCounter, 1);
  assert.equal(d.signatureImage, PNG);
});

test('tintOf / brandThemeColors', () => {
  assert.equal(tintOf('#000000', 1), '#ffffff');
  assert.match(tintOf('#1c5263'), /^#[0-9a-f]{6}$/);
  assert.equal(brandThemeColors({ colors: { primary: '', accent: '' } }), null);
  assert.deepEqual(brandThemeColors({ colors: { primary: '#112233', accent: '#eeeeee' } }), { primary: '#112233', accent: '#eeeeee' });
});

test('letter number: prefix/counter and counter increment', () => {
  assert.equal(formatLetterNumber('۱۲۳', 7), '۱۲۳/۷');
  assert.equal(formatLetterNumber('ABC', 7), 'ABC/7');
  assert.equal(formatLetterNumber('', 12), '۱۲');
  const r = issueNumber({ letterPrefix: '۱۲۳', letterCounter: 1 });
  assert.equal(r.number, '۱۲۳/۱');
  assert.equal(r.brand.letterCounter, 2);
  assert.equal(issueNumber(r.brand).number, '۱۲۳/۲');
  assert.equal(issueNumber({ letterPrefix: 'x', letterCounter: 'oops' }).brand.letterCounter, 2);
});

test('letterHTML only in letter mode; fields are escaped; date block present', () => {
  const s = { mode: 'doc', letter: { subject: 'x' } };
  assert.equal(letterHTML(s), '');
  const l = letterHTML({ mode: 'letter', letter: { date: '۱۴۰۵/۰۸/۰۸', number: '۱۲۳/۱', recipient: '<b>آقای</b> الف', subject: 'موضوع', greeting: true }, qr: {} });
  assert.match(l, /data-md2-furniture="letter"/);
  assert.match(l, /تاریخ:<\/b> <span>۱۴۰۵\/۰۸\/۰۸/);
  assert.match(l, /شماره:/);
  assert.match(l, /به:<\/b> <span>&lt;b&gt;آقای/);
  assert.match(l, /موضوع:/);
  assert.match(l, /با سلام و احترام/);
  assert.doesNotMatch(l, /پیوست/);
  assert.doesNotMatch(letterHTML({ mode: 'letter', letter: { greeting: false }, qr: {} }), /سلام/);
});

test('signatureHTML: signer, overlapping images with saved positions', () => {
  const html = signatureHTML({ mode: 'letter', letter: { signer: { name: 'مجتبی حسنی', role: 'مدیر' }, sig: { x: 12, y: 5 }, stamp: { x: 80, y: 20 } }, signatureImage: PNG, stampImage: PNG });
  assert.match(html, /class="sig-img"[^>]*margin-left:12px;margin-top:5px/);
  assert.match(html, /class="stamp-img"[^>]*margin-left:80px;margin-top:20px/);
  assert.match(html, /<strong>مجتبی حسنی<\/strong><span>مدیر/);
  assert.equal(signatureHTML({ mode: 'letter', letter: {} }), '');
  assert.equal(signatureHTML({ mode: 'doc', letter: { signer: { name: 'x' } } }), '');
});

test('normalizeLetter clamps positions and cleans types', () => {
  const l = normalizeLetter({ sig: { x: 9999, y: -5 }, greeting: 0, number: 5 });
  assert.equal(l.sig.x, 400);
  assert.equal(l.sig.y, 0);
  assert.equal(l.number, '');
  assert.equal(l.greeting, true); // only an explicit false disables it
  assert.equal(normalizeLetter({ greeting: false }).greeting, false);
});

test('footer QR: position letter hides it from the footer only in letter mode', () => {
  const qr = { enabled: true, kind: 'url', value: 'computer123.ir', position: 'letter', size: 80 };
  assert.equal(footerQrHTML({ mode: 'letter', qr }), '');
  assert.match(footerQrHTML({ mode: 'doc', qr }), /class="qr-box"/);
  assert.match(letterHTML({ mode: 'letter', letter: {}, qr }), /qr-inline/);
  assert.equal(footerQrHTML({ mode: 'doc', qr: { ...qr, enabled: false } }), '');
});

test('watermark presets', () => {
  assert.deepEqual(WATERMARK_PRESETS.map((p) => p[0]), ['none', 'draft', 'confidential', 'final', 'copy', 'custom']);
  assert.equal(watermarkText({ preset: 'none' }), '');
  assert.equal(watermarkText({ preset: 'draft' }), 'پیش‌نویس');
  assert.equal(watermarkText({ preset: 'confidential' }), 'محرمانه');
  assert.equal(watermarkText({ preset: 'final' }), 'نهایی');
  assert.equal(watermarkText({ preset: 'copy' }), 'رونوشت');
  assert.equal(watermarkText({ preset: 'custom', text: ' ویژه ' }), 'ویژه');
  assert.equal(watermarkText({ preset: 'custom', text: '' }), '');
  assert.deepEqual(normalizeWatermark({ preset: 'bogus', text: 5 }), { preset: 'none', text: '' });
  assert.equal(watermarkExportHTML({ preset: 'none' }), '');
  assert.match(watermarkExportHTML({ preset: 'custom', text: '<x>' }), /class="md-wm"[^>]*><span>&lt;x&gt;<\/span>/);
});

test('backup carries brands and re-validates their fields', () => {
  const b = normalizeBrand({ id: 'b1', name: 'برند', signatureImage: PNG, letterCounter: 12 });
  const doc = { id: 'd', title: 't', source: '', html: '', createdAt: 1, updatedAt: 2, tags: [], layout: {}, brandId: 'b1', letter: { number: '۱۲۳/۱' } };
  const r = validateBackup(JSON.parse(JSON.stringify(buildBackup({ documents: [doc], brands: [b, { id: 'b2', name: 'x', stampImage: 'javascript:alert(1)', letterCounter: 'z' }] }))));
  assert.equal(r.ok, true);
  assert.equal(r.data.brands.length, 2);
  assert.equal(r.data.brands[0].signatureImage, PNG);
  assert.equal(r.data.brands[0].letterCounter, 12);
  assert.equal(r.data.brands[1].stampImage, '');
  assert.equal(r.data.brands[1].letterCounter, 1);
  assert.equal(r.data.documents[0].letter.number, '۱۲۳/۱');
  assert.equal(r.data.documents[0].brandId, 'b1');
});
