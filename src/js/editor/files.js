// Loading documents from files (picker, drop, pasted File).
import { store } from '../core/store.js';
import { $ } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { parseHTMLDocument, sanitizeChildren } from '../content/sanitize.js';
import { beautifyHTML } from '../content/html-source.js';
import { renderFromSource, setContent, applyLook } from './preview.js';
import { toggleSourceMode, setSourceText, refreshSource } from './source.js';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const SOURCE_FILE = /\.(md|markdown|txt|html?)$/i;

/** Which file from a DataTransfer is the document (prefers .md/.txt/.html over others). */
export function pickSourceFile(data) {
  const files = [...((data && data.files) || [])];
  return files.find((f) => SOURCE_FILE.test(f.name)) || files[0] || null;
}

/** Load sanitized HTML (full document or fragment) into the preview. */
export function loadHTMLContent(html, { quiet = false } = {}) {
  const doc = parseHTMLDocument(html);
  if (doc.querySelector('parsererror')) {
    notify('ساختار فایل HTML قابل خواندن نیست.');
    return false;
  }
  const root = doc.body.querySelector('main') || doc.body;
  if (!quiet) store.emit('before-import'); // version snapshot of the current document
  store.set('webLayout', false);
  setContent(sanitizeChildren(root), { reset: true });
  if (doc.title) store.set('title', doc.title);
  applyLook();
  if (store.get('sourceMode')) refreshSource();
  if (!quiet) notify('محتوای HTML بارگذاری و پاک‌سازی شد.');
  return true;
}

export async function loadSourceFile(file) {
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    notify('فایل نامعتبر است یا بزرگ‌تر از ۵ مگابایت.');
    return;
  }
  try {
    const content = await file.text();
    if (/\.html?$/i.test(file.name)) {
      if (loadHTMLContent(content)) {
        toggleSourceMode(true);
        setSourceText(beautifyHTML(content, { DOMParser }));
        store.emit('text:imported');
      }
    } else if (/\.(md|markdown|txt)$/i.test(file.name)) {
      store.emit('before-import');
      store.set('source', content);
      if (!store.get('title')) store.set('title', file.name.replace(/\.(md|markdown|txt)$/i, ''));
      renderFromSource();
      notify('فایل روی همین دستگاه خوانده شد.');
      store.emit('text:imported');
    } else notify('فقط فایل MD، TXT یا HTML انتخاب کنید.');
  } catch {
    notify('خواندن فایل ممکن نشد.');
  }
}

export function initFileInput() {
  const input = $('#file');
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    await loadSourceFile(file);
  });
  const drop = $('#drop');
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('drag');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    drop.classList.remove('drag');
    loadSourceFile(pickSourceFile(e.dataTransfer));
  });
  // Dropping a file anywhere else must not navigate away from the app.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = pickSourceFile(e.dataTransfer);
    if (file) loadSourceFile(file);
  });
}
