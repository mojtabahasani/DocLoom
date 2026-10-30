// Header: document title, export menu, new document, ⌘K chip (brand slot arrives in package 3).
import { $, $$ } from '../core/dom.js';
import { palette } from './palette.js';
import { exportHTML, exportMarkdown, exportEmail, exportPDF } from '../export/actions.js';
import { newDocument } from '../editor/document.js';

const ACTIONS = { html: exportHTML, markdown: exportMarkdown, email: exportEmail, pdf: exportPDF };

export function initTopbar() {
  const btn = $('#exportMenuBtn');
  const menu = $('#exportMenu');
  const setOpen = (open) => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('button').focus();
  };
  btn.addEventListener('click', () => setOpen(menu.hidden));
  document.addEventListener('mousedown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });
  menu.addEventListener('keydown', (e) => {
    const items = $$('button', menu);
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
  $('#quickHtml').addEventListener('click', exportHTML);
  $('#clear').addEventListener('click', newDocument);
  $('#paletteHint').addEventListener('click', () => palette.open());
}
