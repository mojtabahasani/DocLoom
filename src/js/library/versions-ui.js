// Version history dialog: list, preview, restore.
import { el } from '../core/dom.js';
import { toFaDigits } from '../content/persian.js';
import { notify } from '../core/notify.js';
import { sanitizeToFragment } from '../content/sanitize.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { versions } from './versions.js';
import { library } from './library.js';
import { REASON_LABELS, MAX_VERSIONS } from './version-rules.js';
import { fmtDate } from './format.js';

export async function openVersions() {
  const docId = library.currentId();
  const list = docId ? await versions.list(docId) : [];
  const body = el('div', { class: 'ver-wrap' });
  let handle;
  const render = (items) => {
    body.replaceChildren();
    if (!items.length) {
      body.append(el('p', { class: 'ver-empty', text: 'هنوز نسخه‌ای ذخیره نشده است. با ⌘S یا Ctrl+S نسخه بسازید؛ نسخهٔ خودکار هم هر ۵ دقیقه تغییر ساخته می‌شود.' }));
      return;
    }
    body.append(el('p', { class: 'modal-note', text: `${toFaDigits(items.length)} نسخه از حداکثر ${toFaDigits(MAX_VERSIONS)}. با پر شدن سقف، قدیمی‌ترین نسخه‌های خودکار حذف می‌شوند.` }));
    const ul = el('ul', { class: 'ver-list' });
    for (const v of items) {
      const prev = el('div', { class: 'ver-preview paper', hidden: true, 'data-doc-theme': (v.layout && v.layout.theme) || 'navy' });
      const toggle = el('button', { type: 'button', class: 'btn', text: 'پیش‌نمایش', 'aria-expanded': 'false' });
      toggle.addEventListener('click', () => {
        if (prev.hidden && !prev.childNodes.length) prev.append(sanitizeToFragment(v.html || ''));
        prev.hidden = !prev.hidden;
        toggle.setAttribute('aria-expanded', String(!prev.hidden));
        toggle.textContent = prev.hidden ? 'پیش‌نمایش' : 'بستن پیش‌نمایش';
      });
      const restore = el('button', { type: 'button', class: 'btn primary', text: 'بازگردانی' });
      restore.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'بازگردانی نسخه', message: 'محتوای فعلی به‌عنوان یک نسخهٔ دستی ذخیره می‌شود و سپس این نسخه جایگزین آن می‌شود.',
          confirmLabel: 'بازگردانی',
        });
        if (!ok) return;
        await library.restoreVersion(v);
        handle.close();
      });
      ul.append(
        el('li', { class: 'ver-item' },
          el('div', { class: 'ver-row' },
            el('div', { class: 'ver-info' }, el('b', { text: fmtDate(v.savedAt) }), el('span', { class: 'ver-reason ' + v.reason, text: REASON_LABELS[v.reason] || v.reason }),
              el('small', { text: (v.title || 'بدون عنوان') + ' · ' + Math.round((v.source || '').length / 100) / 10 + 'k نویسه' })),
            el('div', { class: 'ver-acts' }, toggle, restore)),
          prev),
      );
    }
    body.append(ul);
  };
  render(list);
  handle = openModal({ title: 'نسخه‌های سند', body, wide: true });
  if (!docId) notify('ابتدا چیزی در سند بنویسید.');
}
