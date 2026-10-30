// Dismissible suggestion bar after text import: AI output -> cleanup; letter cues -> letter mode.
import { store } from '../core/store.js';
import { $, el, icon } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { detectKind } from '../content/detect.js';
import { preview, plainText, previewInSync, isEmpty } from '../editor/preview.js';
import { openCleanup } from './cleanup-ui.js';

const dismissed = new Set();
let bar;

/** Package 3 hooks letter mode through store.on('mode'); for now this only marks the document. */
export function suggestLetterMode() {
  store.set('mode', 'letter');
  store.set('dirty', true);
  notify('قالب نامه به‌زودی اضافه می‌شود؛ سند فعلاً در حالت «نامه» علامت‌گذاری شد.');
}

const key = (kind) => `${store.get('docId') || 'new'}:${kind}`;

function hide() {
  bar?.remove();
  bar = null;
}

function show(items) {
  hide();
  const close = el('button', { type: 'button', class: 'btn ghost icon', 'aria-label': 'بستن پیشنهاد', title: 'بستن' }, icon('x'));
  bar = el('div', { class: 'suggest', role: 'region', 'aria-label': 'پیشنهاد برای این سند' }, icon('sparkle'));
  const text = el('span', { class: 'suggest-text', text: items.map((i) => i.message).join(' · ') });
  bar.append(text, el('span', { class: 'grow' }));
  for (const it of items) {
    bar.append(
      el('button', { type: 'button', class: 'btn soft', text: it.label, onclick: () => { dismissed.add(key(it.kind)); hide(); it.run(); } }),
    );
  }
  close.addEventListener('click', () => {
    items.forEach((i) => dismissed.add(key(i.kind)));
    hide();
  });
  bar.append(close);
  $('.stage').prepend(bar);
}

/** Inspect the current document and show the bar when something is detected. Returns the detection. */
export function checkDocument() {
  if (isEmpty()) return hide(), null;
  const d = detectKind(previewInSync() ? store.get('source') : plainText());
  const items = [];
  if (d.ai && !dismissed.has(key('ai'))) items.push({ kind: 'ai', message: 'به نظر خروجی هوش مصنوعی است — پاک‌سازی؟', label: 'پاک‌سازی…', run: openCleanup });
  if (d.letter && !dismissed.has(key('letter'))) items.push({ kind: 'letter', message: 'به نظر یک نامه است — حالت نامه؟', label: 'حالت نامه', run: suggestLetterMode });
  if (items.length) show(items);
  else hide();
  return d;
}

export function initSuggest() {
  store.on('text:imported', () => setTimeout(checkDocument, 60));
  $('#source').addEventListener('paste', () => setTimeout(checkDocument, 120));
  preview.addEventListener('paste', () => setTimeout(checkDocument, 200));
  store.on('doc:new', hide);
  store.on('docId', hide);
}
