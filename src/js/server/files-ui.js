// "فایل‌ها" drawer: root tabs, folder tree + breadcrumb, quick Persian-aware search, type filter, recent and pinned.
import { store } from '../core/store.js';
import { $, el, icon, debounce } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { toFaDigits as fa } from '../content/persian.js';
import { fmtDate } from '../library/format.js';
import { fapi, errorText } from './files-api.js';
import { crumbBar } from './files-picker.js';
import { openFile } from './linked.js';
import { syncActive } from './sync.js';

const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),[href]';
const TYPES = [['', 'همه'], ['md', 'Markdown'], ['txt', 'متن'], ['html', 'HTML']];
const EXT_TYPE = { '.md': 'md', '.markdown': 'md', '.txt': 'txt', '.html': 'html', '.htm': 'html' };
const st = { tab: 'recent', dir: '', type: '', query: '', roots: [], meta: { recent: [], pinned: [] }, listing: null, results: null, seq: 0 };
let ui = null;
let opener = null;

const fmtSize = (n) => (n > 1048576 ? fa((n / 1048576).toFixed(1)) + ' مگابایت' : fa(Math.max(1, Math.round(n / 1024))) + ' کیلوبایت');
const pinned = (p) => st.meta.pinned.some((x) => x.path === p);
const typeOk = (e) => !st.type || EXT_TYPE[e.ext || ''] === st.type;

function fileRow(f, { showDir = false } = {}) {
  const open = el('button', { type: 'button', class: 'f-open', title: f.path },
    icon('file'),
    el('span', { class: 'f-text' },
      el('span', { class: 'f-name', text: f.name }),
      el('span', { class: 'f-meta' }, showDir && f.dir ? el('bdi', { class: 'f-dir', dir: 'ltr', text: (f.rootName ? f.rootName + '/' : '') + f.dir }) : null, f.mtime ? fmtDate(f.mtime) : '', f.size != null ? ' · ' + fmtSize(f.size) : '')));
  open.addEventListener('click', async () => {
    if (await openFile(f.path)) closeFiles();
  });
  const pin = el('button', { type: 'button', class: 'lib-icon' + (pinned(f.path) ? ' on' : ''), 'aria-label': pinned(f.path) ? 'برداشتن سنجاق' : 'سنجاق کردن', title: pinned(f.path) ? 'برداشتن سنجاق' : 'سنجاق کردن', 'aria-pressed': String(pinned(f.path)) }, icon('pin'));
  pin.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      st.meta = await fapi.pin(f.path, !pinned(f.path));
      render();
    } catch (err) {
      notify(errorText(err));
    }
  });
  const cur = store.get('link')?.path === f.path;
  return el('li', { class: 'lib-item f-item' + (cur ? ' current' : '') }, open, el('div', { class: 'f-acts' }, pin));
}

function dirRow(d) {
  const b = el('button', { type: 'button', class: 'f-open', onclick: () => go(d.path) }, icon('folder'), el('span', { class: 'f-text' }, el('span', { class: 'f-name', text: d.name })));
  return el('li', { class: 'lib-item f-item f-dir-row' }, b);
}

function setList(rows, emptyText) {
  ui.list.replaceChildren(...rows);
  ui.empty.hidden = rows.length > 0;
  ui.empty.textContent = emptyText;
}

function render() {
  if (!ui) return;
  ui.tabs.replaceChildren(
    ...[['recent', 'اخیر'], ['pinned', 'سنجاق‌شده'], ...st.roots.map((r) => [r.path, r.name])].map(([id, label]) =>
      el('button', { type: 'button', class: 'f-tab' + (!st.query && st.tab === id ? ' on' : ''), 'aria-pressed': String(!st.query && st.tab === id), text: label, title: id.startsWith('/') ? id : '', onclick: () => selectTab(id) })),
  );
  ui.filters.replaceChildren(...TYPES.map(([v, l]) => el('button', { type: 'button', class: 'tag' + (st.type === v ? ' on' : ''), 'aria-pressed': String(st.type === v), text: l, onclick: () => setType(v) })));
  ui.crumbs.replaceChildren();
  ui.crumbs.hidden = true;

  if (st.query.trim()) {
    const r = st.results;
    ui.status.textContent = r ? `${fa(r.total)} نتیجه از ${fa(r.indexed)} فایل ایندکس‌شده` : 'در حال جست‌وجو…';
    return setList((r?.results || []).map((f) => fileRow(f, { showDir: true })), r ? 'فایلی با این نام پیدا نشد.' : '');
  }
  if (st.tab === 'recent' || st.tab === 'pinned') {
    const items = (st.tab === 'recent' ? st.meta.recent : st.meta.pinned).filter(typeOk);
    ui.status.textContent = `${fa(items.length)} فایل`;
    return setList(items.map((f) => fileRow({ ...f, dir: '' })), st.tab === 'recent' ? 'هنوز فایلی باز نکرده‌اید. از ریشه‌ها یکی را باز کنید یا بالا جست‌وجو کنید.' : 'فایلی سنجاق نشده است. روی سنجاق کنار هر فایل بزنید.');
  }
  const l = st.listing;
  if (!l) return setList([], 'در حال خواندن پوشه…');
  ui.crumbs.hidden = false;
  ui.crumbs.append(crumbBar(l.path, l.root, go));
  const dirs = l.entries.filter((e) => e.kind === 'dir');
  const files = l.entries.filter((e) => e.kind === 'file' && typeOk(e));
  const rows = [];
  if (l.parent && l.path !== l.root) rows.push(el('li', { class: 'lib-item f-item f-dir-row' }, el('button', { type: 'button', class: 'f-open', onclick: () => go(l.parent) }, icon('folder'), el('span', { class: 'f-text' }, el('span', { class: 'f-name', text: 'پوشهٔ بالاتر' })))));
  rows.push(...dirs.map(dirRow), ...files.map((f) => fileRow(f)));
  ui.status.textContent = `${fa(dirs.length)} پوشه · ${fa(files.length)} فایل`;
  setList(rows, 'این پوشه فایل قابل‌باز ندارد (MD، TXT، HTML).');
}

async function go(path) {
  st.tab = path ? st.roots.find((r) => path === r.path || path.startsWith(r.path + '/'))?.path || st.tab : st.tab;
  st.dir = path;
  st.listing = null;
  render();
  try {
    st.listing = await fapi.list(path);
  } catch (e) {
    notify(errorText(e));
    st.listing = { path, root: path, parent: null, entries: [] };
  }
  render();
}

function selectTab(id) {
  st.query = '';
  ui.search.value = '';
  st.tab = id;
  if (id.startsWith('/')) go(id);
  else {
    refreshMeta();
    render();
  }
}

function setType(v) {
  st.type = v;
  if (st.query.trim()) runSearch();
  else render();
}

const runSearch = debounce(async () => {
  const q = st.query.trim();
  if (!q) return render();
  const seq = ++st.seq;
  st.results = null;
  render();
  try {
    const r = await fapi.search(q, st.type);
    if (seq === st.seq) {
      st.results = r;
      st.resultsFor = q;
      render();
      if (st.openFirst) ui.list.querySelector('.f-open')?.click();
      st.openFirst = false;
    }
  } catch (e) {
    if (seq === st.seq) {
      st.results = { results: [], total: 0, indexed: 0 };
      notify(errorText(e));
      render();
    }
  }
}, 140);

async function refreshMeta() {
  try {
    st.meta = await fapi.meta();
    render();
  } catch {
    /* keep the old lists */
  }
}

function build() {
  const search = el('input', { type: 'search', class: 'lib-search', placeholder: 'جست‌وجوی نام فایل در همهٔ پوشه‌ها…', 'aria-label': 'جست‌وجوی نام فایل', autocomplete: 'off', dir: 'auto' });
  search.addEventListener('input', () => {
    st.query = search.value;
    runSearch();
    if (!st.query.trim()) render();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (st.results && st.resultsFor === st.query.trim()) ui.list.querySelector('.f-open')?.click();
      else st.openFirst = true; // opens the first hit as soon as the search answers
    }
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      ui.list.querySelector('.f-open')?.focus();
    }
  });
  const closeBtn = el('button', { type: 'button', class: 'btn ghost icon', 'aria-label': 'بستن' }, icon('x'));
  closeBtn.addEventListener('click', closeFiles);
  const tabs = el('div', { class: 'f-tabs', role: 'group', 'aria-label': 'ریشه‌ها' });
  const filters = el('div', { class: 'lib-tagbar', role: 'group', 'aria-label': 'فیلتر نوع فایل' });
  const crumbs = el('div', { class: 'f-where', hidden: true });
  const list = el('ul', { class: 'lib-list f-list' });
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...list.querySelectorAll('.f-open')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && i === 0) search.focus();
    else items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
  });
  const empty = el('p', { class: 'lib-empty' });
  const status = el('span', { class: 'f-status', role: 'status' });
  const panel = el('aside', { class: 'lib-drawer files-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'فایل‌های سرور', tabindex: '-1' },
    el('div', { class: 'lib-head' }, el('h2', { text: 'فایل‌ها' }), el('span', { class: 'grow' }), closeBtn),
    el('div', { class: 'lib-tools' }, search),
    tabs, filters, crumbs, list, empty,
    el('div', { class: 'lib-foot f-foot' }, status));
  const back = el('div', { class: 'lib-back', id: 'filesBack' }, panel);
  back.addEventListener('mousedown', (e) => {
    if (e.target === back) closeFiles();
  });
  document.body.append(back);
  ui = { back, panel, search, tabs, filters, crumbs, list, empty, status };
}

function onKey(e) {
  if (!ui) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeFiles();
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

export async function openFiles() {
  if (!syncActive()) return void notify('سرور DocLoom در دسترس نیست؛ برنامه را از نشانی http://localhost:7123 باز کنید.');
  if (ui?.back.classList.contains('show')) return ui.search.focus();
  if (!ui) build();
  opener = document.activeElement;
  ui.back.classList.add('show');
  document.addEventListener('keydown', onKey, true);
  $('#filesBtn')?.setAttribute('aria-expanded', 'true');
  ui.search.focus();
  try {
    st.roots = (await fapi.roots()).roots;
  } catch (e) {
    notify(errorText(e));
  }
  await refreshMeta();
  if (st.tab === 'recent' && !st.meta.recent.length && !st.meta.pinned.length && st.roots[0]) st.tab = st.roots[0].path;
  if (st.tab.startsWith('/')) await go(st.dir || st.tab);
  else render();
}

export function closeFiles() {
  if (!ui) return;
  ui.back.classList.remove('show');
  document.removeEventListener('keydown', onKey, true);
  $('#filesBtn')?.setAttribute('aria-expanded', 'false');
  opener?.focus?.();
}

export function initFilesUI() {
  const btn = $('#filesBtn');
  btn?.addEventListener('click', () => (ui?.back.classList.contains('show') ? closeFiles() : openFiles()));
  const show = () => btn && (btn.hidden = !syncActive());
  store.on('sync:active', show);
  show();
  // keep the lists fresh when the drawer is open and a file gets saved
  store.on('link', () => ui?.back.classList.contains('show') && refreshMeta());
}
