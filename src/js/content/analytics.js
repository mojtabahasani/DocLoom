// Content analytics. Pure: callers pass text + counts.
import { toFaDigits } from './persian.js';

export function analyze({ text = '', htmlBytes = 0, links = 0, images = 0, tables = 0, headings = 0 }) {
  const lines = text ? text.split(/\r\n?|\n/).length : 0;
  const chars = Array.from(text).length;
  const noSpace = Array.from(text.replace(/\s/g, '')).length;
  const words = (text.match(/[\p{L}\p{N}]+/gu) || []).length;
  const size = htmlBytes < 1024 ? toFaDigits(htmlBytes) + ' بایت' : toFaDigits((htmlBytes / 1024).toFixed(1)) + ' کیلوبایت';
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
