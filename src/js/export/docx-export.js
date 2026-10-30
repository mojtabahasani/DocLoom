// Browser side of the Word export: reads the document, rasterises images (WebP/GIF/SVG -> PNG), builds and returns the .docx bytes.
import { store } from '../core/store.js';
import { sanitizeChildren } from '../content/sanitize.js';
import { preview } from '../editor/preview.js';
import { buildDocx, imageSize } from './docx.js';
import { domToBlocks } from './docx-dom.js';
import { THEME_COLORS, embeddedFontCSS } from './html.js';

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const canvasToBytes = async (cv) => new Uint8Array(await (await new Promise((r) => cv.toBlob(r, 'image/png'))).arrayBuffer());

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('image'));
    im.src = src;
  });
}

/** data: URL of any supported raster format -> {bytes, ext, w, h} (PNG/JPEG kept as-is, others redrawn as PNG). */
export async function rasterFromSrc(src) {
  const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(src);
  if (m) {
    const bytes = b64ToBytes(m[2]);
    const info = imageSize(bytes);
    if (info && info.w) return { bytes, ext: info.ext, w: info.w, h: info.h };
  }
  const im = await loadImage(src);
  const cv = document.createElement('canvas');
  cv.width = im.naturalWidth;
  cv.height = im.naturalHeight;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(im, 0, 0);
  return { bytes: await canvasToBytes(cv), ext: 'png', w: cv.width, h: cv.height };
}

/** Inline SVG markup (our charts / QR) -> PNG at 3x, with the embedded Persian font so chart labels shape correctly. */
export async function rasterFromSvg(markup, box = {}) {
  const font = embeddedFontCSS();
  let svg = markup.includes('xmlns=') ? markup : markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  const w = box.w || 400;
  const h = box.h || 300;
  svg = svg
    .replace(/^<svg[^>]*>/, (tag) => tag.replace(/\s(?:style|width|height)="[^"]*"/g, '').replace('<svg', `<svg width="${w}" height="${h}"`))
    .replace(/(<svg[^>]*>)/, (tag) => `${tag}<style>${font}text{font-family:Vazirmatn,Tahoma,sans-serif}</style>`);
  const im = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  if (document.fonts?.ready) await document.fonts.ready;
  const k = Math.max(3, Math.ceil(480 / w));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * k);
  cv.height = Math.round(h * k);
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(im, 0, 0, cv.width, cv.height);
  return { bytes: await canvasToBytes(cv), ext: 'png', w, h };
}

/** Fills model.images and rewrites placeholder blocks ({src}/{svg}) into {id,w,h}. Unreadable images are dropped. */
async function resolveImages(blocks) {
  const images = {};
  let n = 0;
  const add = (meta) => {
    const id = 'img' + ++n;
    images[id] = meta;
    return { id, w: meta.w, h: meta.h };
  };
  const one = async (b) => {
    try {
      if (b.svg) {
        const r = add(await rasterFromSvg(b.svg, b));
        return { ...r, w: b.w || r.w, h: b.h || r.h };
      }
      if (b.src) return add(await rasterFromSrc(b.src));
    } catch {
      /* skip */
    }
    return null;
  };
  const out = [];
  for (const b of blocks) {
    if (b.k === 'img') {
      const r = await one(b);
      if (r) out.push({ ...b, ...r, src: undefined, svg: undefined });
    } else if (b.k === 'sign') {
      const imgs = [];
      for (const s of b.imgSrcs) {
        const r = await one(s);
        if (r) imgs.push({ ...r, w: Math.min(r.w, 140), h: Math.round((r.h * Math.min(r.w, 140)) / r.w) });
      }
      out.push({ ...b, imgs });
    } else if (b.k === 'letterMeta' && b.qrSvg) {
      const r = await one({ svg: b.qrSvg, ...b.qrBox });
      out.push({ ...b, qr: r || undefined });
    } else out.push(b);
  }
  return { blocks: out, images, add, one };
}

/** Builds the .docx from the live document. Throws a Persian Error on failure; never touches document state. */
export async function buildDocxFromPreview() {
  const s = store.snapshot();
  const [accentHex] = s.theme === 'brand' && s.brandColors?.primary ? [s.brandColors.primary] : THEME_COLORS[s.theme] || THEME_COLORS.navy;
  const accent = accentHex.replace('#', '').toUpperCase();
  const root = document.createElement('div');
  root.append(sanitizeChildren(preview));
  const { blocks, images, one } = await resolveImages(domToBlocks(root, { accent }));
  const band = async (text, src, on) => {
    if (!on) return null;
    const img = src ? await one({ src }) : null;
    if (!text && !img) return null;
    const scale = img ? Math.min(1, 150 / img.w, 45 / img.h) : 1;
    return { text, image: img ? { ...img, w: Math.round(img.w * scale), h: Math.round(img.h * scale) } : undefined };
  };
  // Brands may paint the masthead/footer straight into the document, so fall back to what the preview shows.
  const fromDom = (kind) => {
    const n = preview.querySelector(`[data-md2-furniture="${kind}"]`);
    return n ? { text: (n.textContent || '').trim(), src: n.querySelector('img')?.getAttribute('src') || '' } : { text: '', src: '' };
  };
  const hd = fromDom('header');
  const ft = fromDom('footer');
  const header = await band(s.masthead || hd.text, s.mastheadImage || hd.src, s.showHeader && (s.masthead || s.mastheadImage || hd.text || hd.src));
  const footer = await band(s.footerText || ft.text, s.footerImage || ft.src, s.showFooter && (s.footerText || s.footerImage || ft.text || ft.src));
  return buildDocx({ title: s.title, accent, blocks, header, footer, images, created: new Date().toISOString().replace(/\.\d+Z$/, 'Z') });
}
