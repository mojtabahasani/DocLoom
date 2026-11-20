import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_LANGS, normalizeLang, dirForLang, t, GROUP_I18N, TOOL_I18N, localizeCommand, localizeToast, localizeToastAction } from '../src/js/core/i18n.js';
import { sanitizePrefs } from '../src/js/library/prefs-schema.js';
import { analyze } from '../src/js/content/analytics.js';
import { DOC_THEMES } from '../src/js/export/theme.js';

test('normalizeLang and dirForLang support en (LTR) and fa (RTL)', () => {
  assert.deepEqual(SUPPORTED_LANGS, ['en', 'fa']);
  assert.equal(normalizeLang('en'), 'en');
  assert.equal(normalizeLang('fa'), 'fa');
  assert.equal(normalizeLang('fr'), 'en');
  assert.equal(normalizeLang(undefined), 'en');
  assert.equal(dirForLang('en'), 'ltr');
  assert.equal(dirForLang('fa'), 'rtl');
});

test('t() returns localized strings with English fallback', () => {
  assert.equal(t('newDoc', 'en'), 'New Document');
  assert.equal(t('newDoc', 'fa'), 'سند تازه');
  assert.equal(t('exportHtml', 'en'), 'Export HTML');
  assert.equal(t('nonexistentKey', 'fa'), 'nonexistentKey');
});

test('all drawer groups and tools define both en and fa labels', () => {
  for (const [k, v] of Object.entries(GROUP_I18N)) {
    assert.ok(v.en?.name && v.en?.short, `missing en group i18n for ${k}`);
    assert.ok(v.fa?.name && v.fa?.short, `missing fa group i18n for ${k}`);
  }
  for (const [k, v] of Object.entries(TOOL_I18N)) {
    assert.ok(v.en && v.fa, `missing tool i18n for ${k}`);
  }
});

test('sanitizePrefs accepts valid lang and rejects invalid values', () => {
  assert.deepEqual(sanitizePrefs({ lang: 'en' }), { lang: 'en' });
  assert.deepEqual(sanitizePrefs({ lang: 'fa' }), { lang: 'fa' });
  assert.deepEqual(sanitizePrefs({ lang: 'de' }), {});
});

test('localizeCommand translates palette commands in en while keeping Persian keywords searchable', () => {
  const sample = { id: 'chart', title: 'درج نمودار از جدول', group: 'درج', keywords: 'chart graph' };
  const en = localizeCommand(sample, 'en');
  assert.equal(en.title, 'Insert Chart from Table');
  assert.equal(en.group, 'Insert');
  assert.ok(en.keywords.includes('درج نمودار از جدول'));
  assert.equal(localizeCommand(sample, 'fa').title, 'درج نمودار از جدول');
  const brand = localizeCommand({ id: 'brand-use-acme', title: 'برند: Acme', group: 'برندها', keywords: 'brand' }, 'en');
  assert.equal(brand.title, 'Brand: Acme');
  assert.equal(brand.group, 'Brands');
});

test('analyze() supports English labels and KB/B formatting when lang="en"', () => {
  const m = Object.fromEntries(analyze({ text: 'Hello\nworld test', htmlBytes: 2048, links: 1, images: 2, tables: 1, headings: 2, lang: 'en' }));
  assert.equal(m['Lines'], '2');
  assert.equal(m['Words'], '3');
  assert.equal(m['Approx. Size'], '2.0 KB');
  assert.equal(m['Tables / Headings'], '1 / 2');
});

test('every theme in DOC_THEMES defines both Persian label and English labelEn', () => {
  for (const th of DOC_THEMES) {
    assert.ok(th.label?.trim(), `${th.id} needs label`);
    assert.ok(th.labelEn?.trim(), `${th.id} needs labelEn`);
  }
});

test('localizeToast and localizeToastAction translate static and parameterized notices into English', () => {
  assert.equal(localizeToast('در کلیپ‌بورد کپی شد.', 'en'), 'Copied to clipboard.');
  assert.equal(localizeToast('در کلیپ‌بورد کپی شد.', 'fa'), 'در کلیپ‌بورد کپی شد.');
  assert.equal(localizeToast('پاک‌سازی انجام شد؛ ۱۲ تغییر.', 'en'), 'Cleanup complete: 12 changes.');
  assert.equal(localizeToast('برند «Acme» روی سند اعمال شد.', 'en'), 'Brand "Acme" applied to document.');
  assert.equal(localizeToast('پشتیبان ساخته شد: ۴ سند، ۱۵ نسخه.', 'en'), 'Backup created: 4 docs, 15 versions.');
  assert.equal(localizeToast('QR کد: روشن', 'en'), 'QR code: On');
  assert.equal(localizeToastAction('برگردان', 'en'), 'Undo');
  assert.equal(localizeToastAction('باز کردن', 'en'), 'Open');
  assert.equal(localizeToastAction('برگردان', 'fa'), 'برگردان');
});
