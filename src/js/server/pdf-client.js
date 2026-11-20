// «PDF مستقیم»: the server's headless Chrome prints the exported page; without the server (or Chrome) the print dialog is used.
import { store } from '../core/store.js';
import { notify } from '../core/notify.js';
import { isEmpty } from '../editor/preview.js';
import { buildExportHTML } from '../export/html.js';
import { printDocument } from '../export/print.js';
import { saveAs, safeFilename } from '../export/files.js';
import { syncActive } from './sync.js';
import { readStored, writeStored } from '../core/naming.js';

const NUM_KEY = 'datasave.pdfPageNumbers';
export const getPageNumbers = () => readStored(NUM_KEY) === '1';
export const setPageNumbers = (on) => writeStored(NUM_KEY, on ? '1' : '0');

export async function exportPDFDirect() {
  if (isEmpty()) return notify('ابتدا متن یا فایل خود را وارد کنید.');
  const fallback = (why) => {
    notify(why + ' پنجرهٔ چاپ باز شد.');
    printDocument();
  };
  if (!syncActive()) return fallback('PDF مستقیم به سرور دیتاسیو نیاز دارد.');
  notify('در حال ساخت PDF…');
  let bytes;
  try {
    const r = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'X-DataSave': '1', 'Content-Type': 'application/json' },
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
