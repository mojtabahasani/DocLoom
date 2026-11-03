// "Copy report prompt": shows the prompt for an outside model (ChatGPT / Gemini) with a copy button.
import { el } from '../core/dom.js';
import { openModal } from './modal.js';
import { copyPlain } from '../export/files.js';
import { reportPrompt } from '../content/report-prompt.js';
import { store } from '../core/store.js';

export function openReportPrompt() {
  const letter = el('input', { type: 'checkbox', id: 'promptLetter', ...(store.get('mode') === 'letter' ? { checked: true } : {}) });
  const box = el('textarea', { class: 'prompt-sheet', readonly: true, rows: 14, spellcheck: 'false', 'aria-label': 'متن پرامپت' });
  const sync = () => {
    box.value = reportPrompt({ letter: letter.checked });
  };
  letter.addEventListener('change', sync);
  sync();

  const body = el(
    'div',
    { class: 'prompt-wrap' },
    el('p', { class: 'modal-note', text: 'این متن را در ابتدای گفتگو با ChatGPT، جمینی یا هر مدل دیگری بگذارید، بعد فایل یا توضیحاتتان را بدهید. خروجی‌اش بدون اصلاح در همین برنامه باز می‌شود.' }),
    el('div', { class: 'field inline' }, letter, el('label', { for: 'promptLetter', text: 'افزودن قواعد نامهٔ اداری' })),
    box,
  );

  openModal({
    title: 'پرامپت گزارش برای هوش مصنوعی',
    body,
    wide: true,
    actions: [
      { label: 'بستن', kind: '' },
      { label: 'کپی پرامپت', kind: 'primary', onClick: () => copyPlain(box.value) },
    ],
  });
}
