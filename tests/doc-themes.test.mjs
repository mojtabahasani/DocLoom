// The document themes live twice: as data in js/export/theme.js (what an export is built from)
// and as CSS in styles/document.css (what the preview is painted with). They must say the same
// thing, or a document would print in colours it was never shown in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOC_THEMES, THEME_COLORS, THEME_IDS, themeColors, themePaper, ruleCSS } from '../src/js/export/theme.js';

const css = readFileSync(new URL('../src/styles/document.css', import.meta.url), 'utf8');

/** Pull `.paper[data-doc-theme=id]{ … }` out of the stylesheet, declarations only. */
function block(id) {
  const m = css.match(new RegExp(`\\.paper\\[data-doc-theme=${id}\\]\\s*\\{([^}]*)\\}`));
  return m ? m[1].replace(/\s+/g, '') : null;
}
const decl = (body, prop) => body.match(new RegExp(`(?:^|;)${prop}:([^;]+)`))?.[1];

test('every theme in the data table has a rule in document.css with the same colours', () => {
  for (const t of DOC_THEMES) {
    const body = block(t.id);
    assert.ok(body, `document.css has no rule for «${t.label}» (${t.id})`);
    assert.equal(decl(body, '--accent-doc'), t.accent, `accent of ${t.id}`);
    assert.equal(decl(body, '--tint'), t.tint, `tint of ${t.id}`);
    const paper = decl(body, 'background') || decl(body, 'background-color');
    assert.equal(paper, t.paper, `paper of ${t.id}`);
  }
});

test('document.css declares no theme the data table does not know', () => {
  const inCss = [...css.matchAll(/\.paper\[data-doc-theme=([a-z]+)\]/g)].map((m) => m[1]);
  for (const id of new Set(inCss)) assert.ok(THEME_IDS.includes(id), `document.css styles an unknown theme: ${id}`);
});

test('the ids, labels and legacy colour map stay in step', () => {
  assert.equal(THEME_IDS.length, DOC_THEMES.length);
  assert.equal(new Set(THEME_IDS).size, DOC_THEMES.length, 'theme ids must be unique');
  for (const t of DOC_THEMES) {
    assert.ok(t.label.trim(), `${t.id} needs a Persian label`);
    assert.deepEqual(THEME_COLORS[t.id], [t.accent, t.tint]);
    for (const hex of [t.accent, t.tint, t.paper]) assert.match(hex, /^#[0-9a-f]{6}$/, `${t.id}: ${hex}`);
  }
});

test('an unknown or brand theme still resolves to a real sheet', () => {
  assert.deepEqual(themeColors({ theme: 'does-not-exist' }), THEME_COLORS.navy);
  assert.deepEqual(themePaper({ theme: 'does-not-exist' }), { paper: '#fffefa', rule: '' });
  assert.deepEqual(themePaper({ theme: 'brand' }), { paper: '#fffefa', rule: '' });
  assert.deepEqual(themeColors({ theme: 'brand', brandColors: { primary: '#123456' } }), ['#123456', '#123456']);
});

test('only the notebook draws lines, and it draws them in an export too', () => {
  const ruled = DOC_THEMES.filter((t) => t.rule);
  assert.equal(ruled.length, 1);
  assert.equal(ruled[0].id, 'daftarche');
  assert.equal(ruleCSS(''), '', 'a theme without lines adds no CSS at all');
  assert.match(ruleCSS(ruled[0].rule), /repeating-linear-gradient/);
  assert.ok(ruleCSS(ruled[0].rule).includes(ruled[0].rule));
  // the preview paints the same lines
  assert.match(block('daftarche'), /repeating-linear-gradient/);
});
