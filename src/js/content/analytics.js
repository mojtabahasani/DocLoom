// Content analytics. Pure: callers pass text + counts.
import { toFaDigits } from './persian.js';

export function analyze({ text = '', htmlBytes = 0, links = 0, images = 0, tables = 0, headings = 0, lang = 'fa' }) {
  const en = lang === 'en';
  const fmt = (v) => (en ? String(v) : toFaDigits(v));
  const lines = text ? text.split(/\r\n?|\n/).length : 0;
  const chars = Array.from(text).length;
  const noSpace = Array.from(text.replace(/\s/g, '')).length;
  const words = (text.match(/[\p{L}\p{N}]+/gu) || []).length;
  const kb = (htmlBytes / 1024).toFixed(1);
  const size = en
    ? htmlBytes < 1024 ? fmt(htmlBytes) + ' B' : fmt(kb) + ' KB'
    : htmlBytes < 1024 ? toFaDigits(htmlBytes) + ' بایت' : toFaDigits(kb) + ' کیلوبایت';
  if (en) {
    return [
      ['Lines', fmt(lines)],
      ['Characters', fmt(chars)],
      ['No Spaces', fmt(noSpace)],
      ['Words', fmt(words)],
      ['Approx. Size', size],
      ['Links', fmt(links)],
      ['Images', fmt(images)],
      ['Tables / Headings', fmt(tables) + ' / ' + fmt(headings)],
    ];
  }
  return [
    ['سطر', toFaDigits(lines)],
    ['نویسه', toFaDigits(chars)],
    ['بدون فاصله', toFaDigits(noSpace)],
    ['واژه', toFaDigits(words)],
    ['حجم تقریبی', size],
    ['لینک', toFaDigits(links)],
    ['تصویر', toFaDigits(images)],
    ['جدول / تیتر', toFaDigits(tables) + ' / ' + toFaDigits(headings)],
  ];
}
