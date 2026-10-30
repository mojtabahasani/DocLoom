// PDF export = print the standalone HTML in a new window.
import { store } from '../core/store.js';
import { notify } from '../core/notify.js';
import { buildExportHTML } from './html.js';

export function printDocument() {
  const w = window.open('', '_blank');
  if (!w) {
    notify('پنجرهٔ چاپ مسدود شد؛ اجازهٔ بازشدن پنجره را بدهید.');
    return;
  }
  const html = buildExportHTML().replace('</head>', `<style>@page{size:A4 portrait;margin:${store.get('margin')}mm}</style></head>`);
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
  }, 400);
}
