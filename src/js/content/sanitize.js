// HTML sanitizer. DOM is injected through `env` ({ DOMParser, document }) so it can run under node tests.
import { safeURL } from './url.js';

const ALLOWED = new Set(
  ('ARTICLE HEADER FOOTER SECTION MAIN DIV P BR H1 H2 H3 H4 H5 H6 STRONG B EM I U S DEL MARK SUP SUB SMALL A CODE PRE ' +
    'UL OL LI BLOCKQUOTE HR TABLE CAPTION THEAD TBODY TFOOT TR TH TD IMG ASIDE SPAN FONT FIGURE FIGCAPTION NAV').split(' '),
);
// Dropped together with their content.
const DROPPED = new Set(
  'SCRIPT STYLE IFRAME OBJECT EMBED FORM INPUT BUTTON SELECT TEXTAREA SVG MATH NOSCRIPT TEMPLATE LINK META BASE APPLET FRAME FRAMESET AUDIO VIDEO CANVAS'.split(' '),
);
const CLASSES = new Set(
  ('card card-label cover subtitle masthead repeat-header page-footer repeat-footer doc-image link-button ' +
    'callout callout-note callout-tip callout-important callout-warning callout-caution callout-title task task-done task-list ' +
    'toc toc-title chart chart-svg code tok-k tok-s tok-c tok-n tok-f tok-a ' +
    'letter-head letter-top letter-meta letter-line letter-subject letter-to letter-greeting letter-sign sign-box sign-area sig-img stamp-img signer qr-box qr-inline qr-svg').split(' '),
);
const HEADING_ID = /^s-[\p{L}\p{N}-]{1,70}$/u;
const HASH_LINK = /^#s-[\p{L}\p{N}-]{1,70}$/u;
const LANG_LABEL = /^[a-z0-9+#.-]{1,12}$/;

// SVG is dropped everywhere EXCEPT our own chart and QR code (<svg class="chart-svg|qr-svg">), rebuilt from a strict whitelist:
// no scripts, handlers, links, <use>, <image>, <foreignObject>, <style>; only plain geometry/paint attributes.
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set('svg g rect path line polyline circle text tspan title'.split(' '));
const NUM = /^-?\d+(\.\d+)?(px|%|em)?$/;
const COLOR = /^(none|#[0-9a-f]{3,8})$/i;
const SVG_ATTRS = {
  viewBox: /^[\d.\s-]{1,40}$/,
  x: NUM, y: NUM, x1: NUM, y1: NUM, x2: NUM, y2: NUM, cx: NUM, cy: NUM, r: NUM, rx: NUM, ry: NUM, dy: NUM, width: NUM, height: NUM,
  d: /^[MmLlHhVvAaZzCcQqSsTt\d.,\s-]{1,40000}$/, // QR codes are one long path of module runs
  points: /^[\d.,\s-]{1,4000}$/,
  fill: COLOR, stroke: COLOR,
  'stroke-width': NUM, 'font-size': NUM, opacity: NUM, 'fill-opacity': NUM, 'stroke-opacity': NUM,
  'stroke-linecap': /^(butt|round|square)$/, 'stroke-linejoin': /^(miter|round|bevel)$/,
  'font-weight': /^(normal|bold|\d{3})$/, 'text-anchor': /^(start|middle|end)$/,
  transform: /^(rotate|translate)\([\d.,\s-]{1,40}\)$/,
  'shape-rendering': /^crispEdges$/,
  role: /^img$/, 'aria-label': /^[^<>]{0,200}$/,
};
const STYLE_PROPS = new Set(
  ('color background-color text-align font-weight font-style text-decoration font-size direction border border-right border-left ' +
    'border-top border-bottom border-collapse padding padding-left padding-right padding-top padding-bottom margin margin-left ' +
    'margin-right margin-top margin-bottom width height max-width max-height justify-content align-items object-fit vertical-align ' +
    'white-space list-style-type').split(' '),
);
const FONT_SIZES = { 1: '10px', 2: '13px', 3: '16px', 4: '18px', 5: '24px', 6: '32px', 7: '48px' };
const FURNITURE = new Set(['header', 'title', 'footer', 'letter', 'signature', 'qr']);
const SVG_ROOT = /(^|\s)(chart-svg|qr-svg)(\s|$)/;

export function cleanStyle(raw) {
  const out = [];
  for (const decl of String(raw || '').split(';')) {
    const p = decl.indexOf(':');
    if (p < 0) continue;
    const k = decl.slice(0, p).trim().toLowerCase();
    const v = decl.slice(p + 1).trim();
    if (!STYLE_PROPS.has(k) || !v || /url\s*\(|expression|javascript:|\\|[<>{}]/i.test(v)) continue;
    if (k === 'text-align' && !/^(left|right|center|justify|start|end)$/.test(v)) continue;
    if (k === 'justify-content' && !/^(space-between|center|flex-start|flex-end)$/.test(v)) continue;
    if (k === 'align-items' && !/^(center|flex-start|flex-end|stretch)$/.test(v)) continue;
    if (k === 'object-fit' && !/^(fill|contain|cover)$/.test(v)) continue;
    if (k === 'font-size' && !/^(\d+(\.\d+)?(px|pt|em|rem|%)|small|medium|large|x-large|xx-large)$/.test(v)) continue;
    out.push(k + ':' + v);
  }
  return out.join(';');
}

function defaultEnv() {
  return { DOMParser: globalThis.DOMParser, document: globalThis.document };
}

/** Returns a DocumentFragment (owned by env.document) with a sanitized copy of root's children. */
export function sanitizeChildren(root, env = defaultEnv()) {
  const doc = env.document;
  const copySvg = (n, root = true) => {
    const name = String(n.localName || n.tagName).toLowerCase();
    if (!SVG_TAGS.has(name)) return doc.createDocumentFragment();
    const e = doc.createElementNS(SVG_NS, name);
    for (const [a, re] of Object.entries(SVG_ATTRS)) {
      const v = n.getAttribute(a);
      if (v != null && re.test(v.trim())) e.setAttribute(a, v.trim());
    }
    if (root) {
      e.setAttribute('class', /(^|\s)qr-svg(\s|$)/.test(n.getAttribute('class') || '') ? 'qr-svg' : 'chart-svg');
      const st = cleanStyle(n.getAttribute('style'));
      if (st) e.setAttribute('style', st);
    }
    n.childNodes.forEach((x) => {
      if (x.nodeType === 3) e.append(doc.createTextNode(x.nodeValue || ''));
      else if (x.nodeType === 1) e.append(copySvg(x, false));
    });
    return e;
  };
  const copy = (n) => {
    if (n.nodeType === 3) return doc.createTextNode(n.nodeValue || '');
    if (n.nodeType !== 1) return doc.createDocumentFragment();
    const tag = String(n.tagName).toUpperCase();
    if (tag === 'SVG' && SVG_ROOT.test(n.getAttribute('class') || '')) return copySvg(n);
    if (DROPPED.has(tag)) return doc.createDocumentFragment();
    if (!ALLOWED.has(tag)) {
      const f = doc.createDocumentFragment();
      n.childNodes.forEach((x) => f.append(copy(x)));
      return f;
    }
    const e = doc.createElement(tag === 'FONT' ? 'span' : tag.toLowerCase());
    for (const a of ['alt', 'title', 'dir', 'lang']) if (n.hasAttribute(a)) e.setAttribute(a, n.getAttribute(a));
    if (tag === 'TD' || tag === 'TH') {
      for (const a of ['colspan', 'rowspan']) {
        const v = n.getAttribute(a);
        if (/^\d{1,3}$/.test(v || '')) e.setAttribute(a, v);
      }
    }
    if (/^H[1-6]$/.test(tag) && HEADING_ID.test(n.getAttribute('id') || '')) e.setAttribute('id', n.getAttribute('id'));
    if (tag === 'PRE' && LANG_LABEL.test(n.getAttribute('data-lang') || '')) e.setAttribute('data-lang', n.getAttribute('data-lang'));
    const fur = n.getAttribute('data-md2-furniture');
    if (FURNITURE.has(fur)) e.setAttribute('data-md2-furniture', fur);
    const classes = (n.getAttribute('class') || '').split(/\s+/).filter((c) => CLASSES.has(c));
    if (classes.length) e.setAttribute('class', classes.join(' '));
    let style = cleanStyle(n.getAttribute('style'));
    if (tag === 'FONT') {
      const color = n.getAttribute('color') || '';
      if (/^(#[0-9a-f]{3,8}|[a-z]{1,20})$/i.test(color)) style += (style ? ';' : '') + 'color:' + color;
      const size = FONT_SIZES[n.getAttribute('size')];
      if (size) style += (style ? ';' : '') + 'font-size:' + size;
    }
    if (style) e.setAttribute('style', style);
    if (tag === 'A') {
      const u = safeURL(n.getAttribute('href') || '');
      if (u) {
        e.setAttribute('href', u);
        e.setAttribute('rel', 'noopener noreferrer');
        if (n.getAttribute('target') === '_blank') e.setAttribute('target', '_blank');
      } else if (HASH_LINK.test(n.getAttribute('href') || '')) e.setAttribute('href', n.getAttribute('href'));
    }
    if (tag === 'IMG') {
      const u = safeURL(n.getAttribute('src') || '', { image: true });
      if (!u) return doc.createDocumentFragment();
      e.setAttribute('src', u);
      e.setAttribute('loading', 'lazy');
    }
    n.childNodes.forEach((x) => e.append(copy(x)));
    return e;
  };
  const f = doc.createDocumentFragment();
  root.childNodes.forEach((x) => f.append(copy(x)));
  return f;
}

/** Parse an HTML string inertly (DOMParser: nothing executes or loads) and return the parsed Document. */
export function parseHTMLDocument(html, env = defaultEnv()) {
  return new env.DOMParser().parseFromString(String(html), 'text/html');
}

/** Sanitize an HTML string into a DocumentFragment. */
export function sanitizeToFragment(html, env = defaultEnv()) {
  return sanitizeChildren(parseHTMLDocument(html, env).body, env);
}

/** Sanitize an HTML string into an HTML string. */
export function sanitizeHTML(html, env = defaultEnv()) {
  const box = env.document.createElement('div');
  box.append(sanitizeToFragment(html, env));
  return box.innerHTML;
}
