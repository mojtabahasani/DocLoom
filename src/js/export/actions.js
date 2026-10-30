// Export entry points used by the header menu (and the ⌘K palette in package 1B).
import { store } from '../core/store.js';
import { notify } from '../core/notify.js';
import { isEmpty, preview } from '../editor/preview.js';
import { buildExportHTML } from './html.js';
import { htmlToMarkdown } from './markdown.js';
import { buildEmail, emailDialog } from './email.js';
import { printDocument } from './print.js';
import { saveAs, safeFilename } from './files.js';

const guard = (fn) => () => (isEmpty() ? notify('ابتدا متن یا فایل خود را وارد کنید.') : fn());

export const exportHTML = guard(() => saveAs(safeFilename(store.get('title'), 'html'), buildExportHTML(), 'text/html;charset=utf-8', 'سند HTML'));
export const exportMarkdown = guard(() =>
  saveAs(safeFilename(store.get('title'), 'md'), htmlToMarkdown(preview), 'text/markdown;charset=utf-8', 'سند Markdown'),
);
export const exportEmail = guard(() => emailDialog(buildEmail()));
export const exportPDF = guard(printDocument);
