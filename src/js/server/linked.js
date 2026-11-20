// Documents linked to a file on the server: open, live reload (SSE), conflict bar, save to the original, save-as.
import { store } from '../core/store.js';
import { $ } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { readStored, writeStored } from '../core/naming.js';
import { db } from '../library/db.js';
import { library } from '../library/library.js';
import { preview, previewInSync, renderFromSource } from '../editor/preview.js';
import { loadHTMLContent } from '../editor/files.js';
import { refreshSource } from '../editor/source.js';
import { startBlankDocument } from '../editor/document.js';
import { buildExportHTML } from '../export/html.js';
import { htmlToMarkdown } from '../export/markdown.js';
import { safeFilename } from '../export/files.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { palette } from '../ui/palette.js';
import { defineShortcut } from '../ui/shortcuts.js';
import { fapi, errorText } from './files-api.js';
import { kindOfPath, stemOf, baseName, dirName, joinPath, diskAction } from './files-core.js';
import { pickLocation } from './files-picker.js';
import { serverReady, syncActive } from './sync.js';

let base = null; // Markdown source as of the last load / save (to tell whether the document was edited)
let suppress = 0; // >0 while we (or the library) are loading content: those 'content' events are not user edits
let loadingDoc = false;
let saving = false;
let es = null;
let watchPath = null;
let reloading = null;
let alertMode = null; // null | 'conflict' | 'missing'
let pendingEvent = null;
let lastDir = '';
const warnedHtml = new Set();
let flashTimer = 0;

const FOLLOW_KEY = 'datasave.followEnd';
const getFollow = () => readStored(FOLLOW_KEY) === '1';

export const getLink = () => store.get('link');
const setLink = (patch) => store.set('link', patch && { ...store.get('link'), ...patch });
const fileInfo = (f) => ({ path: f.path, mtime: f.mtime, etag: f.etag, size: f.size, dirty: false });

// ---- bar ----
function updateBar() {
  const bar = $('#linkBar');
  if (!bar) return;
  const link = getLink();
  const on = !!link && syncActive();
  bar.hidden = !on;
  document.body.classList.toggle('has-link', on);
  if (!on) {
    alertMode = null;
    const box = $('#linkAlert');
    if (box) box.hidden = true;
    return;
  }
  $('#lbPath').textContent = link.path;
  $('#lbPath').title = link.path;
  const st = $('#lbState');
  const state = alertMode === 'missing' ? 'missing' : link.dirty ? 'dirty' : 'clean';
  st.dataset.state = state;
  st.textContent = { missing: 'فایل روی دیسک نیست', dirty: 'ذخیره‌نشده روی فایل', clean: 'همگام با فایل' }[state];
}

function flash(text) {
  const st = $('#lbState');
  if (!st) return;
  st.textContent = text;
  st.dataset.state = 'flash';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(updateBar, 2200);
}

function showAlert(mode, ev = null) {
  alertMode = mode;
  pendingEvent = ev;
  const box = $('#linkAlert');
  if (!box) return;
  box.hidden = !mode;
  box.dataset.mode = mode || '';
  if (mode === 'conflict') {
    $('#laText').textContent = 'فایل روی دیسک تغییر کرد — بارگذاری دوباره / نگه داشتن نسخهٔ من';
    $('#laA').textContent = 'بارگذاری دوباره';
    $('#laB').textContent = 'نگه داشتن نسخهٔ من';
  } else if (mode === 'missing') {
    $('#laText').textContent = 'فایل روی دیسک پیدا نشد (حذف یا جابه‌جا شده). نسخهٔ شما در کتابخانه می‌ماند.';
    $('#laA').textContent = 'قطع پیوند';
    $('#laB').textContent = 'نگه داشتن';
  }
  updateBar();
}

// ---- applying disk content to the editor ----
function applyDisk(f, { initial = false } = {}) {
  const stage = $('.stage');
  const keep = stage ? stage.scrollTop : 0;
  suppress++;
  try {
    if (kindOfPath(f.path) === 'html') {
      loadHTMLContent(f.content, { quiet: true });
      if (!store.get('title')) store.set('title', stemOf(f.name));
    } else {
      if (initial && !store.get('title')) store.set('title', stemOf(f.name));
      store.set('source', f.content);
      renderFromSource();
    }
    if (store.get('sourceMode')) refreshSource();
    base = store.get('source');
    store.set('link', fileInfo(f));
  } finally {
    suppress--;
  }
  if (stage) stage.scrollTop = getFollow() ? stage.scrollHeight : keep;
  showAlert(null);
}

async function reloadFromDisk({ manual = false } = {}) {
  if (reloading) return reloading;
  reloading = (async () => {
    const link = getLink();
    if (!link) return;
    try {
      applyDisk(await fapi.read(link.path));
      if (manual) notify('از روی دیسک بارگذاری شد.');
      else flash('به‌روز شد از دیسک');
    } catch (e) {
      if (e.status === 404) showAlert('missing');
      else notify(errorText(e));
    }
  })().finally(() => (reloading = null));
  return reloading;
}

function onDisk(ev) {
  const act = diskAction({ link: getLink(), event: ev, saving });
  if (act === 'reload') reloadFromDisk();
  else if (act === 'conflict') showAlert('conflict', ev);
  else if (act === 'missing') showAlert('missing');
  else if (act === 'same' && alertMode === 'conflict') showAlert(null);
}

function watchLink(link, force = false) {
  const p = link?.path || null;
  if (p === watchPath && !force) return;
  es?.close();
  es = null;
  watchPath = p;
  if (!p || !syncActive() || typeof EventSource !== 'function') return;
  es = new EventSource('/api/watch?path=' + encodeURIComponent(p));
  for (const type of ['ready', 'change', 'deleted']) {
    es.addEventListener(type, (m) => {
      try {
        onDisk(JSON.parse(m.data));
      } catch {
        /* ignore malformed event */
      }
    });
  }
}

let checkTimer = 0;
function checkDirty() {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => {
    const link = getLink();
    if (!link || link.dirty || suppress) return;
    const dirty = kindOfPath(link.path) === 'html' ? true : store.get('source') !== base || !previewInSync();
    if (dirty) setLink({ dirty: true });
  }, 350);
}

// ---- open ----
async function reconcile(f) {
  const act = diskAction({ link: getLink(), event: { exists: true, etag: f.etag } });
  if (act === 'reload') applyDisk(f);
  else if (act === 'conflict') showAlert('conflict', { exists: true, etag: f.etag });
}

/** Open a file from the server as a linked document (an existing library copy linked to the same path is reused). */
export async function openFile(path) {
  let f;
  try {
    f = await fapi.read(path);
  } catch (e) {
    notify(errorText(e));
    return false;
  }
  const existing = (await db.all('documents')).find((d) => d.link?.path === f.path);
  if (existing) {
    if (!(await library.open(existing.id))) return false;
    await reconcile(f);
  } else {
    startBlankDocument();
    applyDisk(f, { initial: true });
  }
  lastDir = dirName(f.path);
  fapi.recent(f.path).catch(() => {});
  return true;
}

export async function openFromUrl() {
  const u = new URL(location.href);
  const p = u.searchParams.get('open');
  if (!p) return;
  u.searchParams.delete('open');
  history.replaceState(null, '', u.pathname + u.search + u.hash);
  await openFile(p);
}

/** PWA launchQueue / "Open with": find the same file on the server (name + size + mtime) and open it linked; else read-only load. */
export async function openLaunchedFile(file, fallback) {
  if (await serverReady) {
    try {
      const { results } = await fapi.search(file.name, '', 50);
      const hit = results.find((r) => r.name === file.name && r.size === file.size && Math.abs(r.mtime - file.lastModified) < 2000);
      if (hit && (await openFile(hit.path))) return;
    } catch {
      /* fall through to the read-only load */
    }
  }
  return fallback(file);
}

// ---- save ----
async function composeContent(path) {
  if (kindOfPath(path) === 'html') {
    if (!warnedHtml.has(path)) {
      const ok = await confirmDialog({
        title: 'ذخیرهٔ فایل HTML',
        message: 'فایل HTML از روی پیش‌نمایشِ پاک‌سازی‌شده ذخیره می‌شود؛ اسکریپت و استایل‌های سفارشی فایل اصلی حذف می‌شوند. نسخهٔ قبلی فایل در پشتیبان‌ها (پوشهٔ داده، backups/files) می‌ماند. ادامه می‌دهید؟',
        confirmLabel: 'ذخیره',
      });
      if (!ok) return null;
      warnedHtml.add(path);
    }
    return buildExportHTML();
  }
  const src = store.get('source');
  if (!src.trim()) return htmlToMarkdown(preview);
  if (previewInSync()) return src;
  const choice = await new Promise((resolve) =>
    openModal({
      title: 'ویرایش مستقیم در پیش‌نمایش',
      body: 'پیش‌نمایش را مستقیم ویرایش کرده‌اید و دیگر با متن Markdown یکی نیست. چه چیزی روی فایل ذخیره شود؟',
      onClose: () => resolve('cancel'),
      actions: [
        { label: 'انصراف', onClick: () => resolve('cancel') },
        { label: 'تبدیل پیش‌نمایش به Markdown', onClick: () => resolve('convert') },
        { label: 'متن Markdown (ویرایش‌های پیش‌نمایش نادیده)', kind: 'primary', onClick: () => resolve('source') },
      ],
    }),
  );
  if (choice === 'source') return src;
  if (choice === 'convert') return htmlToMarkdown(preview);
  return null;
}

async function conflictChoice(gone) {
  return new Promise((resolve) =>
    openModal({
      title: gone ? 'فایل روی دیسک نیست' : 'فایل روی دیسک تغییر کرده است',
      body: gone
        ? 'فایل از زمان بازشدن حذف یا جابه‌جا شده است. می‌توانید آن را دوباره روی همین مسیر بسازید یا با نام دیگری ذخیره کنید.'
        : 'فایل از زمانی که آن را باز کردید روی دیسک عوض شده (مثلاً توسط ابزار دیگری). با بازنویسی، نسخهٔ دیسک در پشتیبان‌ها می‌ماند و قابل بازگشت است.',
      onClose: () => resolve('cancel'),
      actions: [
        { label: 'انصراف', onClick: () => resolve('cancel') },
        { label: 'ذخیره به نام…', onClick: () => resolve('saveas') },
        ...(gone ? [] : [{ label: 'بارگذاری از دیسک', onClick: () => resolve('reload') }]),
        { label: gone ? 'ساخت دوباره' : 'بازنویسی فایل', kind: 'danger', onClick: () => resolve('overwrite') },
      ],
    }),
  );
}

/** Write `text` to `path`. Handles 409 (disk changed / file exists / file gone). Returns true when saved. */
async function writeTo(path, text, opts) {
  saving = true;
  try {
    const r = await fapi.write(path, text, opts);
    setLink({ ...fileInfo(r), path: r.path });
    base = store.get('source');
    showAlert(null);
    lastDir = dirName(r.path);
    library.flush();
    notify('روی فایل ذخیره شد: ' + baseName(r.path));
    return true;
  } catch (e) {
    saving = false;
    if (e.status === 409) {
      if (e.message === 'exists') {
        if (!(await confirmDialog({ title: 'فایل از قبل هست', message: `«${baseName(path)}» از قبل وجود دارد. جایگزین شود؟ نسخهٔ قبلی در پشتیبان‌ها می‌ماند.`, confirmLabel: 'جایگزین کن', danger: true }))) return false;
        return writeTo(path, text, { overwrite: true });
      }
      const choice = await conflictChoice(e.message === 'gone');
      if (choice === 'overwrite') return writeTo(path, text, e.message === 'gone' ? { overwrite: true } : { etag: e.current?.etag });
      if (choice === 'reload') {
        await reloadFromDisk({ manual: true });
        return false;
      }
      if (choice === 'saveas') return saveAsFile();
      return false;
    }
    notify(errorText(e));
    return false;
  } finally {
    saving = false;
  }
}

export async function saveToFile() {
  const link = getLink();
  if (!link) return saveAsFile();
  const text = await composeContent(link.path);
  if (text == null) return false;
  return writeTo(link.path, text, { etag: link.etag });
}

export async function saveAsFile() {
  if (!syncActive()) return void notify('سرور DataSave در دسترس نیست.');
  const link = getLink();
  const title = store.get('title');
  const pick = await pickLocation({
    title: 'ذخیره به نام',
    startDir: link ? dirName(link.path) : lastDir,
    name: link ? baseName(link.path) : safeFilename(title || 'سند', 'md'),
    withName: true,
    submitLabel: 'ذخیره',
  });
  if (!pick) return false;
  const path = joinPath(pick.dir, pick.name);
  const text = await composeContent(path);
  if (text == null) return false;
  return writeTo(path, text, {});
}

/** ⌘S: a linked file is saved to disk; anything else keeps the library behaviour (save a version). */
export async function saveCommand() {
  if (getLink()) return saveToFile();
  return library.saveVersion();
}

export function unlink() {
  if (!getLink()) return;
  store.set('link', null);
  notify('پیوند سند با فایل برداشته شد؛ سند در کتابخانه می‌ماند.');
}

export function initLinked({ openFiles }) {
  store.on('doc:loading', () => {
    suppress++;
    loadingDoc = true;
  });
  store.on('doc:applied', () => {
    suppress = Math.max(0, suppress - 1);
    loadingDoc = false;
    const link = getLink();
    base = link && !link.dirty ? store.get('source') : null;
    showAlert(null);
    watchLink(link, true);
    updateBar();
  });
  store.on('link', (link) => {
    if (!loadingDoc) watchLink(link);
    updateBar();
  });
  store.on('content', () => {
    if (!suppress && getLink()) checkDirty();
  });

  $('#laA')?.addEventListener('click', () => {
    if (alertMode === 'conflict') reloadFromDisk({ manual: true });
    else if (alertMode === 'missing') unlink();
  });
  $('#laB')?.addEventListener('click', () => {
    if (alertMode === 'conflict' && pendingEvent?.etag) setLink({ etag: pendingEvent.etag }); // adopt the disk version as the base: saving now overwrites it on purpose
    showAlert(null);
  });
  $('#lbSave')?.addEventListener('click', saveToFile);
  $('#lbUnlink')?.addEventListener('click', unlink);
  const follow = $('#lbFollow');
  if (follow) {
    follow.checked = getFollow();
    follow.addEventListener('change', () => {
      writeStored(FOLLOW_KEY, follow.checked ? '1' : '0');
      if (follow.checked) $('.stage').scrollTop = $('.stage').scrollHeight;
    });
  }

  const need = (fn) => () => (syncActive() ? fn() : notify('سرور DataSave در دسترس نیست؛ برنامه را از نشانی http://localhost:7123 باز کنید.'));
  palette.register({ id: 'file-save', title: 'ذخیره روی فایل (فایل متصل)', group: 'فایل', keywords: 'save file disk write ذخیره فایل دیسک', run: need(saveToFile) });
  palette.register({ id: 'file-save-as', title: 'ذخیره به نام در سرور…', group: 'فایل', keywords: 'save as file folder ذخیره به نام پوشه', run: need(saveAsFile) });
  palette.register({ id: 'file-unlink', title: 'قطع پیوند سند با فایل', group: 'فایل', keywords: 'unlink detach file', run: unlink });
  palette.register({
    id: 'file-follow',
    title: 'دنبال کردن انتهای فایل: روشن/خاموش',
    group: 'فایل',
    keywords: 'follow tail end live scroll دنبال انتها',
    run: () => {
      const f = $('#lbFollow');
      if (!f) return;
      f.checked = !f.checked;
      f.dispatchEvent(new Event('change'));
      notify('دنبال کردن انتها: ' + (f.checked ? 'روشن' : 'خاموش'));
    },
  });
  palette.register({ id: 'files-open', title: 'فایل‌های سرور (مرور، جست‌وجو، اخیر)', group: 'فایل', keywords: 'files browser open server finder فایل‌ها مرور باز کردن', run: need(openFiles) });
  defineShortcut({ id: 'files-open', keys: 'Mod+O', title: 'فایل‌های سرور', run: () => (syncActive() ? openFiles() : $('#file')?.click()) });
  updateBar();
}

/** Called once the server probe succeeded: the library may already have opened a linked document. */
export function activateLinked() {
  const link = getLink();
  base = link && !link.dirty ? store.get('source') : null;
  watchLink(link, true);
  updateBar();
}
