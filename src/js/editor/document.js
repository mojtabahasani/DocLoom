// Document-level operations: new document with undo, snapshot/restore.
import { store, DOC_DEFAULTS } from '../core/store.js';
import { notify } from '../core/notify.js';
import { preview, clearContent, resetHistory, applyLook, isEmpty } from './preview.js';
import { toggleSourceMode } from './source.js';

function snapshot() {
  const s = store.snapshot();
  return {
    fields: Object.fromEntries(Object.keys(DOC_DEFAULTS).map((k) => [k, s[k]])),
    html: preview.innerHTML,
    pendingUpload: s.pendingUpload,
    dirty: s.dirty,
  };
}

function restore(snap) {
  store.patch({ ...snap.fields, pendingUpload: snap.pendingUpload });
  preview.innerHTML = snap.html;
  applyLook();
  resetHistory();
  preview.dataset.empty = String(isEmpty());
  store.set('dirty', snap.dirty);
  store.emit('content');
}

/** Clears the document immediately; when there was work, offers an 8-second "برگردان". */
export function newDocument() {
  const snap = snapshot();
  const hadWork = store.get('dirty') || !isEmpty();
  store.patch({ ...DOC_DEFAULTS, pendingUpload: null });
  clearContent();
  toggleSourceMode(false);
  store.set('dirty', false);
  notify('سند تازه آماده است.', hadWork ? { action: { label: 'برگردان', run: () => restore(snap) } } : {});
}
