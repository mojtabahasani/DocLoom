import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_LANGS, normalizeLang, dirForLang, t, GROUP_I18N, TOOL_I18N } from '../src/js/core/i18n.js';
import { sanitizePrefs } from '../src/js/library/prefs-schema.js';

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
