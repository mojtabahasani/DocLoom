// "Copy report prompt": shows the prompt for an outside model (ChatGPT / Gemini) with a copy button.
import { el } from '../core/dom.js';
import { openModal } from './modal.js';
import { copyPlain } from '../export/files.js';
import { reportPrompt } from '../content/report-prompt.js';
import { store } from '../core/store.js';

export function openReportPrompt() {
  const en = store.get('lang') !== 'fa';
  const letter = el('input', { type: 'checkbox', id: 'promptLetter', ...(store.get('mode') === 'letter' ? { checked: true } : {}) });
  const box = el('textarea', {
    class: 'prompt-sheet',
    readonly: true,
    rows: 14,
    dir: en ? 'ltr' : 'rtl',
    spellcheck: 'false',
    'aria-label': en ? 'Prompt text' : 'متن پرامپت',
  });
  const sync = () => {
    box.value = reportPrompt({ letter: letter.checked, lang: en ? 'en' : 'fa' });
  };
  letter.addEventListener('change', sync);
  sync();

  const body = el(
    'div',
    { class: 'prompt-wrap' },
    el('p', {
      class: 'modal-note',
      text: en
        ? 'Paste this prompt at the start of a ChatGPT, Claude, or Gemini conversation, then attach your notes or data. The Markdown output opens cleanly in DocLoom.'
        : 'این متن را در ابتدای گفتگو با ChatGPT، جمینی یا هر مدل دیگری بگذارید، بعد فایل یا توضیحاتتان را بدهید. خروجی‌اش بدون اصلاح در همین برنامه باز می‌شود.',
    }),
    el('div', { class: 'field inline' }, letter, el('label', { for: 'promptLetter', text: en ? 'Include official letter header rules' : 'افزودن قواعد نامهٔ اداری' })),
    box,
  );

  openModal({
    title: en ? 'AI Report Prompt' : 'پرامپت گزارش برای هوش مصنوعی',
    body,
    wide: true,
    actions: [
      { label: en ? 'Close' : 'بستن', kind: '' },
      { label: en ? 'Copy Prompt' : 'کپی پرامپت', kind: 'primary', onClick: () => copyPlain(box.value) },
    ],
  });
}
