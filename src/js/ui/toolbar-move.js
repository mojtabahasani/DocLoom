// The toolbar used to carry a dozen controls at once — brand, library, files, server, theme,
// new document, the title and the export menu — and reading it was a job in itself. They now sit
// in the panel group each one belongs to.
//
// Their markup stays together in one <template id="movedFromToolbar">, so the whole set is still
// visible in one place in index.html, and this moves each node into the `data-move` slot that
// names it. Nothing is rebuilt and no id changes, so every module still binds to the same node.
// It must run before any init: a node inside a <template> is in a fragment of its own, where
// document.querySelector cannot see it.
import { $, $$ } from '../core/dom.js';

export function placeToolbarControls() {
  const tpl = $('#movedFromToolbar');
  if (!tpl) return;
  for (const slot of $$('[data-move]')) {
    const node = tpl.content.getElementById(slot.dataset.move);
    if (node) slot.append(node);
  }
  tpl.remove();
}

/**
 * The header no longer shows the document's name, so it shows which document is open instead:
 * a quiet line that is read, not typed. The field itself lives in «ورودی».
 */
export function initDocCrumb(store) {
  const crumb = $('#docCrumb');
  if (!crumb) return;
  const paint = (t) => {
    crumb.textContent = (t || '').trim() || 'سند بی‌نام';
    crumb.classList.toggle('empty', !(t || '').trim());
  };
  store.on('title', paint);
  paint(store.get('title'));
}
