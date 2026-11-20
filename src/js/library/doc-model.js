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

/**
 * The four layout images that normally come from the brand. They are base64 data URIs — together
 * about 5 MB — and storing them inside every document is what grew this library to 215 MB: the same
 * letterhead, stamp, footer and signature copied into every document AND every version, while the
 * document already names its `brandId` and the brand itself is stored once.
 *
 * So a document stores an image only when it differs from its brand's. When it matches, the key is
 * left out and listed in `layout.brandImages`, and `docToPatch` fills it back in from the brand.
 * A document with no brand, or one whose image was overridden, keeps its own copy exactly as before.
 * Mirrors IMAGE_FIELDS in brand/brand-model.js — tests/library.test.mjs asserts the two agree.
 */
export const BRAND_IMAGE_KEYS = ['mastheadImage', 'footerImage', 'signatureImage', 'stampImage'];

export const newId = (prefix = 'd') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * Build the persisted record from app state. `meta` holds {tags, pinned, createdAt}.
 * `brand` is the record `state.brandId` names, when there is one: images it already holds are
 * referenced instead of copied (see BRAND_IMAGE_KEYS).
 */
export function captureDoc({ id, state, html, text, meta = {}, now = Date.now(), brand = null }) {
  const layout = Object.fromEntries(LAYOUT_KEYS.map((k) => [k, state[k]]));
  const brandId = state.brandId || meta.brandId || null;
  const inherited = [];
  if (brand && brand.id === brandId) {
    for (const k of BRAND_IMAGE_KEYS) {
      if (layout[k] && layout[k] === brand[k]) {
        inherited.push(k);
        delete layout[k];
      }
    }
  }
  if (inherited.length) layout.brandImages = inherited;
  return {
    id,
    title: state.title || '',
    subtitle: state.subtitle || '',
    source: state.source || '',
    sourceType: 'md',
    html,
    text: String(text || '').slice(0, MAX_TEXT),
    mode: state.mode === 'letter' ? 'letter' : state.webLayout ? 'web' : 'doc',
    brandId,
    link: state.link || null,
    watermark: state.watermark || { preset: 'none', text: '' },
    letter: state.letter || null,
    tags: meta.tags || [],
    pinned: !!meta.pinned,
    createdAt: meta.createdAt || now,
    updatedAt: now,
    layout,
  };
}

/**
 * Store patch that fully restores a document (HTML is applied separately, after sanitizing).
 * `brand` supplies the images the document references rather than carries. Documents saved before
 * that existed hold their own copy and need no brand — the inherited list is simply empty.
 */
export function docToPatch(doc, brand = null) {
  const patch = { title: doc.title || '', subtitle: doc.subtitle || '', source: doc.source || '', webLayout: doc.mode === 'web', mode: doc.mode === 'letter' ? 'letter' : 'doc', brandId: doc.brandId || null, link: doc.link || null };
  patch.watermark = doc.watermark || { preset: 'none', text: '' };
  patch.letter = doc.letter || BLANK_LETTER;
  const inherited = new Set(Array.isArray(doc.layout?.brandImages) ? doc.layout.brandImages : []);
  for (const k of LAYOUT_KEYS) {
    // Inheritance fills a gap, it never overrules. A record that carries the image itself keeps it —
    // which is what makes restoring a version safe: `restoreVersion` merges two layouts, and the
    // version's own overridden image must win over the brand's.
    if (inherited.has(k) && (!doc.layout || doc.layout[k] === undefined)) patch[k] = (brand && brand[k]) || '';
    else patch[k] = doc.layout && doc.layout[k] !== undefined ? doc.layout[k] : LAYOUT_FALLBACK[k] ?? undefined;
  }
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
  return patch;
}

/**
 * The document with its referenced images written back in — the shape it had before images were
 * referenced. Two records can then be compared for equal *content* even when one carries its images
 * and the other inherits them, which is what the library looks like while a migration is half
 * propagated (slim on the server, still fat in a browser that has not saved since).
 */
export function resolveBrandImages(doc, brand = null) {
  const inherited = Array.isArray(doc?.layout?.brandImages) ? doc.layout.brandImages : null;
  if (!inherited) return doc;
  const layout = { ...doc.layout };
  delete layout.brandImages;
  for (const k of inherited) if (layout[k] === undefined) layout[k] = (brand && brand[k]) || '';
  return { ...doc, layout };
}

/**
 * Drop image copies a document shares with its brand. Used by captureDoc and by the one-off
 * migration that shrinks documents saved before this existed. Returns the record unchanged when
 * there is nothing to drop, so a caller can tell whether a rewrite is needed.
 */
export function dedupeBrandImages(doc, brand) {
  if (!doc || !brand || !doc.layout || doc.brandId !== brand.id) return doc;
  const already = new Set(Array.isArray(doc.layout.brandImages) ? doc.layout.brandImages : []);
  const layout = { ...doc.layout };
  let hit = false;
  for (const k of BRAND_IMAGE_KEYS) {
    if (layout[k] && layout[k] === brand[k]) {
      already.add(k);
      delete layout[k];
      hit = true;
    }
  }
  if (!hit) return doc;
  layout.brandImages = [...already];
  return { ...doc, layout };
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
