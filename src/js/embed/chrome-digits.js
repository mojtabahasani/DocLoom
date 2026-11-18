// Embed mode with digits:'en': Latin digits in the app's own chrome (labels, menus, notices, tooltips).
// The document itself (preview, Markdown and HTML source, reader) and anything the user types are never touched:
// the document's digits are the author's, and generators already write the active script (core/digits.js).
import { HAS_LOCAL_DIGIT, toLatinDigits } from '../core/digits.js';

const SKIP = '#preview, #source, #sourcePane, .reader-scroll, textarea, script, style, [contenteditable], [data-md2-keep-digits]';
const ATTRS = ['title', 'placeholder', 'aria-label'];

const skipped = (el) => !el || !!el.closest(SKIP);

function fixText(node) {
  if (HAS_LOCAL_DIGIT.test(node.nodeValue) && !skipped(node.parentElement)) node.nodeValue = toLatinDigits(node.nodeValue);
}

function fixAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v && HAS_LOCAL_DIGIT.test(v)) el.setAttribute(a, toLatinDigits(v));
  }
}

/** Convert one subtree (an added node, or the whole body on start). */
export function latinizeTree(root) {
  if (root.nodeType === 3) return fixText(root);
  if (root.nodeType !== 1 || skipped(root)) return;
  fixAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 3) {
      if (HAS_LOCAL_DIGIT.test(n.nodeValue)) n.nodeValue = toLatinDigits(n.nodeValue);
    } else fixAttrs(n);
  }
}

export function startChromeDigits(root = document.body) {
  latinizeTree(root);
  const obs = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach(latinizeTree);
      else if (r.type === 'characterData') fixText(r.target);
      else if (r.type === 'attributes' && !skipped(r.target)) fixAttrs(r.target);
    }
  });
  obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  return obs;
}
