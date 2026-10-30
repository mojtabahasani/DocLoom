// HTML source mode: highlighted code editor over a textarea, beautify, apply back to preview.
import { store } from '../core/store.js';
import { $ } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { highlightHTML, beautifyHTML } from '../content/html-source.js';
import { parseHTMLDocument, sanitizeChildren } from '../content/sanitize.js';
import { buildExportHTML } from '../export/html.js';
import { setContent, applyLook } from './preview.js';

const area = () => $('#htmlSource');

function paint() {
  const a = area();
  const value = a.value;
  $('#htmlHighlight code').innerHTML = highlightHTML(value) + '\n';
  $('#codeGutter').textContent = Array.from({ length: value.split('\n').length }, (_, i) => String(i + 1)).join('\n');
  syncScroll();
}

function syncScroll() {
  const a = area();
  const pre = $('#htmlHighlight');
  pre.scrollTop = a.scrollTop;
  pre.scrollLeft = a.scrollLeft;
  $('#codeGutter').scrollTop = a.scrollTop;
}

export function setSourceText(value) {
  area().value = value;
  paint();
}

export function refreshSource() {
  setSourceText(beautifyHTML(buildExportHTML(), { DOMParser }));
}

export function toggleSourceMode(force) {
  const on = typeof force === 'boolean' ? force : !store.get('sourceMode');
  store.set('sourceMode', on);
  if (on) refreshSource();
}

function renderMode(on) {
  $('#preview').hidden = on;
  $('#sourcePane').hidden = !on;
  $('#centerTitle').textContent = on ? 'سورس HTML سند' : 'پیش‌نمایش سند';
  $('#modeLabel').textContent = on ? 'ویرایش کد' : 'زنده';
  const btn = $('#sourceToggle');
  btn.setAttribute('aria-pressed', String(on));
  btn.querySelector('span').textContent = on ? 'اعمال و بازگشت به پیش‌نمایش' : 'سورس HTML';
  document.body.classList.toggle('source-mode', on);
}

export function applySource() {
  let doc;
  try {
    doc = parseHTMLDocument(area().value);
  } catch {
    notify('خواندن سورس HTML ممکن نشد.');
    return;
  }
  if (doc.querySelector('parsererror')) {
    notify('ساختار HTML معتبر نیست؛ پیش‌نمایش تغییر نکرد.');
    return;
  }
  const root = doc.body.querySelector('main') || doc.body;
  setContent(sanitizeChildren(root));
  applyLook();
  toggleSourceMode(false);
  notify('سورس پاک‌سازی و در پیش‌نمایش اعمال شد.');
}

export function initSource() {
  store.on('sourceMode', renderMode);
  renderMode(false);
  $('#sourceToggle').addEventListener('click', () => (store.get('sourceMode') ? applySource() : toggleSourceMode(true)));
  $('#refreshSource').addEventListener('click', refreshSource);
  $('#formatSource').addEventListener('click', () => setSourceText(beautifyHTML(area().value, { DOMParser })));
  $('#applySource').addEventListener('click', applySource);
  area().addEventListener('input', paint);
  area().addEventListener('scroll', syncScroll);
  area().addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const a = e.currentTarget;
    a.setRangeText('  ', a.selectionStart, a.selectionEnd, 'end');
    paint();
  });
}
