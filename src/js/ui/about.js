// "About this app": version, where your documents actually live, and the licences.
// The storage line is the point of it — if the browser refuses persistent storage, the
// library is in memory only and the user has to know before they rely on it.
import { el } from '../core/dom.js';
import { store as appStore } from '../core/store.js';
import { openModal } from './modal.js';
import { db } from '../library/db.js';
import { VERSION, BUILT_AT, BUILD_ID, isDev } from '../core/version.js';
import { localDigits } from '../core/digits.js';
import { syncActive } from '../server/sync.js';

const LIBS = [
  ['Vazirmatn', 'OFL 1.1', { en: 'Bundled typography', fa: 'فونت' }],
  ['fflate', 'MIT', { en: 'ZIP archive for DOCX, PNG bundles & XLSX parsing', fa: 'زیپ برای Word و تصویر و خواندن اکسل' }],
  ['modern-screenshot', 'MIT', { en: 'PNG snapshot export', fa: 'خروجی تصویر' }],
  ['qrcode-generator', 'MIT', { en: 'QR code rendering', fa: 'کد QR' }],
];

const row = (label, value, extra = '') =>
  el('tr', {}, el('th', { scope: 'row', text: label }), el('td', {}, value, extra ? el('small', { text: ' ' + extra }) : null));

/**
 * How the document library is being stored right now, in plain words.
 * `storage` is a getter, not a value: a locked-down browser throws on the mere mention of
 * `localStorage`, and a default parameter would throw before the try/catch could catch it.
 */
export function storageState(database = db, storage = () => globalThis.localStorage, lang = 'en') {
  const en = lang !== 'fa';
  if (database.persistent) return { ok: true, text: en ? 'Browser IndexedDB (offline-first)' : 'پایگاه دادهٔ همین مرورگر (IndexedDB)' };
  let mirror = false;
  try {
    mirror = !!storage();
  } catch {
    mirror = false;
  }
  return {
    ok: false,
    text: mirror
      ? (en ? 'Persistent storage unavailable; documents persist until tab closes' : 'ذخیرهٔ دائمی در دسترس نیست؛ سندها فقط تا بستن صفحه می‌مانند')
      : (en ? 'Browser storage blocked; documents are held in memory only' : 'هیچ ذخیره‌سازی‌ای در دسترس نیست؛ سندها با بستن صفحه از بین می‌روند'),
  };
}

export function openAbout() {
  const lang = appStore.get('lang');
  const en = lang !== 'fa';
  const st = storageState(db, () => globalThis.localStorage, lang);
  const mode = syncActive()
    ? (en ? 'Connected to DocLoom Server' : 'متصل به سرور DocLoom')
    : location.protocol === 'file:'
      ? (en ? 'Standalone single-file (local)' : 'فایل تکی روی همین دستگاه')
      : (en ? 'Offline browser mode' : 'بدون سرور');

  const table = el(
    'table',
    { class: 'kbd-table about-table' },
    el(
      'tbody',
      {},
      row(en ? 'Version' : 'نسخه', isDev() ? (en ? 'Development build' : 'نسخهٔ توسعه') : localDigits(VERSION)),
      BUILT_AT ? row(en ? 'Built at' : 'تاریخ ساخت', localDigits(BUILT_AT)) : null,
      BUILD_ID ? row(en ? 'Build ID' : 'شناسهٔ ساخت', el('code', { dir: 'ltr', text: BUILD_ID }), en ? '— hard-refresh (Shift+Reload) if stale' : '— اگر با عددی که انتظار دارید نمی‌خواند، صفحه را با Shift+Reload تازه کنید') : null,
      row(en ? 'Runtime mode' : 'حالت اجرا', mode),
      row(en ? 'Document storage' : 'ذخیرهٔ سندها', st.text, st.ok ? '' : (en ? '— export a full JSON backup' : '— از «پشتیبان کامل» استفاده کنید')),
    ),
  );

  const libs = el(
    'ul',
    { class: 'about-libs' },
    ...LIBS.map(([name, licence, what]) => el('li', {}, el('b', { text: name }), ` — ${licence} · ${en ? what.en : what.fa}`)),
  );

  const body = el(
    'div',
    { class: 'about' },
    el('p', {
      class: 'modal-note',
      text: en
        ? 'DocLoom is an offline-first Markdown and bidirectional document studio: converts Markdown, spreadsheets (.xlsx/.xls/.csv), and FastReport (.fp3) files into print-ready HTML, PDF, and DOCX completely locally.'
        : 'استودیوی سند فارسی و دوجهته: Markdown، اکسل و گزارش‌های FastReport را به سند تمیز، چاپ، PDF و Word تبدیل می‌کند. همه‌چیز روی همین دستگاه انجام می‌شود و هیچ متنی به اینترنت فرستاده نمی‌شود.',
    }),
    table,
    el('p', { class: 'about-head', text: en ? 'Bundled Open-Source Libraries' : 'کتابخانه‌های استفاده‌شده' }),
    libs,
  );
  if (!st.ok) body.insertBefore(el('p', { class: 'form-error', role: 'alert', text: st.text + (en ? '. Export a backup before closing.' : '. پیش از بستن صفحه از کتابخانه پشتیبان بگیرید.') }), table);

  openModal({ title: en ? 'About DocLoom' : 'دربارهٔ DocLoom', body });
}
