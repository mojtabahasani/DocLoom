import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEmbedConfig, embedConfig, NORMAL } from '../src/js/core/embed-config.js';
import { digitMode, setDigitMode, toLatinDigits, localDigits, localSeparators, percentSign, HAS_LOCAL_DIGIT } from '../src/js/core/digits.js';
import { toFaDigits, faPercent } from '../src/js/content/persian.js';
import { formatJalali, parseJalali } from '../src/js/brand/jalali.js';
import { formatLetterNumber } from '../src/js/brand/letter.js';
import { fmtNum, parseNumber } from '../src/js/content/chart.js';
import { defaultRules, cleanMarkdown } from '../src/js/content/cleanup.js';
import { renderPresentation } from '../src/js/export/present-core.js';

/** Run `fn` with Latin digits active, then restore Persian (the default every other test relies on). */
const withEn = (fn) => {
  setDigitMode('en');
  try {
    return fn();
  } finally {
    setDigitMode('fa');
  }
};

test('embed config: no global (or junk) means normal mode with every capability on', () => {
  assert.equal(embedConfig(), NORMAL); // node has no window.DOCLOOM_EMBED
  for (const raw of [undefined, null, 0, 'claria', [], true]) assert.deepEqual(parseEmbedConfig(raw), NORMAL);
  assert.equal(NORMAL.active, false);
  assert.deepEqual([NORMAL.digits, NORMAL.upload, NORMAL.library, NORMAL.server], ['fa', true, true, true]);
});

test('embed config: the Claria host object', () => {
  const brand = { id: 'b1', name: 'کلاریا' };
  const c = parseEmbedConfig({ host: 'claria', digits: 'en', upload: false, library: false, server: false, brand });
  assert.deepEqual({ ...c }, { active: true, host: 'claria', digits: 'en', upload: false, library: false, server: false, brand });
  assert.ok(Object.isFrozen(c));
});

test('embed config: only an explicit false switches a capability off; digits default to Persian', () => {
  const c = parseEmbedConfig({});
  assert.deepEqual({ ...c }, { active: true, host: '', digits: 'fa', upload: true, library: true, server: true, brand: null });
  const d = parseEmbedConfig({ digits: 'EN', upload: 0, library: null, server: 'no', brand: [1] });
  assert.deepEqual([d.digits, d.upload, d.library, d.server, d.brand], ['fa', true, true, true, null]);
});

test('digit module: Persian by default, Latin on request, parsing works in both', () => {
  assert.equal(digitMode(), 'fa');
  assert.equal(localDigits('1405/08'), '۱۴۰۵/۰۸');
  assert.equal(localSeparators('1,200.5'), '1٬200٫5');
  assert.equal(percentSign(), '٪');
  assert.equal(setDigitMode('xx'), 'fa');
  withEn(() => {
    assert.equal(digitMode(), 'en');
    assert.equal(localDigits('1405/08'), '1405/08');
    assert.equal(localSeparators('1,200.5'), '1,200.5');
    assert.equal(percentSign(), '%');
  });
  assert.equal(toLatinDigits('۱۴۰۵ و ٣٢'), '1405 و 32');
  assert.ok(HAS_LOCAL_DIGIT.test('۷') && HAS_LOCAL_DIGIT.test('٧') && !HAS_LOCAL_DIGIT.test('7'));
});

test("generators follow digits:'en': persian helpers, Jalali, letter number, chart labels", () => {
  assert.equal(toFaDigits(120), '۱۲۰');
  assert.equal(faPercent(99.6), '۱۰۰٪');
  assert.equal(formatJalali({ y: 1405, m: 8, d: 8 }), '۱۴۰۵/۰۸/۰۸');
  assert.equal(formatLetterNumber('ک', 17), 'ک/۱۷');
  assert.equal(fmtNum(1234.5), '۱٬۲۳۴٫۵');
  withEn(() => {
    assert.equal(toFaDigits(120), '120');
    assert.equal(faPercent(99.6), '100%');
    assert.equal(formatJalali({ y: 1405, m: 8, d: 8 }), '1405/08/08');
    assert.equal(formatJalali({ y: 1405, m: 8, d: 8 }, { digits: 'fa' }), '۱۴۰۵/۰۸/۰۸'); // an explicit choice still wins
    assert.equal(formatLetterNumber('ک', 17), 'ک/17');
    assert.equal(fmtNum(1234.5), '1,234.5');
    assert.equal(fmtNum(12, true), '12%');
    // Persian-digit input keeps parsing.
    assert.deepEqual(parseJalali('۱۴۰۵/۸/۸'), { y: 1405, m: 8, d: 8 });
    assert.equal(parseNumber('۱۲٬۴۵۰٫۵').value, 12450.5);
  });
});

test("cleanup: the Latin → Persian digit rule is off by default in 'en' mode; Arabic digits become Latin", () => {
  assert.equal(defaultRules().digits, true);
  assert.equal(cleanMarkdown('فروش ۱۲ و ٣ واحد').text, 'فروش ۱۲ و ۳ واحد');
  withEn(() => {
    assert.equal(defaultRules().digits, false);
    assert.equal(defaultRules().arabic, true);
    assert.equal(cleanMarkdown('فروش 12 و ٣ واحد').text, 'فروش 12 و 3 واحد');
  });
});

test("presentation export: the slide counter script is told to use Latin digits only in 'en' mode", () => {
  const parts = { title: 't', slides: [{ html: '<p>x</p>', kind: 'content' }, { html: '<p>y</p>', kind: 'content' }], accent: '#000', tint: '#eee' };
  const fa = renderPresentation(parts);
  assert.match(fa, /<body data-kind="content">/);
  assert.match(fa, /aria-label="اسلاید ۲"/);
  const en = withEn(() => renderPresentation(parts));
  assert.match(en, /<body data-kind="content" data-digits="en">/);
  assert.match(en, /aria-label="اسلاید 2"/);
});
