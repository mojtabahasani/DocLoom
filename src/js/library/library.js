// Library controller: the open document, autosave, open / new / duplicate / archive (with undo), version restore.
// Nothing here destroys a document that ever held content: «حذف» sets `archivedAt` and the record, with its versions, stays.
import { store, DEFAULTS } from '../core/store.js';
import { notify } from '../core/notify.js';
import { sanitizeToFragment } from '../content/sanitize.js';
import { preview, plainText, applyLook, resetHistory, isEmpty } from '../editor/preview.js';
import { toggleSourceMode } from '../editor/source.js';
import { db, QuotaError } from './db.js';
import { versions } from './versions.js';
import { getPref, setPref } from './prefs.js';
import { captureDoc, docToPatch, newId, normalizeTags, isBlankDoc, TRACKED_KEYS } from './doc-model.js';
import { shouldAutoVersion, pickVersionsToFree } from './version-rules.js';

const AUTOSAVE_MS = 1500;
const QUOTA_MSG = 'فضای ذخیره‌سازی مرورگر پر شده است؛ سندها یا نسخه‌های قدیمی را حذف کنید یا از کتابخانه پشتیبان بگیرید.';

let meta = { tags: [], pinned: false, createdAt: null, brandId: null };
let persisted = false;
let fresh = false; // created by "new document" and never had content
let loading = false;
let changeSeq = 0;
let lastAutoAt = null;
let changedSinceVersion = false;
let queue = Promise.resolve();
let lastQuotaNote = 0;

const changed = () => store.emit('library:changed');
const enqueue = (fn) => (queue = queue.then(fn, fn));

function ensureId() {
  if (!store.get('docId')) store.set('docId', newId());
  return store.get('docId');
}

/** Synchronous capture of the open document (so callers can snapshot BEFORE mutating the editor). */
function capture(now = Date.now()) {
  return captureDoc({ id: ensureId(), state: store.snapshot(), html: preview.innerHTML, text: plainText(), meta, now });
}

async function putDoc(rec) {
  try {
    await db.put('documents', rec);
  } catch (e) {
    if (!(e instanceof QuotaError)) throw e;
    const free = pickVersionsToFree(await db.all('versions'), 10);
    if (!free.length) throw e;
    await db.delMany('versions', free);
    await db.put('documents', rec);
  }
}

function reportError(e) {
  if (e instanceof QuotaError) {
    if (Date.now() - lastQuotaNote > 20000) notify(QUOTA_MSG, { duration: 7000 });
    lastQuotaNote = Date.now();
  } else notify('ذخیره در کتابخانه انجام نشد.');
}

/** Write the open document now. `force` also writes a blank document. */
function saveNow({ force = false } = {}) {
  clearTimeout(timer);
  if (loading) return queue;
  const seq = changeSeq;
  const rec = capture();
  if (!persisted && !force && isBlankDoc(rec)) return queue;
  return enqueue(async () => {
    try {
      await putDoc(rec);
    } catch (e) {
      reportError(e);
      return;
    }
    persisted = true;
    meta.createdAt = rec.createdAt;
    if (!isBlankDoc(rec)) fresh = false;
    if (seq === changeSeq && db.persistent) store.set('dirty', false);
    setPref('lastDocId', rec.id);
    changed();
    if (shouldAutoVersion({ lastAt: lastAutoAt, now: Date.now(), changed: changedSinceVersion })) {
      lastAutoAt = Date.now();
      changedSinceVersion = false;
      versions.snapshot('auto').catch(reportError);
    }
  });
}

let timer = 0;
function schedule() {
  if (!store.get('autosave')) return;
  clearTimeout(timer);
  timer = setTimeout(() => saveNow(), AUTOSAVE_MS);
}

function onChange() {
  if (loading) return;
  changeSeq++;
  changedSinceVersion = true;
  if (lastAutoAt == null) lastAutoAt = Date.now();
  schedule();
}

function applyDoc(doc) {
  loading = true;
  store.emit('doc:loading');
  try {
    store.patch({ ...docToPatch(doc), pendingUpload: null });
    preview.replaceChildren(sanitizeToFragment(doc.html || ''));
    applyLook();
    resetHistory();
    preview.dataset.empty = String(isEmpty());
    toggleSourceMode(false);
    store.set('dirty', false);
    store.set('docId', doc.id);
    store.emit('content');
  } finally {
    loading = false;
  }
  meta = { tags: doc.tags || [], pinned: !!doc.pinned, createdAt: doc.createdAt, brandId: doc.brandId || null };
  persisted = true;
  fresh = false;
  lastAutoAt = null;
  changedSinceVersion = false;
  setPref('lastDocId', doc.id);
  store.emit('doc:applied', doc); // the linked-file module re-checks the disk copy
  changed();
}

/** Leave the open document: save it, or discard it when it is a fresh, still-empty "new document". */
function leaveCurrent() {
  const id = store.get('docId');
  if (!id) return queue;
  const rec = capture();
  if (fresh && isBlankDoc(rec)) {
    return enqueue(async () => {
      await db.del('documents', id);
      changed();
    });
  }
  return saveNow();
}

const isLive = (d) => !d.archivedAt;

/** Mark a stored document archived. A normal edit as far as sync is concerned, so it travels like one. */
async function archiveRecord(doc, now = Date.now()) {
  await db.put('documents', { ...doc, archivedAt: now, updatedAt: now });
}

async function unarchiveRecord(doc, now = Date.now()) {
  const { archivedAt: _gone, ...rest } = doc;
  const live = { ...rest, updatedAt: now };
  await db.put('documents', live);
  return live;
}

/** Drop a document the user walked away from: destroyed only when it never held content, archived otherwise. */
async function discardRecord(id) {
  const doc = await db.get('documents', id);
  if (!doc) return;
  if (!isBlankDoc(doc)) return archiveRecord(doc);
  const vs = await db.versionsOf(id);
  await db.delMany('versions', vs.map((v) => v.id));
  await db.del('documents', id);
}

function blankState() {
  meta = { tags: [], pinned: false, createdAt: Date.now(), brandId: null };
  persisted = false;
  fresh = true;
  lastAutoAt = null;
  changedSinceVersion = false;
  changeSeq++;
}

export const library = {
  /** Live documents, newest first. Archived ones are only reachable through `archived()`. */
  list: async () => (await db.all('documents')).filter(isLive).sort((a, b) => b.updatedAt - a.updatedAt),
  archived: async () => (await db.all('documents')).filter((d) => !isLive(d)).sort((a, b) => b.archivedAt - a.archivedAt),
  currentId: () => store.get('docId'),
  get persistent() {
    return db.persistent;
  },
  saveNow,
  flush: () => saveNow(),

  async open(id) {
    if (id === store.get('docId')) return true;
    await leaveCurrent();
    const doc = await db.get('documents', id);
    if (!doc) {
      notify('این سند در کتابخانه پیدا نشد.');
      changed();
      return false;
    }
    applyDoc(doc.archivedAt ? await unarchiveRecord(doc) : doc); // opening an archived document brings it back
    return true;
  },

  /** Load a document without saving the current one first (used after a backup import replaced the data). */
  async openFresh(id) {
    clearTimeout(timer);
    await queue;
    const doc = id && (await db.get('documents', id));
    applyDoc(doc || captureDoc({ id: newId(), state: { ...DEFAULTS }, html: '', text: '' }));
    if (!doc) {
      persisted = false;
      fresh = true;
    }
  },

  /** Called by the editor after it cleared the document ('doc:new'). Creates the library entry. */
  createEntry() {
    store.set('docId', null);
    blankState();
    ensureId();
    return saveNow({ force: true });
  },

  async duplicate(id) {
    if (id === store.get('docId')) await saveNow();
    const src = await db.get('documents', id);
    if (!src) return;
    const now = Date.now();
    const copy = { ...src, id: newId(), title: (src.title || 'بدون عنوان') + ' (کپی)', pinned: false, createdAt: now, updatedAt: now };
    try {
      await putDoc(copy);
    } catch (e) {
      return reportError(e);
    }
    changed();
    notify('نسخهٔ تکراری ساخته شد.', { action: { label: 'باز کردن', run: () => library.open(copy.id) } });
  },

  /** «حذف»: archive. The record and its versions stay; `restore` (or opening it) brings it back. */
  async remove(id) {
    const wasCurrent = id === store.get('docId');
    if (wasCurrent) await saveNow();
    await queue;
    const doc = await db.get('documents', id);
    if (!doc || doc.archivedAt) return;
    await archiveRecord(doc);
    changed();
    if (wasCurrent) {
      const rest = await library.list();
      if (rest.length) applyDoc(rest[0]);
      else {
        applyDoc(captureDoc({ id: newId(), state: { ...DEFAULTS }, html: '', text: '' }));
        persisted = false;
        fresh = true;
      }
    }
    notify('سند بایگانی شد.', { action: { label: 'برگردان', run: () => (wasCurrent ? library.open(id) : library.restore(id)) } });
  },

  /** Bring an archived document back into the library. */
  async restore(id) {
    const doc = await db.get('documents', id);
    if (!doc) return false;
    if (doc.archivedAt) await unarchiveRecord(doc);
    changed();
    return true;
  },

  async setTags(id, tags) {
    if (id === store.get('docId')) meta.tags = normalizeTags(tags);
    const doc = await db.get('documents', id);
    if (!doc) return;
    await db.put('documents', { ...doc, tags: normalizeTags(tags) });
    changed();
  },

  async togglePin(id) {
    const doc = await db.get('documents', id);
    if (!doc) return;
    if (id === store.get('docId')) meta.pinned = !doc.pinned;
    await db.put('documents', { ...doc, pinned: !doc.pinned });
    changed();
  },

  /** ⌘S: save the document and a manual version. */
  async saveVersion() {
    await saveNow({ force: true });
    try {
      const r = await versions.snapshot('manual');
      if (r.skipped === 'same') notify('محتوا از آخرین نسخه تغییری نکرده است.');
      else {
        lastAutoAt = Date.now();
        changedSinceVersion = false;
        notify('نسخه ذخیره شد.');
        changed();
      }
    } catch (e) {
      reportError(e);
    }
  },

  /** Restore a saved version into the open document (the current state is kept as a manual version first). */
  async restoreVersion(v) {
    await versions.snapshot('manual').catch(() => {});
    const cur = capture();
    applyDoc({ ...cur, title: v.title, subtitle: v.subtitle ?? cur.subtitle, source: v.source, html: v.html, mode: v.mode || cur.mode, layout: { ...cur.layout, ...(v.layout || {}) } });
    await saveNow({ force: true });
    notify('نسخه بازگردانی شد.');
  },

  async start() {
    await db.open();
    if (!db.persistent) notify('ذخیره‌سازی مرورگر در دسترس نیست؛ کتابخانه فقط تا بستن صفحه کار می‌کند.', { duration: 7000 });
    const docs = await library.list();
    const last = getPref('lastDocId');
    const doc = docs.find((d) => d.id === last) || docs[0];
    if (doc) applyDoc(doc);
  },
};

export function initLibrary() {
  // What the editor did with the document, as events (see editor/document.js).
  store.on('doc:before-new', () => void leaveCurrent());
  store.on('doc:new', () => void library.createEntry());
  store.on('doc:restored', (abandonedId) => {
    enqueue(async () => {
      const id = store.get('docId');
      const doc = id && (await db.get('documents', id));
      if (doc) meta = { tags: doc.tags || [], pinned: !!doc.pinned, createdAt: doc.createdAt, brandId: doc.brandId || null };
      persisted = !!doc;
      fresh = false;
      if (abandonedId && abandonedId !== id) await discardRecord(abandonedId);
      changed();
    });
    changeSeq++;
    schedule();
  });
  store.on('before-import', () => {
    if (!isEmpty()) versions.snapshot('before-import').catch(() => {});
  });
  store.on('content', onChange);
  store.on('*', (key) => {
    if (TRACKED_KEYS.has(key)) onChange();
  });
  versions.bind(() => {
    const rec = capture();
    if (isBlankDoc(rec)) return null;
    if (!persisted) enqueue(() => putDoc(rec).then(() => void (persisted = true)));
    return { ...rec, docId: rec.id };
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && store.get('autosave')) saveNow();
  });
  window.addEventListener('pagehide', () => {
    if (store.get('autosave')) saveNow();
  });
  store.on('autosave', (on) => {
    if (on && store.get('dirty')) schedule();
  });
}
