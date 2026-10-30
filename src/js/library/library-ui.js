// Library drawer: search, tag filter, sort, pin, tags, duplicate, delete (with undo), versions, backup.
import { store } from '../core/store.js';
import { $, el, icon, debounce } from '../core/dom.js';
import { toFaDigits } from '../content/persian.js';
import { promptDialog } from '../ui/modal.js';
import { library } from './library.js';
import { queryDocs, allTags, SORTS } from './query.js';
import { displayTitle, normalizeTags } from './doc-model.js';
import { fmtDate, snippet } from './format.js';
import { openVersions } from './versions-ui.js';
import { exportBackup, importBackup } from './backup-ui.js';

const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),[href]';
let ui = null;
const filters = { query: '', tag: '', sort: 'recent' };
let docs = [];

function iconBtn(name, label, onClick, extra = '') {
  const b = el('button', { type: 'button', class: 'lib-icon ' + extra, 'aria-label': label, title: label });
  b.append(icon(name));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

async function editTags(doc) {
  const v = await promptDialog({
    title: 'برچسب‌های سند',
    message: 'برچسب‌ها را با ویرگول از هم جدا کنید.',
    fields: [{ name: 'tags', label: 'برچسب‌ها', value: (doc.tags || []).join('، '), placeholder: 'مثلاً: گزارش، نامه' }],
    submitLabel: 'ذخیره',
  });
  if (v) await library.setTags(doc.id, normalizeTags(v.tags));
}

function renderRow(doc) {
  const current = doc.id === library.currentId();
  const open = el('button', { type: 'button', class: 'lib-open', 'aria-current': current ? 'true' : null },
    el('span', { class: 'lib-title' }, doc.pinned ? icon('pin', 'ic sm pinned') : null, displayTitle(doc)),
    el('span', { class: 'lib-meta', text: fmtDate(doc.updatedAt) + (current ? ' · در حال ویرایش' : '') }),
    snippet(doc) ? el('span', { class: 'lib-snip', text: snippet(doc) }) : null);
  open.addEventListener('click', async () => {
    if (await library.open(doc.id)) closeLibrary();
  });
  const tags = (doc.tags || []).length
    ? el('div', { class: 'lib-tags' }, ...doc.tags.map((t) => el('button', { type: 'button', class: 'tag', text: t, onclick: () => setTag(t) })))
    : null;
  return el('li', { class: 'lib-item' + (current ? ' current' : '') + (doc.pinned ? ' pinned' : '') },
    open,
    el('div', { class: 'lib-acts' },
      iconBtn('pin', doc.pinned ? 'برداشتن سنجاق' : 'سنجاق کردن', () => library.togglePin(doc.id), doc.pinned ? 'on' : ''),
      iconBtn('tag', 'ویرایش برچسب‌ها', () => editTags(doc)),
      iconBtn('copy', 'تکثیر سند', () => library.duplicate(doc.id)),
      iconBtn('trash', 'حذف سند', () => library.remove(doc.id), 'danger')),
    tags);
}

function render() {
  if (!ui) return;
  const rows = queryDocs(docs, filters);
  const tags = allTags(docs);
  if (filters.tag && !tags.includes(filters.tag)) filters.tag = '';
  ui.count.textContent = `${toFaDigits(docs.length)} سند`;
  ui.tags.replaceChildren(...tags.map((t) => el('button', { type: 'button', class: 'tag' + (t === filters.tag ? ' on' : ''), 'aria-pressed': String(t === filters.tag), text: t, onclick: () => setTag(t === filters.tag ? '' : t) })));
  ui.tags.hidden = !tags.length;
  ui.list.replaceChildren(...rows.map(renderRow));
  ui.empty.hidden = rows.length > 0;
  ui.empty.textContent = docs.length ? 'سندی با این جست‌وجو پیدا نشد.' : 'کتابخانه خالی است. هر چه بنویسید به‌صورت خودکار همین‌جا ذخیره می‌شود.';
}

function setTag(t) {
  filters.tag = t;
  render();
}

async function refresh() {
  docs = await library.list();
  render();
}

function build() {
  const search = el('input', { type: 'search', class: 'lib-search', placeholder: 'جست‌وجو در عنوان و متن…', 'aria-label': 'جست‌وجو در کتابخانه', autocomplete: 'off', dir: 'auto' });
  search.addEventListener('input', debounce(() => {
    filters.query = search.value;
    render();
  }, 120));
  const sort = el('select', { class: 'lib-sort', 'aria-label': 'مرتب‌سازی' }, ...Object.entries(SORTS).map(([v, l]) => el('option', { value: v, text: l })));
  sort.addEventListener('change', () => {
    filters.sort = sort.value;
    render();
  });
  const closeBtn = el('button', { type: 'button', class: 'btn ghost icon', 'aria-label': 'بستن کتابخانه' });
  closeBtn.append(icon('x'));
  closeBtn.addEventListener('click', closeLibrary);
  const count = el('span', { class: 'lib-count' });
  const notice = el('p', { class: 'lib-notice', role: 'status', hidden: true, text: 'ذخیرهٔ دائمی در این مرورگر در دسترس نیست؛ سندها فقط تا بستن صفحه می‌مانند. از پشتیبان کامل استفاده کنید.' });
  const tags = el('div', { class: 'lib-tagbar', role: 'group', 'aria-label': 'فیلتر برچسب' });
  const list = el('ul', { class: 'lib-list' });
  const empty = el('p', { class: 'lib-empty' });
  const foot = el('div', { class: 'lib-foot' },
    el('button', { type: 'button', class: 'btn', onclick: openVersions }, icon('history'), 'نسخه‌های سند'),
    el('button', { type: 'button', class: 'btn', onclick: exportBackup }, icon('download'), 'پشتیبان'),
    el('button', { type: 'button', class: 'btn', onclick: importBackup }, icon('upload'), 'بازیابی'));
  const panel = el('aside', { class: 'lib-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'کتابخانه', tabindex: '-1' },
    el('div', { class: 'lib-head' }, el('h2', { text: 'کتابخانه' }), count, el('span', { class: 'grow' }), closeBtn),
    el('div', { class: 'lib-tools' }, search, sort),
    notice, tags, list, empty, foot);
  const back = el('div', { class: 'lib-back' }, panel);
  back.addEventListener('mousedown', (e) => {
    if (e.target === back) closeLibrary();
  });
  document.body.append(back);
  ui = { back, panel, search, sort, count, tags, list, empty, notice };
}

function onKey(e) {
  if (!ui) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeLibrary();
  } else if (e.key === 'Tab') {
    const items = [...ui.panel.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ui.panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

let opener = null;
export async function openLibrary() {
  if (ui?.back.classList.contains('show')) return;
  if (!ui) build();
  opener = document.activeElement;
  ui.notice.hidden = library.persistent;
  await library.flush();
  await refresh();
  ui.back.classList.add('show');
  document.addEventListener('keydown', onKey);
  $('#libraryBtn')?.setAttribute('aria-expanded', 'true');
  ui.search.focus();
}

export function closeLibrary() {
  if (!ui) return;
  ui.back.classList.remove('show');
  document.removeEventListener('keydown', onKey);
  $('#libraryBtn')?.setAttribute('aria-expanded', 'false');
  opener?.focus?.();
}

export function initLibraryUI() {
  $('#libraryBtn').addEventListener('click', () => (ui?.back.classList.contains('show') ? closeLibrary() : openLibrary()));
  store.on('library:changed', () => ui?.back.classList.contains('show') && refresh());
}
