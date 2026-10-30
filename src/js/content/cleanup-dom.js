// AI-output cleanup on a DOM tree (the edited preview / HTML documents). Mutates `root` in place.
// Skips pre/code/svg and furniture; URL / e-mail text is protected exactly as in the Markdown driver.
import { cleanText, isPersian, makeRec, reportOf, isFillerParagraph, removeLeadEmoji, splitProtected, defaultRules } from './cleanup.js';

const SKIP = /^(PRE|CODE|SVG|SCRIPT|STYLE|TEXTAREA)$/;
const BLOCK = 'p,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,aside,div,figcaption';
const isUrlLike = (t) => /^\s*(https?:\/\/|www\.|mailto:)\S+\s*$/i.test(t) || /^\s*[\w.+-]+@[\w-]+(\.[\w-]+)+\s*$/.test(t);

function textNodes(node, out = []) {
  for (const c of Array.from(node.childNodes)) {
    if (c.nodeType === 3) out.push(c);
    else if (c.nodeType === 1 && !SKIP.test(String(c.tagName).toUpperCase()) && !c.hasAttribute('data-md2-furniture')) textNodes(c, out);
  }
  return out;
}

const blockOf = (n) => n.parentElement?.closest(BLOCK) || n.parentElement;
const tag = (n) => String(n.tagName).toUpperCase();

/** Runs the enabled rules over `root`. Returns the same report shape as cleanMarkdown. */
export function cleanDOM(root, on = defaultRules()) {
  const rec = makeRec();
  const blockPersian = new Map();
  const persianOf = (node) => {
    const b = blockOf(node);
    if (!blockPersian.has(b)) blockPersian.set(b, isPersian(b?.textContent || node.nodeValue));
    return blockPersian.get(b);
  };
  const nodes = textNodes(root);

  if (on.filler) {
    const kids = () => Array.from(root.children).filter((c) => !c.hasAttribute('data-md2-furniture'));
    for (const end of ['first', 'last']) {
      for (let n = 0; n < 2; n++) {
        const k = kids();
        const el = end === 'first' ? k[0] : k[k.length - 1];
        if (!el || k.length < 2 || !/^(P|DIV)$/.test(tag(el)) || !isFillerParagraph(el.textContent)) break;
        rec.hit('filler', el.textContent.trim().slice(0, 70), '(حذف شد)');
        el.remove();
        const nk = kids();
        const edge = end === 'first' ? nk[0] : nk[nk.length - 1];
        if (edge && tag(edge) === 'HR') edge.remove();
      }
    }
  }

  for (const node of nodes) {
    if (!node.isConnected && !root.contains(node)) continue;
    const a = node.parentElement?.closest('a');
    if (a && isUrlLike(node.nodeValue)) continue;
    let value = node.nodeValue;
    const parentTag = node.parentElement ? tag(node.parentElement) : '';
    if (on['emoji-decor'] && /^(H[1-6]|LI)$/.test(parentTag) && !node.previousSibling) value = removeLeadEmoji(value, rec);
    const persian = persianOf(node);
    value = splitProtected(value)
      .map((p) => (p.prot ? p.text : cleanText(p.text, on, { persian }, rec)))
      .join('');
    if (on.artifacts) {
      const stars = (value.match(/\*\*/g) || []).length;
      if (stars % 2 === 1) {
        const at = value.lastIndexOf('**');
        rec.hit('artifacts', '**', '', value, at, 2);
        value = value.slice(0, at) + value.slice(at + 2);
      }
    }
    if (value !== node.nodeValue) node.nodeValue = value;
  }

  if (on.artifacts) {
    for (const hr of Array.from(root.querySelectorAll('hr'))) {
      const prev = hr.previousElementSibling;
      if (prev && tag(prev) === 'HR') {
        rec.hit('artifacts', 'جداکنندهٔ تکراری', '');
        hr.remove();
      }
    }
  }
  return { report: reportOf(rec) };
}
