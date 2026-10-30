// "فهرست" tab: headings h1-h3 with scroll-to and active-section highlighting; insert-TOC command.
import { store } from '../core/store.js';
import { $, el, debounce } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { buildToc, tocHTML } from '../content/toc.js';
import { assignHeadingIds, collectHeadings } from '../content/toc-dom.js';
import { sanitizeToFragment } from '../content/sanitize.js';
import { preview, insertNode, markChanged } from '../editor/preview.js';

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
  return el('ul', { class: 'toc-tree' + (depth ? ' sub' : '') }, ...tree.map((n) => el('li', {}, el('button', { type: 'button', class: 'toc-item lvl' + n.level, 'data-id': n.id, text: n.text || '(بدون عنوان)', onclick: () => scrollToHeading(n.id) }), n.children.length ? renderList(n.children, depth + 1) : null)));
}

export function refreshToc() {
  items = assignHeadingIds(preview);
  const tree = buildToc(items);
  $('#tocList').replaceChildren(tree.length ? renderList(tree) : el('p', { class: 'muted', text: 'هنوز تیتری (h1 تا h3) در سند نیست. با «#» در Markdown یا «تیتر جدید» تیتر بسازید.' }));
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
  const hs = assignHeadingIds(preview);
  const tree = buildToc(hs);
  if (!tree.length) return notify('برای فهرست مطالب دست‌کم یک تیتر (h1 تا h3) لازم است.');
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
  notify(old ? 'فهرست مطالب به‌روز شد.' : 'فهرست مطالب در سند درج شد.');
}

export function showTab(name) {
  const toc = name === 'toc';
  $('#tabInput').hidden = toc;
  $('#tabToc').hidden = !toc;
  for (const [id, on] of [['tabBtnInput', !toc], ['tabBtnToc', toc]]) {
    const b = $('#' + id);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  if (toc) refreshToc();
}

export function initToc() {
  $('#tabBtnInput').addEventListener('click', () => showTab('input'));
  $('#tabBtnToc').addEventListener('click', () => showTab('toc'));
  $('#tocInsert').addEventListener('click', insertToc);
  const update = debounce(() => !$('#tabToc').hidden && refreshToc(), 300);
  store.on('content', update);
  // In-preview TOC links scroll instead of navigating.
  preview.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href^="#s-"]');
    if (a) scrollToHeading(decodeURIComponent(a.getAttribute('href').slice(1)));
  });
}
