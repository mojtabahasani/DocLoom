// «تبدیل گروهی»: pick files / folders, formats, brand, destination → server job → progress (fills left→right) → report.
import { $, el, icon } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { toFaDigits as fa } from '../content/persian.js';
import { openModal } from '../ui/modal.js';
import { palette } from '../ui/palette.js';
import { brands } from '../brand/brands.js';
import { fapi, errorText } from './files-api.js';
import { baseName, extOf } from './files-core.js';
import { crumbBar } from './files-picker.js';
import { syncActive } from './sync.js';

const SRC_EXT = new Set(['.md', '.markdown', '.txt', '.html', '.htm']);
const REASONS = {
  'render-timeout': 'مهلت ۶۰ ثانیه تمام شد.',
  'chrome-unavailable': 'Chrome روی سرور پیدا نشد.',
  'render-failed': 'ساخت صفحه ناموفق بود.',
  'chrome-closed': 'Chrome ناگهان بسته شد.',
  cdp: 'خطای ارتباط با Chrome.',
  'file-too-large': 'فایل از ۵ مگابایت بزرگ‌تر است.',
};
const reason = (c) => REASONS[c] || 'خطا: ' + c;

async function bapi(method, url, body) {
  const r = await fetch(url, { method, headers: { 'X-DocLoom': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'http ' + r.status), { status: r.status });
  return j;
}

export function openBatch() {
  if (!syncActive()) return void notify('تبدیل گروهی به سرور DocLoom نیاز دارد؛ برنامه را از http://localhost:7123 باز کنید.');
  const st = { sel: new Map(), pdf: true, html: false, brand: '', cleanup: false, pageNumbers: false, dest: 'beside', destDir: '' };
  const body = el('div', { class: 'bt' });
  const modal = openModal({ title: 'تبدیل گروهی', body, wide: true });
  let poll = 0;
  let jobId = null;
  const stop = () => clearTimeout(poll);

  // ---- browsing (select sources / choose destination) ----
  async function browse(mode, dir = '') {
    stop();
    let data;
    try {
      data = dir ? await fapi.list(dir) : { path: '', root: null, parent: null, entries: (await fapi.roots()).roots.map((r) => ({ name: r.name, path: r.path, kind: 'dir' })) };
    } catch (e) {
      notify(errorText(e));
      return mainView();
    }
    const go = (p) => browse(mode, p);
    const list = el('ul', { class: 'f-list bt-list', 'aria-label': mode === 'src' ? 'فایل‌ها و پوشه‌ها' : 'پوشه‌ها' });
    const entries = data.entries.filter((e) => e.kind === 'dir' || (mode === 'src' && SRC_EXT.has(extOf(e.name))));
    for (const e of entries) {
      const row = el('li', { class: 'bt-row' });
      if (mode === 'src') {
        const cb = el('input', { type: 'checkbox', 'aria-label': 'انتخاب ' + e.name });
        cb.checked = st.sel.has(e.path);
        cb.addEventListener('change', () => (cb.checked ? st.sel.set(e.path, e.kind) : st.sel.delete(e.path)) || paintCount());
        row.append(cb);
      }
      row.append(el('button', { type: 'button', class: 'f-open', onclick: e.kind === 'dir' ? () => go(e.path) : (ev) => ev.currentTarget.previousSibling?.click() }, icon(e.kind === 'dir' ? 'folder' : 'file'), el('span', { class: 'f-text' }, el('span', { class: 'f-name', text: e.name }))));
      list.append(row);
    }
    if (!entries.length) list.append(el('li', { class: 'f-none', text: 'چیزی در این پوشه نیست.' }));
    const count = el('span', { class: 'f-status' });
    const paintCount = () => (count.textContent = mode === 'src' ? fa(st.sel.size) + ' مورد انتخاب شده' : '');
    paintCount();
    const actions = [];
    if (mode === 'src' && data.path) {
      actions.push(el('button', { type: 'button', class: 'btn soft', text: 'کل این پوشه (با زیرپوشه‌ها)', onclick: () => { st.sel.set(data.path, 'dir'); paintCount(); } }));
      actions.push(el('button', { type: 'button', class: 'btn soft', text: 'همهٔ فایل‌های همین‌جا', onclick: () => { entries.filter((e) => e.kind === 'file').forEach((e) => st.sel.set(e.path, 'file')); browse(mode, data.path); } }));
    }
    if (mode === 'dest') {
      actions.push(el('button', { type: 'button', class: 'btn primary', text: 'همین پوشه را انتخاب کن', disabled: data.path ? null : true, onclick: () => { st.destDir = data.path; st.dest = 'folder'; mainView(); } }));
    }
    actions.push(el('button', { type: 'button', class: 'btn', text: mode === 'src' ? 'تأیید' : 'بازگشت', onclick: mainView }));
    body.replaceChildren(el('div', { class: 'f-picker' }, el('div', { class: 'f-where' }, crumbBar(data.path, data.root, go)), list, el('div', { class: 'bt-actions' }, ...actions, count)));
  }

  // ---- main form ----
  function mainView() {
    stop();
    const items = [...st.sel.keys()];
    const chk = (label, key, extra) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = st[key];
      cb.addEventListener('change', () => { st[key] = cb.checked; extra?.(); });
      return el('label', { class: 'bt-check' }, cb, ' ' + label);
    };
    const sel = el('ul', { class: 'bt-sel', 'aria-label': 'موارد انتخاب‌شده' }, ...items.slice(0, 6).map((p) => el('li', { dir: 'ltr', title: p }, icon(st.sel.get(p) === 'dir' ? 'folder' : 'file'), ' ' + baseName(p))));
    if (items.length > 6) sel.append(el('li', { class: 'f-status', text: 'و ' + fa(items.length - 6) + ' مورد دیگر' }));
    const brandSel = el('select', { 'aria-label': 'برند', onchange: (e) => (st.brand = e.target.value) },
      el('option', { value: '', text: 'برند پیش‌فرض (یا برند خود سند)' }),
      ...brands.all().map((b) => el('option', { value: b.id, text: b.name, selected: b.id === st.brand ? true : null })));
    const destRadio = (v, label) => {
      const r = el('input', { type: 'radio', name: 'btdest' });
      r.checked = st.dest === v;
      r.addEventListener('change', () => { st.dest = v; if (v === 'folder' && !st.destDir) browse('dest'); });
      return el('label', { class: 'bt-check' }, r, ' ' + label);
    };
    const err = el('p', { class: 'form-error', role: 'alert', hidden: true });
    const start = el('button', { type: 'button', class: 'btn primary', text: 'شروع تبدیل', onclick: () => run(err) });
    body.replaceChildren(
      el('p', { class: 'modal-note', text: 'فایل‌ها یا پوشه‌ها را انتخاب کنید؛ هر کدام با Chrome سرور رندر می‌شود (برند، واترمارک، QR و پاورقی مثل خروجی عادی).' }),
      el('section', { class: 'srv-sec' }, el('h3', { text: 'منبع' }), items.length ? sel : el('p', { class: 'modal-note', text: 'چیزی انتخاب نشده است.' }),
        el('button', { type: 'button', class: 'btn soft', text: items.length ? 'ویرایش انتخاب…' : 'انتخاب فایل یا پوشه…', onclick: () => browse('src', '') })),
      el('section', { class: 'srv-sec' }, el('h3', { text: 'قالب خروجی' }),
        el('div', { class: 'bt-checks' }, chk('PDF', 'pdf'), chk('HTML', 'html'), chk('شمارهٔ صفحه در PDF', 'pageNumbers'), chk('پاک‌سازی خروجی هوش مصنوعی', 'cleanup'))),
      el('section', { class: 'srv-sec' }, el('h3', { text: 'برند' }), brandSel),
      el('section', { class: 'srv-sec' }, el('h3', { text: 'محل ذخیره' }),
        el('div', { class: 'bt-checks' }, destRadio('beside', 'کنار هر فایل'), destRadio('folder', 'در یک پوشه'),
          st.dest === 'folder' && st.destDir ? el('button', { type: 'button', class: 'btn soft', title: st.destDir, onclick: () => browse('dest', st.destDir) }, icon('folder'), ' ' + baseName(st.destDir)) : null)),
      err, el('div', { class: 'bt-actions' }, start));
  }

  // ---- run ----
  async function run(err) {
    err.hidden = true;
    const fail = (t) => { err.textContent = t; err.hidden = false; };
    if (!st.sel.size) return fail('ابتدا فایل یا پوشه‌ای انتخاب کنید.');
    if (!st.pdf && !st.html) return fail('دست‌کم یکی از قالب‌های PDF یا HTML را انتخاب کنید.');
    if (st.dest === 'folder' && !st.destDir) return fail('پوشهٔ مقصد را انتخاب کنید.');
    try {
      const job = await bapi('POST', '/api/batch', {
        paths: [...st.sel.keys()], formats: [st.pdf && 'pdf', st.html && 'html'].filter(Boolean), brand: st.brand || undefined, cleanup: st.cleanup, pageNumbers: st.pageNumbers,
        dest: st.dest === 'folder' ? { mode: 'folder', dir: st.destDir } : { mode: 'beside' },
      });
      jobId = job.id;
      progressView(job);
    } catch (e) {
      fail(e.message === 'chrome-unavailable' ? 'Chrome روی سرور پیدا نشد؛ تبدیل گروهی ممکن نیست.' : e.message === 'no-files' ? 'فایل قابل‌تبدیلی در انتخاب شما نبود.' : e.message === 'brand-not-found' ? 'برند روی سرور پیدا نشد؛ یک بار همگام‌سازی کنید.' : errorText(e));
    }
  }

  function progressView(job) {
    const fill = el('i');
    const bar = el('div', { class: 'bt-bar', dir: 'ltr', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(job.total) }, fill);
    const label = el('p', { class: 'bt-label' });
    const cur = el('p', { class: 'modal-note', dir: 'auto' });
    const cancel = el('button', { type: 'button', class: 'btn', text: 'لغو', onclick: async () => { cancel.disabled = true; await bapi('DELETE', '/api/batch/' + jobId).catch(() => {}); } });
    body.replaceChildren(el('h3', { text: 'در حال تبدیل…' }), bar, label, cur, el('div', { class: 'bt-actions' }, cancel));
    const paint = (j) => {
      fill.style.width = (j.total ? (j.done / j.total) * 100 : 0) + '%';
      bar.setAttribute('aria-valuenow', String(j.done));
      label.textContent = `${fa(j.done)} از ${fa(j.total)} · موفق ${fa(j.ok)} · ناموفق ${fa(j.failed)}`;
      cur.textContent = j.current ? baseName(j.current) : '';
    };
    paint(job);
    const tick = async () => {
      try {
        const j = await bapi('GET', '/api/batch/' + jobId);
        paint(j);
        if (j.status === 'running') poll = setTimeout(tick, 600);
        else reportView(j);
      } catch {
        body.replaceChildren(el('p', { class: 'form-error', text: 'ارتباط با سرور قطع شد؛ کار روی سرور ادامه دارد.' }));
      }
    };
    poll = setTimeout(tick, 400);
  }

  function reportView(j) {
    const title = j.status === 'cancelled' ? 'تبدیل لغو شد' : j.failed ? 'تبدیل با خطای جزئی تمام شد' : 'تبدیل تمام شد';
    body.replaceChildren(
      el('h3', { text: title }),
      el('div', { class: 'bt-bar', dir: 'ltr', role: 'progressbar', 'aria-valuenow': String(j.done), 'aria-valuemax': String(j.total) }, el('i', { style: `width:${j.total ? (j.done / j.total) * 100 : 0}%` })),
      el('p', { class: 'bt-label', text: `موفق ${fa(j.ok)} · ناموفق ${fa(j.failed)} · از ${fa(j.total)} فایل` }),
      el('ul', { class: 'srv-list bt-report' }, ...j.results.map((r) => el('li', { class: r.ok ? 'ok' : 'bad' },
        el('span', {}, el('b', { dir: 'ltr', text: baseName(r.path) }), el('small', { dir: 'auto', text: r.ok ? r.outputs.map(baseName).join('، ') : reason(r.error) })),
        el('span', { class: 'bt-mark', 'aria-label': r.ok ? 'موفق' : 'ناموفق', text: r.ok ? '✓' : '✗' })))),
      el('div', { class: 'bt-actions' }, el('button', { type: 'button', class: 'btn primary', text: 'تبدیل تازه', onclick: mainView }), el('button', { type: 'button', class: 'btn', text: 'بستن', onclick: () => modal.close() })),
    );
  }

  mainView();
}

export function initBatchUI() {
  palette.register({ id: 'batch-convert', title: 'تبدیل گروهی پوشه یا فایل‌ها به PDF / HTML', group: 'سرور', keywords: 'batch convert folder pdf html bulk تبدیل گروهی پوشه', run: openBatch });
}
