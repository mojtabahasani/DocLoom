// Image intake: file picker, clipboard paste, header/footer images, zi2.ir upload.
import { embedConfig } from '../core/embed-config.js';
import { store } from '../core/store.js';
import { $, el } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { safeURL, isHttps } from '../content/url.js';
import { insertNode, refreshFurniture } from './preview.js';
import { confirmDialog } from '../ui/modal.js';
import { syncActive } from '../server/sync.js';
import { migrateEndpoint, fieldFor, imageUrlFrom, ZI2_TYPES, uploadName, replyError } from './upload-profile.js';

const MAX_IMAGE = 8 * 1024 * 1024;
const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/;

function docImage(src, alt) {
  return el('img', { src, alt, class: 'doc-image' });
}

/** Read an image file for a brand (same type and size limits as the editor). Resolves to a data URL, or null after telling the user why. */
export function loadImageData(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    if (!IMAGE_TYPES.test(file.type)) return notify('قالب تصویر پشتیبانی نمی‌شود؛ PNG، JPG، WebP یا GIF انتخاب کنید.'), resolve(null);
    if (file.size > MAX_IMAGE) return notify('حجم تصویر باید کمتر از ۸ مگابایت باشد.'), resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => (notify('خواندن تصویر ممکن نشد.'), resolve(null));
    reader.readAsDataURL(file);
  });
}

export function readImage(file, target = 'inline') {
  if (!file) return;
  if (!IMAGE_TYPES.test(file.type)) {
    notify('قالب تصویر پشتیبانی نمی‌شود؛ PNG، JPG، WebP یا GIF انتخاب کنید.');
    return;
  }
  if (file.size > MAX_IMAGE) {
    notify('حجم تصویر باید کمتر از ۸ مگابایت باشد.');
    return;
  }
  if (target === 'upload') {
    store.set('pendingUpload', file);
    notify('تصویر برای ارسال آماده شد.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const data = String(reader.result);
    if (target === 'masthead') {
      store.set('mastheadImage', data);
      refreshFurniture();
    } else if (target === 'footer') {
      store.set('footerImage', data);
      refreshFurniture();
    } else insertNode(docImage(data, 'تصویر سند'));
    notify('تصویر به سند اضافه شد.');
  };
  reader.onerror = () => notify('خواندن تصویر ممکن نشد.');
  reader.readAsDataURL(file);
}

/** Take the next chosen/pasted image for `target`, then reset to inline. */
export function consumeImageTarget() {
  const t = store.get('imageTarget');
  store.set('imageTarget', 'inline');
  return t;
}

export function pickImage(target) {
  store.set('imageTarget', target);
  $('#imageFile').click();
}

export async function pasteClipboardImage(target) {
  try {
    if (!navigator.clipboard?.read) throw new Error('clipboard.read unavailable (insecure http origin)');
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => /^image\//.test(t));
      if (type) {
        readImage(await item.getType(type), target);
        return;
      }
    }
    notify('تصویری در کلیپ‌بورد پیدا نشد.');
  } catch {
    store.set('imageTarget', target);
    notify('برای چسباندن تصویر، داخل پیش‌نمایش کلیک کنید و ⌘V یا Ctrl+V بزنید.');
  }
}

async function toPNG(file) {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close?.();
  const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!out) throw Error('encode failed');
  return out;
}

export async function uploadPendingImage() {
  if (!embedConfig().upload) return void notify('آپلود تصویر در این صفحه خاموش است؛ تصویر داخل خود سند می‌ماند.');
  const saved = store.get('uploadEndpoint').trim();
  const endpoint = migrateEndpoint(saved);
  if (endpoint !== saved) store.set('uploadEndpoint', endpoint);
  if (!endpoint) {
    notify('نشانی API آپلود را در تنظیمات وارد کنید.');
    return;
  }
  const file = store.get('pendingUpload');
  if (!file) {
    pickImage('upload');
    return;
  }
  if (!isHttps(endpoint)) {
    notify('نشانی API باید HTTPS معتبر باشد.');
    return;
  }
  const ok = await confirmDialog({
    title: 'آپلود تصویر',
    message: 'تصویر به زی2.ir ارسال می‌شود و لینک عمومی می‌سازد. ادامه می‌دهید؟',
    confirmLabel: 'آپلود کن',
  });
  if (!ok) return;
  let blob = file;
  if (!ZI2_TYPES[file.type]) {
    try {
      blob = await toPNG(file); // WebP and others: zi2 rejects them
    } catch {
      notify('این قالب تصویر قابل تبدیل به PNG نبود؛ JPG، PNG یا GIF انتخاب کنید.');
      return;
    }
  }
  const data = new FormData();
  data.append(fieldFor(endpoint, store.get('uploadField')), blob, uploadName(blob.type, file.name));
  try {
    // zi2.ir sends no CORS headers, so a browser cannot post to it directly; the DocLoom server relays the upload.
    const viaServer = syncActive();
    const response = viaServer
      ? await fetch('/api/upload', { method: 'POST', headers: { 'X-DocLoom': '1', 'X-Upload-Target': endpoint }, body: data })
      : await fetch(endpoint, { method: 'POST', body: data });
    let result;
    try {
      result = await response.json();
    } catch {
      throw Error(response.status === 404 ? 'نشانی API آپلود پیدا نشد (404)' : 'پاسخ سرور آپلود قابل‌خواندن نبود');
    }
    if (result.error === 'upload-host-not-allowed') throw Error('سرور DocLoom فقط به zi2.ir آپلود می‌کند');
    if (!response.ok || result.success !== true) throw Error(replyError(result) || 'سرور آپلود را نپذیرفت');
    const url = safeURL(imageUrlFrom(result, endpoint));
    if (!url) throw Error('سرور لینک مستقیم تصویر را برنگرداند');
    if (!isHttps(url)) throw Error('لینک تصویر برگشتی باید HTTPS باشد');
    insertNode(docImage(url, file.name || 'تصویر آپلودشده'));
    store.set('pendingUpload', null);
    notify('تصویر آپلود شد و لینک در سند قرار گرفت.');
  } catch (err) {
    const blocked = err instanceof TypeError && !syncActive();
    notify('آپلود انجام نشد: ' + (blocked ? 'zi2.ir آپلود مستقیم از مرورگر را نمی‌پذیرد؛ برنامه را از سرور DocLoom (http://localhost:7123) باز کنید.' : err.message || 'اتصال یا مسیر API را بررسی کنید.'));
  }
}

export function initImages() {
  $('#imageFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const target = consumeImageTarget();
    readImage(file, target);
    if (target === 'upload' && file) uploadPendingImage();
    e.target.value = '';
  });
}
