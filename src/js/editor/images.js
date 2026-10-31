// Image intake: file picker, clipboard paste, header/footer images, zi2.ir upload.
import { store } from '../core/store.js';
import { $, el } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { safeURL, isHttps } from '../content/url.js';
import { insertNode, refreshFurniture } from './preview.js';
import { confirmDialog } from '../ui/modal.js';

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

export async function uploadPendingImage() {
  const endpoint = store.get('uploadEndpoint').trim();
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
  const data = new FormData();
  data.append(store.get('uploadField') || 'file', file, file.name || 'image.png');
  try {
    const response = await fetch(endpoint, { method: 'POST', body: data });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw Error(result.message || 'سرور آپلود را نپذیرفت');
    const item = result.data?.upload || result.data || {};
    let url = safeURL(item.fileUrl || item.url || '');
    if (url) {
      const parsed = new URL(url);
      if (/\/api\/upload\/upload\.php\/storage\/uploads\//.test(parsed.pathname)) {
        parsed.pathname = '/storage/uploads/' + parsed.pathname.split('/storage/uploads/').pop();
        url = parsed.href;
      }
    }
    if (!url) throw Error('سرور لینک مستقیم تصویر را برنگرداند');
    if (!isHttps(url)) throw Error('لینک تصویر برگشتی باید HTTPS باشد');
    insertNode(docImage(url, file.name || 'تصویر آپلودشده'));
    store.set('pendingUpload', null);
    notify('تصویر آپلود شد و لینک در سند قرار گرفت.');
  } catch (err) {
    notify('آپلود انجام نشد: ' + (err.message || 'اتصال، CORS یا مسیر API را بررسی کنید.'));
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
