// Saving / copying helpers shared by all exports.
import { notify } from '../core/notify.js';
import { promptDialog } from '../ui/modal.js';

export function downloadFile(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.append(a); // Firefox needs the link in the DOM
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1200);
}

export function safeFilename(title, ext) {
  const base = String(title || 'datasave-document')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return (base || 'datasave-document') + '.' + ext;
}

// The server module registers a sink that can store an export beside the linked file or in a chosen folder.
let sink = null;
export const setSaveSink = (fn) => {
  sink = fn;
};

/** "Save As": the server sink when active, else the native picker when available, otherwise an in-app filename dialog + download. */
export async function saveAs(name, body, type, description) {
  if (sink && (await sink(name, body, type))) return;
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const ext = name.split('.').pop();
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description, accept: { [type.split(';')[0]]: ['.' + ext] } }],
      });
      const w = await handle.createWritable();
      await w.write(new Blob([body], { type }));
      await w.close();
      notify('فایل ذخیره شد.');
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
      notify('پنجرهٔ انتخاب مسیر در دسترس نبود؛ نام فایل را وارد کنید.');
    }
  }
  const ext = name.split('.').pop();
  const values = await promptDialog({
    title: 'ذخیرهٔ فایل',
    message: 'نام فایل خروجی را بنویسید.',
    fields: [{ name: 'name', label: 'نام فایل', value: name, dir: 'ltr' }],
    submitLabel: 'دانلود',
    validate: (v) => (v.name ? '' : 'نام فایل خالی است.'),
  });
  if (!values) return;
  const cleaned = values.name.replace(/[\\/:*?"<>|]/g, '-');
  downloadFile(/\.[a-z0-9]+$/i.test(cleaned) ? cleaned : name.replace(/\.[a-z0-9]+$/i, '') + '.' + ext, body, type);
  notify('دانلود آغاز شد؛ محل نهایی ذخیره را مرورگر تعیین می‌کند.');
}

export async function copyPlain(text) {
  try {
    await navigator.clipboard.writeText(text);
    notify('در کلیپ‌بورد کپی شد.');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    try {
      document.execCommand('copy');
      notify('در کلیپ‌بورد کپی شد.');
    } catch {
      notify('Clipboard در دسترس نیست؛ متن را انتخاب کنید و دستی کپی کنید.');
    }
    setTimeout(() => ta.remove(), 1400);
  }
}
