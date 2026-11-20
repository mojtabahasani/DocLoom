// The document's colour themes: the one list the whole app reads (pure data; no DOM, no imports).
//
// `accent` paints headings, the table header and the bar down a quote; `tint` is the wash behind a
// quote, a card or a cover; `paper` is the sheet itself; `rule` — only the notebook — draws the
// ruled lines across it. The four palettes after the original ones come from Darwin's theme pack
// (`darwinapp/packages/style/themes` and `apps/style-lab/src/styles/themes.css`): دفتر = t2,
// نقشه = t4, شب‌کار = t3, سونار = t5. Every accent clears 4.5:1 against its own paper and carries
// white text on itself, which is what the table header needs.
//
// `src/styles/document.css` repeats these values as `.paper[data-doc-theme=…]` rules, because the
// preview is styled by CSS, not by script. `tests/doc-themes.test.mjs` asserts the two agree, so
// the duplication cannot drift.
export const DOC_THEMES = [
  { id: 'navy', label: 'رسمی', accent: '#1c5263', tint: '#edf3f2', paper: '#fffefa' },
  { id: 'green', label: 'سبز', accent: '#286b57', tint: '#edf5ee', paper: '#fffefa' },
  { id: 'warm', label: 'گرم', accent: '#925f37', tint: '#f8efdf', paper: '#fffaf1' },
  { id: 'mono', label: 'ساده', accent: '#353b40', tint: '#f0f1f1', paper: '#fffefa' },
  { id: 'daftar', label: 'دفتر', accent: '#24486f', tint: '#e9eef6', paper: '#ffffff' },
  { id: 'naghsheh', label: 'نقشه', accent: '#1737c6', tint: '#e4eaf9', paper: '#fbfcff' },
  { id: 'shabkar', label: 'شب‌کار', accent: '#8a6314', tint: '#f4ecdc', paper: '#faf9f6' },
  { id: 'sonar', label: 'سونار', accent: '#0e6e77', tint: '#e2f0ef', paper: '#ffffff' },
  { id: 'daftarche', label: 'دفترچه', accent: '#2e4a7d', tint: '#eaeff7', paper: '#fdfcf8', rule: '#d7deea' },
];

export const THEME_IDS = DOC_THEMES.map((t) => t.id);
const BY_ID = Object.fromEntries(DOC_THEMES.map((t) => [t.id, t]));
/** Legacy shape kept for the chart, docx and email exporters: { id: [accent, tint] }. */
export const THEME_COLORS = Object.fromEntries(DOC_THEMES.map((t) => [t.id, [t.accent, t.tint]]));

export const FONT_STACK = "Vazirmatn,'Segoe UI',Tahoma,Arial,sans-serif";

/** [accent, tint] for the current settings snapshot (custom brand colours win when the brand theme is on). */
export function themeColors(s) {
  const custom = s.theme === 'brand' && s.brandColors?.primary ? [s.brandColors.primary, s.brandColors.accent || s.brandColors.primary] : null;
  return custom || THEME_COLORS[s.theme] || THEME_COLORS.navy;
}

/** The sheet itself: { paper, rule } — `rule` is '' unless the theme draws lines on the page. */
export function themePaper(s) {
  const t = (s.theme === 'brand' ? BY_ID.navy : BY_ID[s.theme]) || BY_ID.navy;
  return { paper: t.paper, rule: t.rule || '' };
}

/**
 * The ruled lines of the notebook theme, as CSS a standalone export can carry.
 * One line every two ems, which is exactly the document's line height, so body text sits on them;
 * a heading breaks the rhythm, the way writing across the lines of a real notebook does.
 */
export const ruleCSS = (colour) =>
  colour
    ? `background-image:repeating-linear-gradient(180deg,transparent 0 calc(2em - 1px),${colour} calc(2em - 1px),${colour} 2em);background-attachment:local;`
    : '';
