// Table of contents + reading time. Pure (no DOM).
import { escapeHTML } from './markdown.js';

export const ID_PREFIX = 's-'; // keeps heading ids from colliding with the app's own element ids

/** Unicode-aware slug that keeps Persian letters/digits; ZWNJ and punctuation become hyphens. */
export function slugify(text) {
  const s = String(text ?? '')
    .normalize('NFKC')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return s || 'section';
}

/** Returns a slug not in `used` (and adds it): x, x-2, x-3 ... */
export function uniqueSlug(base, used) {
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  used.add(slug);
  return slug;
}

/** headings: [{ level, text, id }] in document order -> nested tree of levels min..max. */
export function buildToc(headings, { min = 1, max = 3 } = {}) {
  const root = { level: min - 1, children: [] };
  const stack = [root];
  for (const h of headings) {
    if (h.level < min || h.level > max) continue;
    const node = { level: h.level, text: h.text, id: h.id, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= h.level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root.children;
}

/** In-page TOC block (links point at heading ids; sanitizer keeps '#id' hrefs). */
export function tocHTML(tree, title = 'فهرست مطالب') {
  const list = (items) =>
    `<ul>${items.map((n) => `<li><a href="#${escapeHTML(n.id)}">${escapeHTML(n.text)}</a>${n.children.length ? list(n.children) : ''}</li>`).join('')}</ul>`;
  return `<nav class="toc"><p class="toc-title">${escapeHTML(title)}</p>${list(tree)}</nav>`;
}

/** Estimated reading time in minutes (Persian ~200 words/min), at least 1. */
export function readingMinutes(text, wpm = 200) {
  const words = (String(text ?? '').match(/[\p{L}\p{N}]+/gu) || []).length;
  return { words, minutes: Math.max(1, Math.ceil(words / wpm)) };
}
