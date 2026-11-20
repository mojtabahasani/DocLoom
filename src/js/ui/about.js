// "About this app": version, where your documents actually live, and the licences.
// The storage line is the point of it — if the browser refuses persistent storage, the
// library is in memory only and the user has to know before they rely on it.
import { el } from '../core/dom.js';
import { openModal } from './modal.js';
import { db } from '../library/db.js';
import { VERSION, BUILT_AT, BUILD_ID, isDev } from '../core/version.js';
import { toFaDigits } from '../content/persian.js';
import { syncActive } from '../server/sync.js';

const LIBS = [
  ['وزیرمتن', 'OFL 1.1', 'فونت'],
  ['fflate', 'MIT', 'زیپ برای Word و تصویر و خواندن اکسل'],
  ['modern-screenshot', 'MIT', 'خروجی تصویر'],
  ['qrcode-generator', 'MIT', 'کد QR'],
];

const row = (label, value, extra = '') =>
  el('tr', {}, el('th', { scope: 'row', text: label }), el('td', {}, value, extra ? el('small', { text: ' ' + extra }) : null));

/**
 * How the document library is being stored right now, in plain words.
 * `storage` is a getter, not a value: a locked-down browser throws on the mere mention of
 * `localStorage`, and a default parameter would throw before the try/catch could catch it.
 */
export function storageState(database = db, storage = () => globalThis.localStorage) {
  if (database.persistent) return { ok: true, text: 'پایگاه دادهٔ همین مرورگر (IndexedDB)' };
  let mirror = false;
  try {
    mirror = !!storage();
  } catch {
    mirror = false;
  }
  return {
    ok: false,
    text: mirror
      ? 'ذخیرهٔ دائمی در دسترس نیست؛ سندها فقط تا بستن صفحه می‌مانند'
      : 'هیچ ذخیره‌سازی‌ای در دسترس نیست؛ سندها با بستن صفحه از بین می‌روند',
  };
}

export function openAbout() {
  const store = storageState();
  const mode = syncActive() ? 'متصل به سرور دیتاسیو' : location.protocol === 'file:' ? 'فایل تکی روی همین دستگاه' : 'بدون سرور';

  const table = el(
    'table',
    { class: 'kbd-table about-table' },
    el(
      'tbody',
      {},
      row('نسخه', isDev() ? 'نسخهٔ توسعه' : toFaDigits(VERSION)),
      BUILT_AT ? row('تاریخ ساخت', toFaDigits(BUILT_AT)) : null,
      BUILD_ID ? row('شناسهٔ ساخت', el('code', { dir: 'ltr', text: BUILD_ID }), '— اگر با عددی که انتظار دارید نمی‌خواند، صفحه را با Shift+Reload تازه کنید') : null,
      row('حالت اجرا', mode),
      row('ذخیرهٔ سندها', store.text, store.ok ? '' : '— از «پشتیبان کامل» استفاده کنید'),
    ),
  );

  const libs = el(
    'ul',
    { class: 'about-libs' },
    ...LIBS.map(([name, licence, what]) => el('li', {}, el('b', { text: name }), ` — ${licence} · ${what}`)),
  );

  const body = el(
    'div',
    { class: 'about' },
    el('p', { class: 'modal-note', text: 'استودیوی سند فارسی: Markdown و اکسل بانکی و گزارش صبا را به سند تمیز، چاپ، PDF و Word تبدیل می‌کند. همه‌چیز روی همین دستگاه انجام می‌شود و هیچ متنی به اینترنت فرستاده نمی‌شود.' }),
    table,
    el('p', { class: 'about-head', text: 'کتابخانه‌های استفاده‌شده' }),
    libs,
  );
  if (!store.ok) body.insertBefore(el('p', { class: 'form-error', role: 'alert', text: store.text + '. پیش از بستن صفحه از کتابخانه پشتیبان بگیرید.' }), table);

  openModal({ title: 'دربارهٔ دیتاسیو', body });
}
