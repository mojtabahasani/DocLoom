// Floating selection toolbar + "add to document" block tools.
import { store } from '../core/store.js';
import { $, $$, el } from '../core/dom.js';
import { safeURL } from '../content/url.js';
import { preview, rememberRange, restoreSelection, insertNode, markChanged, selectAll } from './preview.js';
import { pickImage } from './images.js';
import { promptDialog } from '../ui/modal.js';

export function makeBlock(kind) {
  if (kind === 'heading') return el('h2', { text: 'تیتر جدید را بنویسید' });
  if (kind === 'card')
    return el('aside', { class: 'card' }, el('span', { class: 'card-label', text: 'نکتهٔ برجسته' }), el('p', { text: 'متن کارت را اینجا بنویسید.' }));
  if (kind === 'quote') return el('blockquote', { text: 'متن نقل‌قول را اینجا بنویسید.' });
  return el('hr');
}

export async function addLinkButton() {
  rememberRange();
  const values = await promptDialog({
    title: 'دکمهٔ لینک',
    fields: [
      { name: 'label', label: 'متن دکمه', value: 'مشاهدهٔ صفحه' },
      { name: 'url', label: 'نشانی لینک (http، https، mailto یا tel)', value: 'https://', type: 'url', dir: 'ltr' },
    ],
    submitLabel: 'درج دکمه',
    validate: (v) => (!v.label ? 'متن دکمه را بنویسید.' : !safeURL(v.url) ? 'نشانی نامعتبر است؛ فقط http، https، mailto و tel پذیرفته می‌شوند.' : ''),
  });
  if (!values) return;
  const link = el('a', { href: safeURL(values.url), rel: 'noopener noreferrer', class: 'link-button', text: values.label });
  if (store.get('openLinksInNewTab')) link.target = '_blank';
  insertNode(link);
}

function positionToolbar(bar) {
  rememberRange();
  const r = store.get('savedRange');
  if (!r || r.collapsed || store.get('sourceMode')) return bar.classList.remove('show');
  const rect = r.getBoundingClientRect();
  if (!rect.width && !rect.height) return;
  bar.classList.add('show');
  const x = Math.max(8, Math.min(window.innerWidth - bar.offsetWidth - 8, rect.left + rect.width / 2 - bar.offsetWidth / 2));
  bar.style.left = x + 'px';
  bar.style.top = Math.max(8, rect.top - bar.offsetHeight - 9) + 'px';
}

export function initToolbar() {
  const bar = $('#selectionToolbar');
  const refresh = () => {
    markChanged();
    rememberRange();
    positionToolbar(bar);
  };
  bar.addEventListener('mousedown', (e) => {
    if (!e.target.closest('input')) e.preventDefault();
  });
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-format]');
    if (!b) return;
    restoreSelection();
    const cmd = b.dataset.format;
    if (cmd === 'fontUp' || cmd === 'fontDown') document.execCommand('fontSize', false, cmd === 'fontUp' ? '5' : '2');
    else if (cmd === 'hilite') document.execCommand('hiliteColor', false, b.dataset.color);
    else document.execCommand(cmd, false, null);
    refresh();
  });
  $('#textColor').addEventListener('input', (e) => {
    restoreSelection();
    document.execCommand('foreColor', false, e.target.value);
    markChanged();
  });
  $('#backColor').addEventListener('input', (e) => {
    restoreSelection();
    document.execCommand('hiliteColor', false, e.target.value);
    markChanged();
  });
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === preview || preview.contains(getSelection()?.anchorNode)) positionToolbar(bar);
  });
  document.addEventListener('mousedown', (e) => {
    if (!bar.contains(e.target) && !preview.contains(e.target)) bar.classList.remove('show');
  });
  window.addEventListener('resize', () => bar.classList.remove('show'));

  $$('.tool[data-block]').forEach((b) => b.addEventListener('click', () => insertNode(makeBlock(b.dataset.block))));
  $('#addImage').addEventListener('click', () => pickImage('inline'));
  $('#addLink').addEventListener('click', addLinkButton);
  $('#selectAll').addEventListener('click', selectAll);
}
