// «PDF مستقیم»: the server's headless Chrome prints the exported page; without the server (or Chrome) the print dialog is used.
import { store } from '../core/store.js';
import { notify } from '../core/notify.js';
import { isEmpty } from '../editor/preview.js';
import { buildExportHTML } from '../export/html.js';
import { printDocument } from '../export/print.js';
import { saveAs, safeFilename } from '../export/files.js';
import { syncActive } from './sync.js';

const NUM_KEY = 'md2html.pdfPageNumbers';
export const getPageNumbers = () => {
  try {
    return localStorage.getItem(NUM_KEY) === '1';
  } catch {
    return false;
  }
};
export const setPageNumbers = (on) => {
  try {
    localStorage.setItem(NUM_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable: the choice lasts until reload only */
  }
};

export async function exportPDFDirect() {
  if (isEmpty()) return notify('ابتدا متن یا فایل خود را وارد کنید.');
  const fallback = (why) => {
    notify(why + ' پنجرهٔ چاپ باز شد.');
    printDocument();
  };
  if (!syncActive()) return fallback('PDF مستقیم به سرور MD2Html نیاز دارد.');
  notify('در حال ساخت PDF…');
  let bytes;
  try {
    const r = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'X-MD2Html': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: buildExportHTML(), pageNumbers: getPageNumbers() }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return fallback(j.error === 'chrome-unavailable' ? 'Chrome روی سرور پیدا نشد.' : 'ساخت PDF روی سرور انجام نشد.');
    }
    bytes = new Uint8Array(await r.arrayBuffer());
  } catch {
    return fallback('سرور در دسترس نیست.');
  }
  await saveAs(safeFilename(store.get('title'), 'pdf'), bytes, 'application/pdf', 'سند PDF');
}
