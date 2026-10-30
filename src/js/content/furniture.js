// Header (masthead + title cover) and footer markup. Pure strings; callers run them through the sanitizer.
import { escapeHTML as e } from './markdown.js';
import { letterHTML, signatureHTML, footerQrHTML } from '../brand/letter.js';

const justify = (align) => (align === 'stretch' ? 'space-between' : align);

function figure(img, align, w, h, alt) {
  if (!img) return '';
  const fit = align === 'stretch' ? 'width:100%;max-width:100%;object-fit:fill' : `max-width:${w}px`;
  return `<img src="${e(img)}" alt="${e(alt)}" style="${fit};max-height:${h}px">`;
}

export function headerHTML(s) {
  let out = '';
  if (s.showHeader && (s.masthead || s.mastheadImage)) {
    out +=
      `<div class="masthead${s.repeatHeader ? ' repeat-header' : ''}" data-md2-furniture="header" style="justify-content:${justify(s.headerAlign)}">` +
      figure(s.mastheadImage, s.headerAlign, s.headerWidth || 220, s.headerHeight || 58, s.masthead || 'سربرگ') +
      (s.masthead ? `<strong>${e(s.masthead)}</strong>` : '') +
      '</div>';
  }
  if (s.showTitle && s.mode !== 'letter' && (s.title || s.subtitle)) { // a letter has its own «موضوع» instead of a cover
    out +=
      '<header class="cover" data-md2-furniture="title">' +
      (s.title ? `<h1>${e(s.title)}</h1>` : '') +
      (s.subtitle ? `<p class="subtitle">${e(s.subtitle)}</p>` : '') +
      '</header>';
  }
  return out + letterHTML(s);
}

export function footerHTML(s) {
  const extra = signatureHTML(s) + footerQrHTML(s);
  if (!(s.showFooter && (s.footerText || s.footerImage))) return extra;
  return (
    extra +
    `<div class="page-footer${s.repeatFooter ? ' repeat-footer' : ''}" data-md2-furniture="footer" style="justify-content:${justify(s.footerAlign)}">` +
    figure(s.footerImage, s.footerAlign, s.footerWidth || 220, s.footerHeight || 55, s.footerText || 'پاورقی') +
    (s.footerText ? `<span>${e(s.footerText)}</span>` : '') +
    '</div>'
  );
}
