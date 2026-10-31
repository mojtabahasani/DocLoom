// Header: document title, export menu, new document, ⌘K chip (brand slot arrives in package 3).
import { $, $$ } from '../core/dom.js';
import { palette } from './palette.js';
import { exportHTML, exportMarkdown, exportEmail, exportPDF, exportPDFServer, exportInteractive, exportDocx, exportPNG, presentDocument, exportPresentation } from '../export/actions.js';
import { openBatch } from '../server/batch-ui.js';
import { openShare } from '../server/share-ui.js';
import { setPageNumbers, getPageNumbers } from '../server/pdf-client.js';
import { newDocument } from '../editor/document.js';

const ACTIONS = { html: exportHTML, interactive: exportInteractive, markdown: exportMarkdown, docx: exportDocx, png: exportPNG, present: presentDocument, 'present-file': exportPresentation, email: exportEmail, pdf: exportPDF, 'pdf-direct': exportPDFServer, batch: () => openBatch(), share: () => openShare() };

export function initTopbar() {
  const btn = $('#exportMenuBtn');
  const menu = $('#exportMenu');
  const setOpen = (open) => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) $$('button:not(:disabled)', menu).find((b) => !b.closest('[hidden]'))?.focus();
  };
  btn.addEventListener('click', () => setOpen(menu.hidden));
  document.addEventListener('mousedown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });
  menu.addEventListener('keydown', (e) => {
    const items = $$('button:not(:disabled)', menu).filter((b) => !b.closest('[hidden]'));
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      setOpen(false);
      btn.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length].focus();
    }
  });
  $$('[data-export]').forEach((b) =>
    b.addEventListener('click', () => {
      setOpen(false);
      ACTIONS[b.dataset.export]();
    }),
  );
  const num = $('#pdfNumbers');
  if (num) {
    const paint = () => num.setAttribute('aria-checked', String(getPageNumbers()));
    num.addEventListener('click', () => {
      setPageNumbers(!getPageNumbers());
      paint();
    });
    btn.addEventListener('click', paint);
    paint();
  }
  $('#quickHtml').addEventListener('click', exportHTML);
  $('#clear').addEventListener('click', newDocument);
  $('#paletteHint').addEventListener('click', () => palette.open());
}
