// Library drawer: search, tag filter, sort, pin, tags, duplicate, archive (with undo), the archive view, versions, backup.
import { store } from '../core/store.js';
import { notify } from '../core/notify.js';
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
const filters = { query: '', tag: '', sort: 'recent', archive: false };
let docs = [];
let archived = [];

const SORTS_EN = { recent: 'Most recent', title: 'Title', created: 'Created date' };
const isEn = () => store.get('lang') !== 'fa';
const docName = (doc) => (doc.title?.trim() ? displayTitle(doc) : isEn() ? 'Untitled Document' : 'بدون عنوان');
const docDate = (ts) => {
  if (!isEn()) return fmtDate(ts);
  try {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
};

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
  const en = isEn();
  const v = await promptDialog({
    title: en ? 'Document Tags' : 'برچسب‌های سند',
    message: en ? 'Separate tags with commas.' : 'برچسب‌ها را با ویرگول از هم جدا کنید.',
    fields: [{ name: 'tags', label: en ? 'Tags' : 'برچسب‌ها', value: (doc.tags || []).join(en ? ', ' : '، '), placeholder: en ? 'e.g. report, invoice' : 'مثلاً: گزارش، نامه' }],
    submitLabel: en ? 'Save' : 'ذخیره',
  });
  if (v) await library.setTags(doc.id, normalizeTags(v.tags));
}

function renderRow(doc) {
  const en = isEn();
  const current = doc.id === library.currentId();
  const open = el('button', { type: 'button', class: 'lib-open', 'aria-current': current ? 'true' : null },
    el('span', { class: 'lib-title' }, doc.pinned ? icon('pin', 'ic sm pinned') : null, docName(doc)),
    el('span', { class: 'lib-meta', text: docDate(doc.updatedAt) + (current ? (en ? ' · Editing' : ' · در حال ویرایش') : '') }),
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
      iconBtn('pin', doc.pinned ? (en ? 'Unpin' : 'برداشتن سنجاق') : (en ? 'Pin' : 'سنجاق کردن'), () => library.togglePin(doc.id), doc.pinned ? 'on' : ''),
      iconBtn('tag', en ? 'Edit tags' : 'ویرایش برچسب‌ها', () => editTags(doc)),
      iconBtn('copy', en ? 'Duplicate document' : 'تکثیر سند', () => library.duplicate(doc.id)),
      iconBtn('archive', en ? 'Archive document' : 'بایگانی سند', () => library.remove(doc.id))),
    tags);
}

/** A row of the archive view: read-only, with one way out — restore. */
function renderArchivedRow(doc) {
  const en = isEn();
  const restore = el('button', { type: 'button', class: 'btn lib-restore', text: en ? 'Restore' : 'بازگردانی' });
  restore.addEventListener('click', async () => {
    await library.restore(doc.id);
    notify('سند به کتابخانه برگشت.', { action: { label: 'باز کردن', run: async () => (await library.open(doc.id)) && closeLibrary() } });
  });
  return el('li', { class: 'lib-item archived' },
    el('div', { class: 'lib-open' },
      el('span', { class: 'lib-title' }, docName(doc)),
      el('span', { class: 'lib-meta', text: (en ? 'Archived on ' : 'بایگانی‌شده در ') + docDate(doc.archivedAt) }),
      snippet(doc) ? el('span', { class: 'lib-snip', text: snippet(doc) }) : null),
    el('div', { class: 'lib-acts solid' }, restore));
}

function setArchive(on) {
  filters.archive = on;
  render();
}

function syncChrome() {
  if (!ui) return;
  const en = isEn();
  ui.panel.setAttribute('aria-label', en ? 'Library' : 'کتابخانه');
  ui.heading.textContent = en ? 'Library' : 'کتابخانه';
  ui.closeBtn.setAttribute('aria-label', en ? 'Close library' : 'بستن کتابخانه');
  ui.search.placeholder = en ? 'Search title and content...' : 'جست‌وجو در عنوان و متن…';
  ui.search.setAttribute('aria-label', en ? 'Search library' : 'جست‌وجو در کتابخانه');
  ui.sort.setAttribute('aria-label', en ? 'Sort order' : 'مرتب‌سازی');
  for (const opt of ui.sort.options) opt.textContent = (en ? SORTS_EN : SORTS)[opt.value] || opt.textContent;
  ui.notice.textContent = en
    ? 'Persistent storage unavailable in this browser; documents remain only for this tab session. Export a backup to keep copies.'
    : 'ذخیرهٔ دائمی در این مرورگر در دسترس نیست؛ سندها فقط تا بستن صفحه می‌مانند. از پشتیبان کامل استفاده کنید.';
  ui.tags.setAttribute('aria-label', en ? 'Tag filter' : 'فیلتر برچسب');
  ui.verLbl.nodeValue = en ? ' Versions' : ' نسخه‌های سند';
  ui.bkpLbl.nodeValue = en ? ' Backup' : ' پشتیبان';
  ui.restLbl.nodeValue = en ? ' Restore' : ' بازیابی';
}

function render() {
  if (!ui) return;
  const en = isEn();
  if (!archived.length) filters.archive = false;
  const pool = filters.archive ? archived : docs;
  const rows = queryDocs(pool, filters);
  const tags = allTags(pool);
  if (filters.tag && !tags.includes(filters.tag)) filters.tag = '';
  ui.count.textContent = en ? `${docs.length} docs` : `${toFaDigits(docs.length)} سند`;
  ui.tags.replaceChildren(...tags.map((t) => el('button', { type: 'button', class: 'tag' + (t === filters.tag ? ' on' : ''), 'aria-pressed': String(t === filters.tag), text: t, onclick: () => setTag(t === filters.tag ? '' : t) })));
  ui.tags.hidden = !tags.length;
  ui.archive.hidden = !archived.length;
  ui.archive.textContent = en ? `Archive (${archived.length})` : `بایگانی (${toFaDigits(archived.length)})`;
  ui.archive.classList.toggle('on', filters.archive);
  ui.archive.setAttribute('aria-pressed', String(filters.archive));
  // A search that misses in the library may still hit in the archive: say so instead of "nothing found".
  const hits = !filters.archive && filters.query.trim() ? queryDocs(archived, { query: filters.query }).length : 0;
  ui.hint.hidden = !hits;
  ui.hint.textContent = en ? `${hits} matches in archive` : `${toFaDigits(hits)} نتیجه در بایگانی`;
  ui.list.replaceChildren(...rows.map(filters.archive ? renderArchivedRow : renderRow));
  ui.empty.hidden = rows.length > 0;
  ui.empty.textContent = pool.length
    ? en ? 'No matching documents found.' : 'سندی با این جست‌وجو پیدا نشد.'
    : en ? 'Library is empty. Any document you write is saved here automatically.' : 'کتابخانه خالی است. هر چه بنویسید به‌صورت خودکار همین‌جا ذخیره می‌شود.';
}

function setTag(t) {
  filters.tag = t;
  render();
}

async function refresh() {
  [docs, archived] = await Promise.all([library.list(), library.archived()]);
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
  const archive = el('button', { type: 'button', class: 'tag lib-archive', 'aria-pressed': 'false', hidden: true, onclick: () => setArchive(!filters.archive) });
  const hint = el('button', { type: 'button', class: 'lib-hint', hidden: true, onclick: () => setArchive(true) });
  const list = el('ul', { class: 'lib-list' });
  const empty = el('p', { class: 'lib-empty' });
  const verLbl = document.createTextNode(' نسخه‌های سند');
  const bkpLbl = document.createTextNode(' پشتیبان');
  const restLbl = document.createTextNode(' بازیابی');
  const heading = el('h2', { text: 'کتابخانه' });
  const foot = el('div', { class: 'lib-foot' },
    el('button', { type: 'button', class: 'btn', onclick: openVersions }, icon('history'), verLbl),
    el('button', { type: 'button', class: 'btn', onclick: exportBackup }, icon('download'), bkpLbl),
    el('button', { type: 'button', class: 'btn', onclick: importBackup }, icon('upload'), restLbl));
  const panel = el('aside', { class: 'lib-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'کتابخانه', tabindex: '-1' },
    el('div', { class: 'lib-head' }, heading, count, el('span', { class: 'grow' }), closeBtn),
    el('div', { class: 'lib-tools' }, search, sort),
    notice, el('div', { class: 'lib-archbar' }, archive), tags, hint, list, empty, foot);
  const back = el('div', { class: 'lib-back' }, panel);
  back.addEventListener('mousedown', (e) => {
    if (e.target === back) closeLibrary();
  });
  document.body.append(back);
  ui = { back, panel, heading, closeBtn, verLbl, bkpLbl, restLbl, search, sort, count, tags, list, empty, notice, archive, hint };
  syncChrome();
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
  store.on('lang', () => {
    if (!ui) return;
    syncChrome();
    render();
  });
}
