// DOM side of the TOC: collect headings and give them stable ids. Takes any root (browser or linkedom).
import { slugify, uniqueSlug, ID_PREFIX } from './toc.js';

const VALID = new RegExp(`^${ID_PREFIX}[\\p{L}\\p{N}-]{1,70}$`, 'u');

export function collectHeadings(root) {
  return Array.from(root.querySelectorAll('h1,h2,h3')).filter((h) => !h.closest('[data-md2-furniture],.toc'));
}

/** Ensures every h1-h3 has a unique, stable id (existing valid ids are kept). Returns [{ el, level, text, id }]. */
export function assignHeadingIds(root) {
  const hs = collectHeadings(root);
  const used = new Set();
  const out = hs.map((el) => {
    const keep = VALID.test(el.id || '') && !used.has(el.id.slice(ID_PREFIX.length)) ? el.id : null;
    if (keep) used.add(keep.slice(ID_PREFIX.length));
    return { el, keep };
  });
  return out.map(({ el, keep }) => {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const id = keep || ID_PREFIX + uniqueSlug(slugify(text), used);
    if (el.id !== id) el.id = id;
    return { el, level: Number(el.tagName[1]), text, id };
  });
}
