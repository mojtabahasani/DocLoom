// Automatic bidirectional (LTR/RTL) detection for mixed Latin and Persian documents.

const LTR_RE = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;
const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

const BLOCK_SEL = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, aside.callout, header.cover, div.card, nav.toc';

/**
 * Return 'ltr', 'rtl', or null based on the first strong directional letter in `text`.
 */
export function detectTextDir(text) {
  const s = String(text || '');
  for (const ch of s) {
    if (LTR_RE.test(ch)) return 'ltr';
    if (RTL_RE.test(ch)) return 'rtl';
  }
  return null;
}

/** Collect text inside `el` while ignoring code/svg blocks and chrome labels like `.callout-title`. */
function blockText(el) {
  const skipClass = el.matches?.('aside.callout') ? 'callout-title' : el.matches?.('nav.toc') ? 'toc-title' : '';
  let out = '';
  const walk = (node) => {
    for (const child of node.childNodes || []) {
      if (child.nodeType === 3) {
        out += child.nodeValue || '';
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = String(child.tagName || '').toUpperCase();
      if (tag === 'CODE' || tag === 'PRE' || tag === 'SVG') continue;
      if (skipClass && child.classList?.contains(skipClass)) continue;
      walk(child);
    }
  };
  walk(el);
  return out;
}

function setDir(el, dir) {
  if (el && el.getAttribute('dir') !== dir) el.setAttribute('dir', dir);
}

function clearDir(el) {
  if (el && el.hasAttribute('dir')) el.removeAttribute('dir');
}

function applyDir(el, dir) {
  if (dir) setDir(el, dir);
  else clearDir(el);
}

function resolveDir(el) {
  return detectTextDir(blockText(el)) ?? detectTextDir(el.textContent);
}

/**
 * Stamp `dir="ltr"` / `dir="rtl"` on blocks, lists, tables, and the root container.
 */
export function applyBidi(root, fallbackDir = 'rtl') {
  if (!root?.querySelectorAll) return;

  for (const el of root.querySelectorAll(BLOCK_SEL)) {
    applyDir(el, resolveDir(el));
  }

  for (const list of root.querySelectorAll('ul, ol')) {
    let dir = null;
    for (const li of list.children || []) {
      if (String(li.tagName || '').toUpperCase() !== 'LI') continue;
      dir = resolveDir(li);
      if (dir) break;
    }
    dir ??= resolveDir(list);
    applyDir(list, dir);
  }

  for (const table of root.querySelectorAll('table:not(.stmt)')) {
    applyDir(table, resolveDir(table));
  }

  let docDir = null;
  for (const child of root.children || []) {
    if (child.hasAttribute?.('data-md2-furniture') || child.classList?.contains('masthead') || child.classList?.contains('page-footer')) continue;
    if (String(child.tagName || '').toUpperCase() === 'HR') continue;
    docDir = resolveDir(child);
    if (docDir) break;
  }
  docDir ??= resolveDir(root) ?? fallbackDir;
  setDir(root, docDir);
}
