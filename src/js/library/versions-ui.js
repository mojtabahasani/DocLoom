// Version history dialog: list, preview, restore. The browser keeps the newest 30 per document; with a server,
// the ones it pruned are still there (library/_retired) and are listed underneath.
import { el } from '../core/dom.js';
import { toFaDigits } from '../content/persian.js';
import { notify } from '../core/notify.js';
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
    const r = await fetch('/api/retired?doc=' + encodeURIComponent(docId), { headers: { 'X-MD2Html': '1' }, cache: 'no-store' });
    if (!r.ok) return [];
    return ((await r.json()).versions || [])
      .filter((v) => !localIds.has(v.id))
      .map((v) => ({
        ...v,
        remote: true,
        load: async () => {
          const e = await fetch(`/api/retired/versions/${docId}/${v.name}`, { headers: { 'X-MD2Html': '1' }, cache: 'no-store' }).then((x) => (x.ok ? x.json() : null));
          if (!e?.data) throw new Error('retired version unavailable');
          return e.data;
        },
      }));
  } catch {
    return [];
  }
}

export async function openVersions() {
  const docId = library.currentId();
  const local = docId ? await versions.list(docId) : [];
  const list = local.map((v) => ({ ...v, size: (v.source || '').length, load: async () => v }));
  if (docId) list.push(...(await retiredVersions(docId, new Set(local.map((v) => v.id)))));
  const body = el('div', { class: 'ver-wrap' });
  let handle;
  const render = (items) => {
    body.replaceChildren();
    if (!items.length) {
      body.append(el('p', { class: 'ver-empty', text: 'هنوز نسخه‌ای ذخیره نشده است. با ⌘S یا Ctrl+S نسخه بسازید؛ نسخهٔ خودکار هم هر ۵ دقیقه تغییر ساخته می‌شود.' }));
      return;
    }
    const kept = items.filter((v) => v.remote).length;
    body.append(el('p', { class: 'modal-note', text: `${toFaDigits(items.length - kept)} نسخه از حداکثر ${toFaDigits(MAX_VERSIONS)} در این مرورگر. با پر شدن سقف، قدیمی‌ترین نسخه‌های خودکار از مرورگر کنار می‌روند`
      + (kept ? `؛ ${toFaDigits(kept)} نسخهٔ قدیمی‌تر روی سرور مانده و پایین همین فهرست است.` : syncActive() ? ' و روی سرور می‌مانند.' : '.') }));
    const ul = el('ul', { class: 'ver-list' });
    for (const v of items) {
      const prev = el('div', { class: 'ver-preview paper', hidden: true, 'data-doc-theme': (v.layout && v.layout.theme) || 'navy' });
      const failed = () => notify('این نسخه از سرور خوانده نشد.');
      const toggle = el('button', { type: 'button', class: 'btn', text: 'پیش‌نمایش', 'aria-expanded': 'false' });
      toggle.addEventListener('click', async () => {
        if (prev.hidden && !prev.childNodes.length) {
          const full = await v.load().catch(() => null);
          if (!full) return failed();
          prev.dataset.docTheme = full.layout?.theme || 'navy';
          prev.append(sanitizeToFragment(full.html || ''));
        }
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
        const full = await v.load().catch(() => null);
        if (!full) return failed();
        await library.restoreVersion(full);
        handle.close();
      });
      ul.append(
        el('li', { class: 'ver-item' },
          el('div', { class: 'ver-row' },
            el('div', { class: 'ver-info' }, el('b', { text: fmtDate(v.savedAt) }), el('span', { class: 'ver-reason ' + v.reason, text: (REASON_LABELS[v.reason] || v.reason) + (v.remote ? ' · روی سرور' : '') }),
              el('small', { text: (v.title || 'بدون عنوان') + ' · ' + Math.round((v.size || 0) / 100) / 10 + 'k نویسه' })),
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
