// Document record helpers for the library. Pure.
export const LAYOUT_KEYS = [
  'masthead', 'mastheadImage', 'footerText', 'footerImage', 'showTitle', 'showHeader', 'showFooter',
  'repeatHeader', 'repeatFooter', 'theme', 'font', 'margin', 'headerAlign', 'headerWidth', 'headerHeight',
  'footerAlign', 'footerWidth', 'footerHeight',
];
export const TRACKED_KEYS = new Set([...LAYOUT_KEYS, 'title', 'subtitle', 'source', 'webLayout']);
export const MAX_TEXT = 200000;

export const newId = (prefix = 'd') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Build the persisted record from app state. `meta` holds {tags, pinned, createdAt}. */
export function captureDoc({ id, state, html, text, meta = {}, now = Date.now() }) {
  return {
    id,
    title: state.title || '',
    subtitle: state.subtitle || '',
    source: state.source || '',
    sourceType: 'md',
    html,
    text: String(text || '').slice(0, MAX_TEXT),
    mode: state.webLayout ? 'web' : 'doc',
    brandId: meta.brandId || null,
    tags: meta.tags || [],
    pinned: !!meta.pinned,
    createdAt: meta.createdAt || now,
    updatedAt: now,
    layout: Object.fromEntries(LAYOUT_KEYS.map((k) => [k, state[k]])),
  };
}

/** Store patch that fully restores a document (HTML is applied separately, after sanitizing). */
export function docToPatch(doc) {
  const patch = { title: doc.title || '', subtitle: doc.subtitle || '', source: doc.source || '', webLayout: doc.mode === 'web' };
  for (const k of LAYOUT_KEYS) if (doc.layout && doc.layout[k] !== undefined) patch[k] = doc.layout[k];
  return patch;
}

export function displayTitle(doc) {
  if (doc.title && doc.title.trim()) return doc.title.trim();
  const first = String(doc.text || doc.source || '').split('\n').map((l) => l.replace(/^[#>*\-\s]+/, '').trim()).find(Boolean);
  return first ? first.slice(0, 60) : 'بدون عنوان';
}

export function isBlankDoc(doc) {
  return !String(doc.text || '').trim() && !doc.title?.trim() && !doc.subtitle?.trim() && !/<img/i.test(doc.html || '');
}

export function normalizeTags(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(/[,،;\n]/);
  const seen = new Set();
  const out = [];
  for (const t of raw) {
    const v = String(t).trim().replace(/\s+/g, ' ').slice(0, 30);
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
    if (out.length >= 12) break;
  }
  return out;
}
