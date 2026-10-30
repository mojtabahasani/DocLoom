// Paste handling: file-paste zone, document-level file paste, and rich paste inside the preview.
import { store } from '../core/store.js';
import { $ } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { sanitizeToFragment } from '../content/sanitize.js';
import { markChanged, insertAtSelection, preview } from './preview.js';
import { loadSourceFile, pickSourceFile } from './files.js';
import { readImage, consumeImageTarget } from './images.js';

/** Paste of web content: sanitize (inert parse), insert, switch the page to the wide "web" layout. */
export function insertClipboardHTML(html, wide = true) {
  insertAtSelection(sanitizeToFragment(html));
  if (wide) store.set('webLayout', true);
  markChanged();
}

function initPasteZone() {
  const zone = $('#pasteZone');
  zone.addEventListener('beforeinput', (e) => {
    if (e.inputType !== 'insertFromPaste') e.preventDefault();
  });
  zone.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) && e.key.length === 1) e.preventDefault();
  });
  zone.addEventListener('paste', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = pickSourceFile(e.clipboardData);
    if (file) {
      loadSourceFile(file);
      zone.blur();
      return;
    }
    const text = e.clipboardData.getData('text/plain');
    if (text && !/[\r\n]/.test(text.trim()) && /\.(md|markdown|txt|html?)$/i.test(text.trim()))
      notify('مرورگر فقط نام فایل را داد، نه خودِ فایل؛ فایل را بکشید و رها کنید یا کلیک کنید و انتخاب کنید.');
    else notify('فایلی در حافظه نیست؛ اول در Finder روی فایل MD یا HTML بزنید ⌘C، بعد اینجا بچسبانید.');
  });
}

export function initPaste() {
  initPasteZone();
  // ⌘V on an empty part of the page: load a copied file.
  document.addEventListener('paste', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('input,textarea,[contenteditable=true],#preview')) return;
    const file = pickSourceFile(e.clipboardData);
    if (file) {
      e.preventDefault();
      loadSourceFile(file);
    }
  });
  preview.addEventListener('paste', (e) => {
    e.preventDefault();
    const items = Array.from(e.clipboardData.items || []);
    const image = items.find((i) => i.kind === 'file' && /^image\//.test(i.type));
    if (image) {
      readImage(image.getAsFile(), consumeImageTarget());
      return;
    }
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (html) insertClipboardHTML(html);
    else {
      document.execCommand('insertText', false, text);
      markChanged();
    }
  });
}
