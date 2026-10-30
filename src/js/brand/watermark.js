// Watermark presets and markup (pure). The layer is plain DOM/CSS so screenshots, print and HTML export capture it.
import { escapeHTML } from '../content/markdown.js';

export const WATERMARK_PRESETS = [
  ['none', 'بدون واترمارک', ''],
  ['draft', 'پیش‌نویس', 'پیش‌نویس'],
  ['confidential', 'محرمانه', 'محرمانه'],
  ['final', 'نهایی', 'نهایی'],
  ['copy', 'رونوشت', 'رونوشت'],
  ['custom', 'متن دلخواه', ''],
];
export const WATERMARK_DEFAULT = { preset: 'none', text: '' };
export const WORD_NOTE = 'واترمارک در خروجی Word نیست؛ فقط در پیش‌نمایش، چاپ/PDF، HTML و تصویر دیده می‌شود.';

export function normalizeWatermark(w) {
  const o = w && typeof w === 'object' ? w : {};
  const preset = WATERMARK_PRESETS.some((p) => p[0] === o.preset) ? o.preset : 'none';
  return { preset, text: typeof o.text === 'string' ? o.text.trim().slice(0, 40) : '' };
}

/** The text drawn on the page, or '' for none. A custom preset with no text draws nothing. */
export function watermarkText(w) {
  const { preset, text } = normalizeWatermark(w);
  if (preset === 'custom') return text;
  return WATERMARK_PRESETS.find((p) => p[0] === preset)?.[2] || '';
}

/** Export/print layer: one fixed, centred diagonal label. Browsers repeat fixed elements on every printed page. */
export function watermarkExportHTML(w) {
  const t = watermarkText(w);
  return t ? `<div class="md-wm" aria-hidden="true"><span>${escapeHTML(t)}</span></div>` : '';
}

export const WATERMARK_CSS =
  '.md-wm{position:fixed;inset:0;display:grid;place-items:center;overflow:hidden;pointer-events:none;z-index:50}' +
  '.md-wm span{display:block;transform:rotate(-32deg);font-size:min(24vw,150px);font-weight:700;line-height:1.2;white-space:nowrap;' +
  'color:var(--accent);opacity:.1;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
  '@media print{.md-wm span{opacity:.12}}';
