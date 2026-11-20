// "فهرست" tab: headings h1-h3 with scroll-to and active-section highlighting; insert-TOC command.
import { store } from '../core/store.js';
import { $, el, debounce } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { buildToc, tocHTML } from '../content/toc.js';
import { assignHeadingIds, collectHeadings } from '../content/toc-dom.js';
import { sanitizeToFragment } from '../content/sanitize.js';
import { preview, insertNode, markChanged } from '../editor/preview.js';
import { openGroup, activeGroup } from './drawer.js';

let items = []; // [{ el, level, text, id }]
let observer;
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function scrollToHeading(id) {
  const h = document.getElementById(id);
  if (!h || !preview.contains(h)) return;
  h.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start' });
  setActive(id);
}

function setActive(id) {
  $('#tocList')
    .querySelectorAll('.toc-item')
    .forEach((b) => {
      const on = b.dataset.id === id;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
}

function updateActive() {
  const root = preview.closest('.stage');
  if (!root || !items.length) return;
  const rr = root.getBoundingClientRect();
  const line = rr.top + rr.height * 0.25;
  let cur = null;
  for (const h of items) {
    if (h.el.getBoundingClientRect().top <= line) cur = h;
    else break;
  }
  setActive(cur?.id);
}

function renderList(tree, depth = 0) {
  const untitled = store.get('lang') !== 'fa' ? '(Untitled)' : '(بدون عنوان)';
  return el('ul', { class: 'toc-tree' + (depth ? ' sub' : '') }, ...tree.map((n) => el('li', {}, el('button', { type: 'button', class: 'toc-item lvl' + n.level, 'data-id': n.id, text: n.text || untitled, onclick: () => scrollToHeading(n.id) }), n.children.length ? renderList(n.children, depth + 1) : null)));
}

export function refreshToc() {
  const en = store.get('lang') !== 'fa';
  items = assignHeadingIds(preview);
  const tree = buildToc(items);
  const emptyText = en
    ? 'No headings (h1-h3) in this document yet. Add headings with "#" in Markdown or via "Heading".'
    : 'هنوز تیتری (h1 تا h3) در سند نیست. با «#» در Markdown یا «تیتر جدید» تیتر بسازید.';
  $('#tocList').replaceChildren(tree.length ? renderList(tree) : el('p', { class: 'muted', text: emptyText }));
  $('#tocInsert').disabled = !tree.length;
  observer?.disconnect();
  if (tree.length && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(updateActive, { root: preview.closest('.stage'), rootMargin: '0px 0px -75% 0px', threshold: [0, 1] });
    items.forEach((h) => observer.observe(h.el));
  }
  updateActive();
}

/** Insert (or refresh) an in-page TOC block: at the caret, else right after the first h1. */
export function insertToc() {
  const en = store.get('lang') !== 'fa';
  const hs = assignHeadingIds(preview);
  const tree = buildToc(hs);
  if (!tree.length) return notify(en ? 'At least one heading (h1-h3) is required for a Table of Contents.' : 'برای فهرست مطالب دست‌کم یک تیتر (h1 تا h3) لازم است.');
  const old = preview.querySelector('nav.toc');
  const nav = sanitizeToFragment(tocHTML(tree)).firstChild;
  if (old) {
    old.replaceWith(nav);
    markChanged();
  } else if (store.get('savedRange') && preview.contains(store.get('savedRange').startContainer)) insertNode(nav);
  else {
    const first = collectHeadings(preview)[0];
    if (first.tagName === 'H1') first.after(nav);
    else first.before(nav);
    markChanged();
  }
  notify(old ? (en ? 'Table of Contents updated.' : 'فهرست مطالب به‌روز شد.') : (en ? 'Table of Contents inserted.' : 'فهرست مطالب در سند درج شد.'));
}

/** Show one group of the content panel. The drawer owns the tabs; this keeps the old call sites. */
export function showTab(name, opts) {
  openGroup('content', name, opts);
  if (name === 'toc') refreshToc();
}

export function initToc() {
  $('#tocInsert').addEventListener('click', insertToc);
  const update = debounce(() => activeGroup('content') === 'toc' && refreshToc(), 300);
  store.on('content', update);
  store.on('lang', refreshToc);
  // In-preview TOC links scroll instead of navigating.
  preview.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href^="#s-"]');
    if (a) scrollToHeading(decodeURIComponent(a.getAttribute('href').slice(1)));
  });
}
