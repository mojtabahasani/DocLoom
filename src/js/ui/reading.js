// Reading mode: full-screen, distraction-free view of the current document.
import { el, icon } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { toFaDigits } from '../content/persian.js';
import { readingMinutes } from '../content/toc.js';
import { sanitizeChildren } from '../content/sanitize.js';
import { preview, plainText, isEmpty } from '../editor/preview.js';
import { store } from '../core/store.js';
import { readStored, writeStored } from '../core/naming.js';

const READER_KEY = 'datasave.reader';
const SIZES = [15, 17, 19, 21, 24, 28];
const BGS = [['light', 'روشن'], ['sepia', 'کرم'], ['dark', 'تیره']];
let root = null;
let opener = null;
const pref = { size: 19, bg: 'light' };
try {
  Object.assign(pref, JSON.parse(readStored(READER_KEY) || '{}'));
} catch { /* storage unavailable: defaults */ }
const save = () => writeStored(READER_KEY, JSON.stringify(pref));

export const isReading = () => !!root;

export function closeReading() {
  if (!root) return;
  root.remove();
  root = null;
  document.removeEventListener('keydown', onKey, true);
  document.body.classList.remove('reading');
  opener?.focus?.();
}

function onKey(e) {
  if (e.key !== 'Escape' || document.getElementById('modal').childElementCount) return;
  if (document.querySelector('.palette-back')) return;
  e.preventDefault();
  e.stopPropagation();
  closeReading();
}

export function openReading() {
  if (root) return closeReading();
  if (isEmpty()) return notify('ابتدا متن یا فایل خود را وارد کنید.');
  opener = document.activeElement;
  const { words, minutes } = readingMinutes(plainText());
  const doc = el('article', { class: 'paper reader-doc', 'data-doc-theme': store.get('theme') });
  doc.append(sanitizeChildren(preview));
  doc.querySelectorAll('[data-md2-furniture="header"]').forEach((n) => n.remove());
  const fill = el('i');
  const progress = el('div', { class: 'reader-progress', role: 'progressbar', 'aria-label': 'پیشرفت مطالعه', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, fill);
  const scroller = el('div', { class: 'reader-scroll', tabindex: '0' }, doc);
  const sizeLabel = el('span', { class: 'reader-size', 'aria-live': 'polite' });
  const paintSize = () => {
    root.style.setProperty('--reader-size', pref.size + 'px');
    sizeLabel.textContent = toFaDigits(pref.size);
  };
  const step = (d) => {
    const i = Math.max(0, Math.min(SIZES.length - 1, SIZES.indexOf(pref.size) + d));
    pref.size = SIZES[i];
    paintSize();
    update();
    save();
  };
  const bgBtns = BGS.map(([id, label]) => el('button', { type: 'button', class: 'rb-' + id, 'aria-pressed': String(pref.bg === id), text: label, onclick: () => setBg(id) }));
  const setBg = (id) => {
    pref.bg = id;
    root.dataset.reader = id;
    bgBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(BGS[i][0] === id)));
    save();
  };
  const bar = el('header', { class: 'reader-bar' },
    // Named by its own text («خروج Esc»): an aria-label that left the «Esc» out would
    // contradict the visible label, which WCAG 2.5.3 forbids.
    el('button', { type: 'button', class: 'btn', onclick: closeReading, title: 'خروج از حالت مطالعه' }, icon('x'), el('span', { text: 'خروج' }), el('kbd', { text: 'Esc' })),
    el('span', { class: 'reader-meta', text: `حدود ${toFaDigits(minutes)} دقیقه مطالعه · ${toFaDigits(words)} واژه` }),
    el('span', { class: 'grow' }),
    el('div', { class: 'reader-group ltr-group', role: 'group', 'aria-label': 'اندازهٔ قلم' },
      el('button', { type: 'button', 'aria-label': 'کوچک‌تر', title: 'کوچک‌تر', text: '−', onclick: () => step(-1) }), sizeLabel,
      el('button', { type: 'button', 'aria-label': 'بزرگ‌تر', title: 'بزرگ‌تر', text: '+', onclick: () => step(1) })),
    el('div', { class: 'reader-group reader-bgs', role: 'group', 'aria-label': 'زمینه' }, ...bgBtns),
  );
  root = el('div', { class: 'reader', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'حالت مطالعه', 'data-reader': pref.bg }, progress, bar, scroller);
  function update() {
    const max = scroller.scrollHeight - scroller.clientHeight;
    const pct = max > 0 ? Math.min(100, Math.max(0, (scroller.scrollTop / max) * 100)) : 100;
    fill.style.width = pct + '%';
    progress.setAttribute('aria-valuenow', String(Math.round(pct)));
  }
  scroller.addEventListener('scroll', update, { passive: true });
  document.addEventListener('keydown', onKey, true);
  document.body.classList.add('reading');
  document.body.append(root);
  paintSize();
  update();
  scroller.focus();
}
