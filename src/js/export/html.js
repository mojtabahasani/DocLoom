// "Plain HTML" export: standalone, print-ready document built from the current preview.
import { store } from '../core/store.js';
import { sanitizeChildren } from '../content/sanitize.js';
import { escapeHTML } from '../content/markdown.js';
import { preview } from '../editor/preview.js';
import { assignHeadingIds } from '../content/toc-dom.js';
import BLOCKS_CSS from '../../styles/blocks.css';

export const THEME_COLORS = {
  navy: ['#1c5263', '#edf3f2'],
  green: ['#286b57', '#edf5ee'],
  warm: ['#925f37', '#f8efdf'],
  mono: ['#353b40', '#f0f1f1'],
};

const FONT_STACK = "Vazirmatn,'Segoe UI',Tahoma,Arial,sans-serif";

const BASE_CSS =
  `body{margin:0;padding:30px 18px;background:#f5f6f4;color:#24383b;font-family:${FONT_STACK};direction:rtl;line-height:1.9}` +
  'main{max-width:780px;margin:auto;padding:50px 58px;background:#fffefa}h1,h2,h3,h4{color:var(--accent);break-after:avoid}' +
  'blockquote,.card,.cover{background:var(--tint);padding:13px 17px;border-right:4px solid var(--accent);margin:16px 0;break-inside:avoid}' +
  'blockquote>p:first-child{margin-top:0}blockquote>p:last-child{margin-bottom:0}' +
  'table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px;text-align:right}th{background:var(--accent);color:#fff}' +
  'pre,code{direction:ltr;text-align:left;background:#f1f2f1}pre{padding:12px;white-space:pre-wrap}' +
  '.doc-image{max-width:100%;height:auto}.link-button{display:inline-block;background:var(--accent);padding:8px 14px;color:white!important;text-decoration:none}' +
  '.masthead{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #ddd;padding-bottom:12px;margin-bottom:20px}' +
  '.masthead img{max-height:55px;max-width:145px;object-fit:contain}' +
  '.page-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:28px;padding-top:8px;border-top:1px solid #dce4de;color:#64736d;font-size:.85em}' +
  '.page-footer img{max-width:220px;max-height:55px;object-fit:contain}' +
  '.cover h1{border:0;margin:0}.subtitle{color:#718087}' +
  '@media print{body{padding:0;background:white}main{max-width:none;padding:0}h1,h2,h3{break-after:avoid-page}blockquote,.card,.doc-image{break-inside:avoid}thead{display:table-header-group}tr{break-inside:avoid}}';

export function embeddedFontCSS() {
  return document.getElementById('md2html-font')?.textContent || '';
}

export function buildExportHTML(s = store.snapshot(), root = preview) {
  const main = document.createElement('main');
  main.className = 'md-export';
  main.style.fontSize = s.font + 'px';
  main.append(sanitizeChildren(root));
  if (main.querySelector('nav.toc')) assignHeadingIds(main); // in-page TOC links need heading ids
  const [accent, tint] = THEME_COLORS[s.theme] || THEME_COLORS.navy;
  const top = s.repeatHeader ? '18mm' : '0';
  const bottom = s.repeatFooter ? '16mm' : '0';
  const off = Math.max(8, s.margin - 5);
  const repeatCSS =
    `@media print{main{padding-top:${top}!important;padding-bottom:${bottom}!important}` +
    `.repeat-header{position:fixed;top:-${off}mm;left:0;right:0;background:#fff;z-index:10}` +
    `.repeat-footer{position:fixed;bottom:-${off}mm;left:0;right:0;background:#fff;z-index:10}}`;
  const font = s.embedFontInExport ? embeddedFontCSS() : '';
  return (
    '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${escapeHTML(s.title || 'سند فارسی')}</title>` +
    `<style>${font}:root{--accent:${accent};--tint:${tint}}${BASE_CSS}${BLOCKS_CSS}@page{size:A4 portrait;margin:${s.margin}mm}${repeatCSS}</style>` +
    `</head><body>${main.outerHTML}</body></html>`
  );
}
