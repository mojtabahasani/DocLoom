// Export entry points used by the header menu (and the ⌘K palette in package 1B).
import { store } from '../core/store.js';
import { notify } from '../core/notify.js';
import { isEmpty, preview } from '../editor/preview.js';
import { buildExportHTML } from './html.js';
import { htmlToMarkdown } from './markdown.js';
import { buildEmail, emailDialog } from './email.js';
import { printDocument } from './print.js';
import { exportPDFDirect } from '../server/pdf-client.js';
import { saveAs, safeFilename } from './files.js';
import { buildInteractiveHTML } from './interactive.js';
import { buildDocxFromPreview } from './docx-export.js';
import { DOCX_MIME } from './docx.js';
import { exportPNG as pngDialog } from './png.js';
import { startPresentation, exportPresentation as presentFile } from './present.js';

// A failing export reports a Persian message and never touches the document.
const guard = (fn, failMsg = 'ساخت خروجی ناموفق بود؛ سند دست‌نخورده است.') => async () => {
  if (isEmpty()) return notify('ابتدا متن یا فایل خود را وارد کنید.');
  try {
    await fn();
  } catch (e) {
    console.error(e);
    notify(failMsg);
  }
};

export const exportHTML = guard(() => saveAs(safeFilename(store.get('title'), 'html'), buildExportHTML(), 'text/html;charset=utf-8', 'سند HTML'));
export const exportMarkdown = guard(() =>
  saveAs(safeFilename(store.get('title'), 'md'), htmlToMarkdown(preview), 'text/markdown;charset=utf-8', 'سند Markdown'),
);
export const exportEmail = guard(() => emailDialog(buildEmail()));
export const exportPDF = guard(printDocument);
export const exportPDFServer = guard(() => exportPDFDirect());
export const exportInteractive = guard(() =>
  saveAs(safeFilename((store.get('title') || 'docloom-document') + '-تعاملی', 'html'), buildInteractiveHTML(), 'text/html;charset=utf-8', 'سند HTML تعاملی'),
);
export const exportDocx = guard(async () => {
  notify('در حال ساخت فایل Word…');
  const bytes = await buildDocxFromPreview();
  await saveAs(safeFilename(store.get('title'), 'docx'), bytes, DOCX_MIME, 'سند Word');
}, 'ساخت فایل Word ناموفق بود؛ سند دست‌نخورده است.');
export const exportPNG = guard(pngDialog, 'ساخت تصویر ناموفق بود؛ سند دست‌نخورده است.');
export const presentDocument = guard(startPresentation);
export const exportPresentation = guard(presentFile);
