// Reading mode: full-screen, distraction-free view of the current document.
import { el, icon } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { toFaDigits } from '../content/persian.js';
import { readingMinutes } from '../content/toc.js';
import { sanitizeChildren } from '../content/sanitize.js';
import { applyBidi } from '../content/bidi.js';
import { preview, plainText, isEmpty } from '../editor/preview.js';
import { store } from '../core/store.js';
import { readStored, writeStored } from '../core/naming.js';

const READER_KEY = 'docloom.reader';
const SIZES = [15, 17, 19, 21, 24, 28];
const BGS = [['light', 'روشن', 'Light'], ['sepia', 'کرم', 'Sepia'], ['dark', 'تیره', 'Dark']];
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
  const en = store.get('lang') !== 'fa';
  opener = document.activeElement;
  const { words, minutes } = readingMinutes(plainText());
  const doc = el('article', { class: 'paper reader-doc', 'data-doc-theme': store.get('theme') });
  doc.append(sanitizeChildren(preview));
  doc.querySelectorAll('[data-md2-furniture="header"]').forEach((n) => n.remove());
  applyBidi(doc, en ? 'ltr' : 'rtl');
  const fill = el('i');
  const progress = el('div', { class: 'reader-progress', role: 'progressbar', 'aria-label': en ? 'Reading progress' : 'پیشرفت مطالعه', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, fill);
  const scroller = el('div', { class: 'reader-scroll', tabindex: '0' }, doc);
  const sizeLabel = el('span', { class: 'reader-size', 'aria-live': 'polite' });
  const paintSize = () => {
    root.style.setProperty('--reader-size', pref.size + 'px');
    sizeLabel.textContent = en ? String(pref.size) : toFaDigits(pref.size);
  };
  const step = (d) => {
    const i = Math.max(0, Math.min(SIZES.length - 1, SIZES.indexOf(pref.size) + d));
    pref.size = SIZES[i];
    paintSize();
    update();
    save();
  };
  const bgBtns = BGS.map(([id, faLabel, enLabel]) => el('button', { type: 'button', class: 'rb-' + id, 'aria-pressed': String(pref.bg === id), text: en ? enLabel : faLabel, onclick: () => setBg(id) }));
  const setBg = (id) => {
    pref.bg = id;
    root.dataset.reader = id;
    bgBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(BGS[i][0] === id)));
    save();
  };
  const bar = el('header', { class: 'reader-bar' },
    // Named by its own text («Exit Esc» / «خروج Esc»): an aria-label without Esc would break WCAG 2.5.3.
    el('button', { type: 'button', class: 'btn', onclick: closeReading, title: en ? 'Exit reading mode' : 'خروج از حالت مطالعه' }, icon('x'), el('span', { text: en ? 'Exit' : 'خروج' }), el('kbd', { text: 'Esc' })),
    el('span', { class: 'reader-meta', text: en ? `~${minutes} min read · ${words} words` : `حدود ${toFaDigits(minutes)} دقیقه مطالعه · ${toFaDigits(words)} واژه` }),
    el('span', { class: 'grow' }),
    el('div', { class: 'reader-group ltr-group', role: 'group', 'aria-label': en ? 'Font size' : 'اندازهٔ قلم' },
      el('button', { type: 'button', 'aria-label': en ? 'Smaller' : 'کوچک‌تر', title: en ? 'Smaller' : 'کوچک‌تر', text: '−', onclick: () => step(-1) }), sizeLabel,
      el('button', { type: 'button', 'aria-label': en ? 'Larger' : 'بزرگ‌تر', title: en ? 'Larger' : 'بزرگ‌تر', text: '+', onclick: () => step(1) })),
    el('div', { class: 'reader-group reader-bgs', role: 'group', 'aria-label': en ? 'Background' : 'زمینه' }, ...bgBtns),
  );
  root = el('div', { class: 'reader', role: 'dialog', 'aria-modal': 'true', 'aria-label': en ? 'Reading mode' : 'حالت مطالعه', dir: en ? 'ltr' : 'rtl', 'data-reader': pref.bg }, progress, bar, scroller);
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
