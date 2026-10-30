// The contenteditable document surface: rendering, furniture (header/footer), selection, undo/redo.
import { store } from '../core/store.js';
import { $ } from '../core/dom.js';
import { createHistory } from '../core/history.js';
import { markdownToHTML } from '../content/markdown.js';
import { sanitizeToFragment } from '../content/sanitize.js';
import { headerHTML, footerHTML } from '../content/furniture.js';

export const preview = $('#preview');

export const history = createHistory({
  read: () => preview.innerHTML,
  write: (html) => {
    preview.innerHTML = html;
  },
  onChange: (st) => store.emit('history', st),
});

const furnitureState = () => store.snapshot();

export function isEmpty() {
  return !preview.textContent.trim() && !preview.querySelector('img,hr,table');
}

export function plainText() {
  return preview.innerText || preview.textContent || '';
}

/** Call after any content change (typing, insert, render, undo...). */
export function markChanged() {
  history.record();
  preview.dataset.empty = String(isEmpty());
  store.set('dirty', true);
  store.emit('content');
}

function afterRestore() {
  preview.dataset.empty = String(isEmpty());
  store.set('dirty', true);
  store.emit('content');
}

export function undo() {
  if (history.undo()) afterRestore();
}
export function redo() {
  if (history.redo()) afterRestore();
}
export function resetHistory() {
  history.reset();
}

export function applyLook() {
  preview.dataset.docTheme = store.get('theme');
  preview.style.fontSize = store.get('font') + 'px';
  preview.classList.toggle('web-layout', store.get('webLayout'));
}

/** Rebuild the preview from the Markdown source + furniture. */
export function renderFromSource() {
  const s = furnitureState();
  store.set('webLayout', false);
  const html = headerHTML(s) + markdownToHTML(s.source) + footerHTML(s);
  preview.replaceChildren(sanitizeToFragment(html));
  applyLook();
  markChanged();
}

/** True when the preview is exactly what the Markdown source renders to (no direct edits, charts, ...). */
export function previewInSync() {
  const s = furnitureState();
  const box = document.createElement('div');
  box.append(sanitizeToFragment(headerHTML(s) + markdownToHTML(s.source) + footerHTML(s)));
  const norm = (h) => h.replace(/ id="s-[^"]*"/g, '');
  return !!s.source.trim() && norm(box.innerHTML) === norm(preview.innerHTML);
}

/** Replace only the header/title/footer blocks, keeping edited body content. */
export function refreshFurniture() {
  const s = furnitureState();
  preview.querySelectorAll('[data-md2-furniture]').forEach((n) => n.remove());
  const head = sanitizeToFragment(headerHTML(s));
  if (head.childNodes.length) preview.prepend(head);
  const foot = sanitizeToFragment(footerHTML(s));
  if (foot.childNodes.length) preview.append(foot);
  markChanged();
}

/** Replace the whole body with already-sanitized nodes (HTML load / source apply). */
export function setContent(fragment, { reset = false } = {}) {
  preview.replaceChildren(fragment);
  applyLook();
  if (reset) {
    history.reset();
    preview.dataset.empty = String(isEmpty());
    store.set('dirty', true);
    store.emit('content');
  } else markChanged();
}

export function clearContent() {
  preview.innerHTML = '';
  store.set('webLayout', false);
  applyLook();
  history.reset();
  preview.dataset.empty = 'true';
  store.emit('content');
}

// ---- selection ----
export function rememberRange() {
  const s = getSelection();
  if (s && s.rangeCount && preview.contains(s.anchorNode)) store.set('savedRange', s.getRangeAt(0).cloneRange());
}

export function restoreSelection() {
  const r = store.get('savedRange');
  if (!r) return;
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

/** Insert a node/fragment at the remembered caret, or append when there is none. */
export function insertNode(node) {
  preview.focus();
  const r = store.get('savedRange');
  const s = getSelection();
  if (r && preview.contains(r.startContainer)) {
    r.deleteContents();
    r.insertNode(node);
    r.setStartAfter(node);
    r.collapse(true);
    s.removeAllRanges();
    s.addRange(r);
    store.set('savedRange', null);
  } else preview.append(node);
  markChanged();
}

/** Paste-style insertion at the live selection (used for web paste). */
export function insertAtSelection(fragment) {
  const sel = getSelection();
  if (sel && sel.rangeCount && preview.contains(sel.anchorNode)) {
    const r = sel.getRangeAt(0);
    r.deleteContents();
    r.insertNode(fragment);
    sel.removeAllRanges();
  } else preview.append(fragment);
}

export function selectAll() {
  const r = document.createRange();
  r.selectNodeContents(preview);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
  preview.focus();
}

export function initPreview() {
  preview.addEventListener('mouseup', rememberRange);
  preview.addEventListener('keyup', rememberRange);
  preview.addEventListener('input', markChanged);
  // Links are editable text here: never navigate.
  preview.addEventListener('click', (e) => {
    if (e.target.closest('a')) e.preventDefault();
  });
  preview.addEventListener('drop', (e) => e.preventDefault());
  for (const k of ['theme', 'font', 'webLayout']) store.on(k, applyLook);
  applyLook();
  preview.dataset.empty = 'true';
}
