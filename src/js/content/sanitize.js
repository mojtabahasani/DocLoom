// HTML sanitizer. DOM is injected through `env` ({ DOMParser, document }) so it can run under node tests.
import { safeURL } from './url.js';

const ALLOWED = new Set(
  ('ARTICLE HEADER FOOTER SECTION MAIN DIV P BR H1 H2 H3 H4 H5 H6 STRONG B EM I U S DEL MARK SUP SUB SMALL A CODE PRE ' +
    'UL OL LI BLOCKQUOTE HR TABLE CAPTION THEAD TBODY TFOOT TR TH TD IMG ASIDE SPAN FONT FIGURE FIGCAPTION').split(' '),
);
// Dropped together with their content.
const DROPPED = new Set(
  'SCRIPT STYLE IFRAME OBJECT EMBED FORM INPUT BUTTON SELECT TEXTAREA SVG MATH NOSCRIPT TEMPLATE LINK META BASE APPLET FRAME FRAMESET AUDIO VIDEO CANVAS'.split(' '),
);
const CLASSES = new Set(
  'card card-label cover subtitle masthead repeat-header page-footer repeat-footer doc-image link-button'.split(' '),
);
const STYLE_PROPS = new Set(
  ('color background-color text-align font-weight font-style text-decoration font-size direction border border-right border-left ' +
    'border-top border-bottom border-collapse padding padding-left padding-right padding-top padding-bottom margin margin-left ' +
    'margin-right margin-top margin-bottom width height max-width max-height justify-content align-items object-fit vertical-align ' +
    'white-space list-style-type').split(' '),
);
const FONT_SIZES = { 1: '10px', 2: '13px', 3: '16px', 4: '18px', 5: '24px', 6: '32px', 7: '48px' };
const FURNITURE = new Set(['header', 'title', 'footer']);

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
  const copy = (n) => {
    if (n.nodeType === 3) return doc.createTextNode(n.nodeValue || '');
    if (n.nodeType !== 1) return doc.createDocumentFragment();
    const tag = String(n.tagName).toUpperCase();
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
      }
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
