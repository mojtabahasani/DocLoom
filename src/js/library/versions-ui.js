// Version history dialog: list, preview, restore. The browser keeps the newest 30 per document; with a server,
// the ones it pruned are still there (library/_retired) and are listed underneath.
import { el } from '../core/dom.js';
import { store } from '../core/store.js';
import { toFaDigits } from '../content/persian.js';
import { notify } from '../core/notify.js';
import { applyBidi } from '../content/bidi.js';

const REASON_EN = { auto: 'Auto', manual: 'Manual', 'before-cleanup': 'Before cleanup', 'before-import': 'Before import' };
const fmtEnDate = (ts) => {
  try {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
};
import { sanitizeToFragment } from '../content/sanitize.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { versions } from './versions.js';
import { library } from './library.js';
import { REASON_LABELS, MAX_VERSIONS } from './version-rules.js';
import { fmtDate } from './format.js';
import { syncActive } from '../server/sync.js';

/** Versions the server kept after this browser pruned them. Empty offline, on file://, or on any error. */
async function retiredVersions(docId, localIds) {
  if (!syncActive()) return [];
  try {
    const r = await fetch('/api/retired?doc=' + encodeURIComponent(docId), { headers: { 'X-DocLoom': '1' }, cache: 'no-store' });
    if (!r.ok) return [];
    return ((await r.json()).versions || [])
      .filter((v) => !localIds.has(v.id))
      .map((v) => ({
        ...v,
        remote: true,
        load: async () => {
          const e = await fetch(`/api/retired/versions/${docId}/${v.name}`, { headers: { 'X-DocLoom': '1' }, cache: 'no-store' }).then((x) => (x.ok ? x.json() : null));
          if (!e?.data) throw new Error('retired version unavailable');
          return e.data;
        },
      }));
  } catch {
    return [];
  }
}

export async function openVersions() {
  const en = store.get('lang') !== 'fa';
  const docId = library.currentId();
  const local = docId ? await versions.list(docId) : [];
  const list = local.map((v) => ({ ...v, size: (v.source || '').length, load: async () => v }));
  if (docId) list.push(...(await retiredVersions(docId, new Set(local.map((v) => v.id)))));
  const body = el('div', { class: 'ver-wrap' });
  let handle;
  const render = (items) => {
    body.replaceChildren();
    if (!items.length) {
      body.append(el('p', {
        class: 'ver-empty',
        text: en
          ? 'No saved versions yet. Press Cmd+S / Ctrl+S to snapshot; auto-versions save every 5 minutes of edits.'
          : 'هنوز نسخه‌ای ذخیره نشده است. با ⌘S یا Ctrl+S نسخه بسازید؛ نسخهٔ خودکار هم هر ۵ دقیقه تغییر ساخته می‌شود.',
      }));
      return;
    }
    const kept = items.filter((v) => v.remote).length;
    const localCount = items.length - kept;
    const noteText = en
      ? `${localCount} of max ${MAX_VERSIONS} versions in this browser. When full, oldest auto snapshots rotate out`
        + (kept ? `; ${kept} older versions remain on server below.` : syncActive() ? ' and stay archived on server.' : '.')
      : `${toFaDigits(localCount)} نسخه از حداکثر ${toFaDigits(MAX_VERSIONS)} در این مرورگر. با پر شدن سقف، قدیمی‌ترین نسخه‌های خودکار از مرورگر کنار می‌روند`
        + (kept ? `؛ ${toFaDigits(kept)} نسخهٔ قدیمی‌تر روی سرور مانده و پایین همین فهرست است.` : syncActive() ? ' و روی سرور می‌مانند.' : '.');
    body.append(el('p', { class: 'modal-note', text: noteText }));
    const ul = el('ul', { class: 'ver-list' });
    for (const v of items) {
      const prev = el('div', { class: 'ver-preview paper', hidden: true, 'data-doc-theme': (v.layout && v.layout.theme) || 'navy' });
      const failed = () => notify('این نسخه از سرور خوانده نشد.');
      const toggle = el('button', { type: 'button', class: 'btn', text: en ? 'Preview' : 'پیش‌نمایش', 'aria-expanded': 'false' });
      toggle.addEventListener('click', async () => {
        if (prev.hidden && !prev.childNodes.length) {
          const full = await v.load().catch(() => null);
          if (!full) return failed();
          prev.dataset.docTheme = full.layout?.theme || 'navy';
          prev.append(sanitizeToFragment(full.html || ''));
          applyBidi(prev, en ? 'ltr' : 'rtl');
        }
        prev.hidden = !prev.hidden;
        toggle.setAttribute('aria-expanded', String(!prev.hidden));
        toggle.textContent = prev.hidden ? (en ? 'Preview' : 'پیش‌نمایش') : (en ? 'Hide Preview' : 'بستن پیش‌نمایش');
      });
      const restore = el('button', { type: 'button', class: 'btn primary', text: en ? 'Restore' : 'بازگردانی' });
      restore.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: en ? 'Restore Version' : 'بازگردانی نسخه',
          message: en
            ? 'Current content will be saved as a manual snapshot first, then replaced by this version.'
            : 'محتوای فعلی به‌عنوان یک نسخهٔ دستی ذخیره می‌شود و سپس این نسخه جایگزین آن می‌شود.',
          confirmLabel: en ? 'Restore' : 'بازگردانی',
          cancelLabel: en ? 'Cancel' : 'انصراف',
        });
        if (!ok) return;
        const full = await v.load().catch(() => null);
        if (!full) return failed();
        await library.restoreVersion(full);
        handle.close();
      });
      const reasonText = (en ? REASON_EN[v.reason] || v.reason : REASON_LABELS[v.reason] || v.reason) + (v.remote ? (en ? ' · On server' : ' · روی سرور') : '');
      const charsText = Math.round((v.size || 0) / 100) / 10 + (en ? 'k chars' : 'k نویسه');
      ul.append(
        el('li', { class: 'ver-item' },
          el('div', { class: 'ver-row' },
            el('div', { class: 'ver-info' }, el('b', { text: en ? fmtEnDate(v.savedAt) : fmtDate(v.savedAt) }), el('span', { class: 'ver-reason ' + v.reason, text: reasonText }),
              el('small', { text: (v.title || (en ? 'Untitled Document' : 'بدون عنوان')) + ' · ' + charsText })),
            el('div', { class: 'ver-acts' }, toggle, restore)),
          prev),
      );
    }
    body.append(ul);
  };
  render(list);
  handle = openModal({ title: en ? 'Version History' : 'نسخه‌های سند', body, wide: true });
  if (!docId) notify('ابتدا چیزی در سند بنویسید.');
}
