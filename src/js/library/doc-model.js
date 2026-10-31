// Document record helpers for the library. Pure.
export const LAYOUT_KEYS = [
  'masthead', 'mastheadImage', 'footerText', 'footerImage', 'showTitle', 'showHeader', 'showFooter',
  'repeatHeader', 'repeatFooter', 'theme', 'font', 'margin', 'headerAlign', 'headerWidth', 'headerHeight',
  'footerAlign', 'footerWidth', 'footerHeight', 'brandColors', 'signatureImage', 'stampImage', 'qr',
];
// Layout keys added after v1 documents were saved: a document without them gets these, never the previous document's values.
const LAYOUT_FALLBACK = {
  brandColors: { primary: '', accent: '' }, signatureImage: '', stampImage: '',
  qr: { enabled: false, kind: 'url', value: '', position: 'footer', size: 84 },
};
const BLANK_LETTER = { number: '', date: '', attachments: '', recipient: '', subject: '', greeting: true, signer: { name: '', role: '' }, sig: { x: 30, y: 6 }, stamp: { x: 100, y: 16 } };
export const TRACKED_KEYS = new Set([...LAYOUT_KEYS, 'link', 'title', 'subtitle', 'source', 'webLayout', 'mode', 'brandId', 'letter', 'watermark']);
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
    mode: state.mode === 'letter' ? 'letter' : state.webLayout ? 'web' : 'doc',
    brandId: state.brandId || meta.brandId || null,
    link: state.link || null,
    watermark: state.watermark || { preset: 'none', text: '' },
    letter: state.letter || null,
    tags: meta.tags || [],
    pinned: !!meta.pinned,
    createdAt: meta.createdAt || now,
    updatedAt: now,
    layout: Object.fromEntries(LAYOUT_KEYS.map((k) => [k, state[k]])),
  };
}

/** Store patch that fully restores a document (HTML is applied separately, after sanitizing). */
export function docToPatch(doc) {
  const patch = { title: doc.title || '', subtitle: doc.subtitle || '', source: doc.source || '', webLayout: doc.mode === 'web', mode: doc.mode === 'letter' ? 'letter' : 'doc', brandId: doc.brandId || null, link: doc.link || null };
  patch.watermark = doc.watermark || { preset: 'none', text: '' };
  patch.letter = doc.letter || BLANK_LETTER;
  for (const k of LAYOUT_KEYS) patch[k] = doc.layout && doc.layout[k] !== undefined ? doc.layout[k] : LAYOUT_FALLBACK[k] ?? undefined;
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
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
