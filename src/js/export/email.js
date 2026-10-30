// Email export: inline-styled HTML + a modal to copy subject / content / plain text.
import { store } from '../core/store.js';
import { el } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { sanitizeChildren } from '../content/sanitize.js';
import { preview, plainText } from '../editor/preview.js';
import { THEME_COLORS } from './html.js';
import { copyPlain } from './files.js';
import { openModal } from '../ui/modal.js';

export function buildEmail() {
  const root = document.createElement('div');
  root.append(sanitizeChildren(preview));
  const c = THEME_COLORS[store.get('theme')] || THEME_COLORS.navy;
  const sty = (e) => {
    const t = e.tagName;
    let css = 'font-family:Tahoma,Arial,sans-serif;direction:rtl;line-height:1.9;color:#26383b;';
    if (/^H[1-6]$/.test(t)) css += `color:${c[0]};font-weight:bold;margin:16px 0 8px;`;
    if (t === 'P') css += 'margin:10px 0;';
    if (t === 'BLOCKQUOTE' || e.classList.contains('card') || e.classList.contains('cover'))
      css += `background-color:${c[1]};border-right:4px solid ${c[0]};padding:12px 16px;margin:14px 0;`;
    if (t === 'A') css += `color:${c[0]};`;
    if (t === 'TABLE') css += 'border-collapse:collapse;width:100%;';
    if (t === 'TH') css += `background-color:${c[0]};color:#fff;padding:8px;border:1px solid #ddd;`;
    if (t === 'TD') css += 'padding:8px;border:1px solid #ddd;';
    if (t === 'IMG') css += 'max-width:100%;height:auto;';
    e.style.cssText = css + e.style.cssText;
    e.removeAttribute('class');
    Array.from(e.children).forEach(sty);
  };
  Array.from(root.children).forEach(sty);
  return { subject: store.get('title') || 'سند فارسی', html: root.innerHTML, text: plainText() };
}

export function emailDialog(result) {
  const subject = el('input', { value: result.subject, readonly: true, 'data-autofocus': '' });
  const view = el('div', { class: 'emailview', contenteditable: 'true', role: 'textbox', 'aria-label': 'پیش‌نمایش ایمیل قابل انتخاب' });
  // result.html was produced from sanitized nodes; the wrapper markup is static.
  view.innerHTML =
    '<table role="presentation" dir="rtl" width="100%" style="border-collapse:collapse;background:#f4f6f4"><tr><td align="center" style="padding:16px">' +
    '<table role="presentation" width="680" style="width:100%;max-width:680px;background:#fffefa;border:1px solid #e5e8e4;border-collapse:collapse"><tr>' +
    '<td dir="rtl" style="padding:24px;font:15px/1.9 Tahoma,Arial,sans-serif;color:#26383b;text-align:right">' +
    result.html + '</td></tr></table></td></tr></table>';
  const body = el(
    'div',
    {},
    el('p', { class: 'modal-note', text: 'موضوع را کپی کنید، سپس محتوای پیش‌نمایش را انتخاب و کپی کنید و در ایمیل بچسبانید. سرویس گیرنده ممکن است بخشی از قالب را تغییر دهد.' }),
    el('div', { class: 'field' }, el('label', { text: 'موضوع ایمیل' }), subject),
    view,
  );
  openModal({
    title: 'ایمیل فارسی آمادهٔ ارسال',
    body,
    wide: true,
    actions: [
      { label: 'کپی موضوع', kind: 'soft', keepOpen: true, onClick: () => copyPlain(result.subject) },
      {
        label: 'انتخاب محتوای ایمیل',
        kind: 'primary',
        keepOpen: true,
        onClick: () => {
          const range = document.createRange();
          range.selectNodeContents(view);
          const sel = getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          view.focus();
          notify('محتوا انتخاب شد؛ آن را کپی کنید.');
        },
      },
      { label: 'کپی متن ساده', keepOpen: true, onClick: () => copyPlain(result.text) },
    ],
  });
}
