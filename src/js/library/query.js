// Library list filtering and sorting. Pure.
import { normalize } from '../ui/fuzzy.js';
import { displayTitle } from './doc-model.js';

export const SORTS = { recent: 'تازه‌ترین', title: 'عنوان', created: 'تاریخ ساخت' };

export function allTags(docs) {
  const counts = new Map();
  for (const d of docs) for (const t of d.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa')).map(([t]) => t);
}

/** Search in title + text (+ source, tags); AND over whitespace-separated tokens. Pinned documents come first. */
export function queryDocs(docs, { query = '', tag = '', sort = 'recent' } = {}) {
  const tokens = normalize(query).split(' ').filter(Boolean);
  let rows = docs.filter((d) => !tag || (d.tags || []).includes(tag));
  if (tokens.length) {
    rows = rows
      .map((d) => {
        const title = normalize(displayTitle(d));
        const body = normalize(`${d.subtitle || ''} ${d.text || ''} ${d.source || ''} ${(d.tags || []).join(' ')}`);
        let score = 0;
        for (const t of tokens) {
          if (title.includes(t)) score += 10;
          else if (body.includes(t)) score += 1;
          else return null;
        }
        return { d, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.d);
    // keep relevance order, but still float pinned docs
    return rows.slice().sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  }
  const cmp = {
    recent: (a, b) => b.updatedAt - a.updatedAt,
    created: (a, b) => b.createdAt - a.createdAt,
    title: (a, b) => displayTitle(a).localeCompare(displayTitle(b), 'fa'),
  }[sort] || ((a, b) => b.updatedAt - a.updatedAt);
  return rows.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || cmp(a, b));
}
