// Embed mode: the API a host page uses when it embeds the single-file app (window.MD2HTML_EMBED, see CLAUDE.md).
// Only app.js calls initEmbed(), and only when the global is defined: without it nothing here runs.
import { store, DOC_DEFAULTS } from '../core/store.js';
import { $, $$ } from '../core/dom.js';
import { embedConfig } from '../core/embed-config.js';
import { preview, applyLook, resetHistory, isEmpty, renderFromSource, clearContent, previewInSync } from '../editor/preview.js';
import { toggleSourceMode } from '../editor/source.js';
import { sanitizeToFragment, sanitizeChildren } from '../content/sanitize.js';
import { captureDoc, docToPatch, TRACKED_KEYS } from '../library/doc-model.js';
import { htmlToMarkdown } from '../export/markdown.js';
import { exportPDF } from '../export/actions.js';
import { brands, applyBrand as applyBrandId } from '../brand/brands.js';
import { palette } from '../ui/palette.js';
import { startChromeDigits } from './chrome-digits.js';

const listeners = { dirty: new Set(), save: new Set() };
let loading = false;
let dirty = false;

function fire(name, ...args) {
  for (const fn of listeners[name]) {
    try {
      fn(...args);
    } catch (e) {
      console.error('MD2Html embed listener failed', e);
    }
  }
}

/** Content or a document setting changed: the first change after load/markClean fires 'dirty'. */
function touched() {
  if (loading || dirty) return;
  dirty = true;
  fire('dirty', true);
}

/** Sanitized copy of the preview: the document's own blocks (header, footer, letter) included, no editor UI. */
function cleanBox() {
  const box = document.createElement('div');
  box.append(sanitizeChildren(preview));
  return box;
}

const text = (v) => (v == null ? '' : String(v));

function markClean() {
  dirty = false;
  store.set('dirty', false); // also lifts the beforeunload guard
}

/**
 * load({ markdown, title, subtitle, doc, html })
 * - doc + html: restore a saved studio state (fields as getDoc() returns them, html as getHTML() returns it).
 * - otherwise: a fresh document (defaults + default brand) with title/subtitle, rendered from `markdown`.
 */
function load({ markdown, title, subtitle, doc, html } = {}) {
  loading = true;
  try {
    const hasDoc = !!doc && typeof doc === 'object';
    if (hasDoc) store.patch({ ...docToPatch(doc), link: null, pendingUpload: null });
    else {
      // Same as "new document": document fields back to defaults, then the default brand (state only).
      store.patch({ ...DOC_DEFAULTS, pendingUpload: null });
      const id = brands.defaultId();
      if (id) applyBrandId(id, { refresh: false });
    }
    if (title !== undefined) store.set('title', text(title));
    if (subtitle !== undefined) store.set('subtitle', text(subtitle));
    if (markdown !== undefined || !hasDoc) store.set('source', text(markdown));
    if (hasDoc && typeof html === 'string') {
      preview.replaceChildren(sanitizeToFragment(html));
      applyLook();
    } else if (store.get('source').trim()) renderFromSource();
    else clearContent();
    toggleSourceMode(false);
    resetHistory();
    preview.dataset.empty = String(isEmpty());
    store.emit('content');
  } finally {
    loading = false;
  }
  markClean();
}

/** The Markdown source while the preview still matches it; otherwise the preview converted (as the Markdown export does). */
function getMarkdown() {
  const src = store.get('source') || '';
  if (src.trim() && previewInSync()) return src;
  const box = cleanBox();
  box.querySelectorAll('[data-md2-furniture]').forEach((n) => n.remove()); // title, header and footer live in the document fields
  const md = htmlToMarkdown(box);
  return md.trim() ? md : '';
}

/** JSON-safe document fields (what the library stores, minus html/text/ids/timestamps). Round-trips through load({doc, html}). */
function getDoc() {
  const rec = captureDoc({ id: 'embed', state: store.snapshot(), html: '', text: '' });
  for (const k of ['id', 'html', 'text', 'tags', 'pinned', 'createdAt', 'updatedAt']) delete rec[k];
  rec.link = null;
  return JSON.parse(JSON.stringify(rec));
}

function applyBrand(input) {
  if (!input || typeof input !== 'object') return null;
  const b = brands.register(input, { asDefault: true });
  applyBrandId(b.id);
  return b.id;
}

function on(name, fn) {
  if (!listeners[name]) throw new Error('MD2Html embed: unknown event ' + name);
  if (typeof fn !== 'function') throw new TypeError('MD2Html embed: listener must be a function');
  listeners[name].add(fn);
  return () => listeners[name].delete(fn);
}

// What each switched-off capability removes from the chrome and the ⌘K palette.
const HIDE = {
  library: ['#libraryBtn'],
  server: ['#filesBtn', '#serverBtn', '#destGroup', '#pdfNumbers', '[data-export="pdf-direct"]', '[data-export="batch"]', '[data-export="share"]'],
  upload: [],
};
const PALETTE_OFF = {
  library: ['open-library', 'save-version', 'versions', 'toggle-autosave', 'backup-export', 'backup-import'],
  server: ['export-pdf-direct'],
  upload: [],
};

function hide(node) {
  if (!node) return;
  node.hidden = true;
  node.setAttribute('data-embed-hidden', ''); // embed.css keeps it hidden even if a module un-hides it later
}

function trimChrome(cfg) {
  const root = document.documentElement;
  root.classList.add('md2-embed');
  for (const key of ['library', 'server', 'upload']) {
    if (cfg[key]) continue;
    root.classList.add('md2-embed-no-' + key);
    HIDE[key].forEach((sel) => $$(sel).forEach(hide));
    PALETTE_OFF[key].forEach((id) => palette.unregister(id));
  }
  if (!cfg.library) {
    const auto = $('#autosave')?.closest('label');
    hide(auto);
    if (auto?.nextElementSibling?.matches('p.muted')) hide(auto.nextElementSibling); // "saved in this browser's library"
  }
  if (!cfg.upload) hide($('#uploadImage')?.closest('details'));
}

/** Empty container at the start of the top bar's action area, for the host's own buttons. */
function makeSlot() {
  const slot = document.createElement('div');
  slot.className = 'slot embed-slot';
  slot.id = 'md2EmbedSlot';
  slot.dataset.slot = 'host';
  $('.top-actions').prepend(slot);
  return slot;
}

/** Wire embed mode. Called by app.js after every module is initialised, only when MD2HTML_EMBED is defined. */
export function initEmbed() {
  const cfg = embedConfig();
  trimChrome(cfg);
  if (cfg.brand) {
    const b = brands.register(cfg.brand, { asDefault: true });
    if (!cfg.library) applyBrandId(b.id, { refresh: false });
  }
  const api = {
    ready: false,
    config: cfg,
    slot: makeSlot(),
    load,
    getMarkdown,
    getHTML: () => cleanBox().innerHTML,
    getDoc,
    isDirty: () => dirty,
    markClean,
    on,
    print: () => exportPDF(),
    applyBrand,
  };
  if (cfg.digits === 'en') startChromeDigits();
  store.on('content', touched);
  store.on('*', (key) => {
    if (TRACKED_KEYS.has(key)) touched();
  });
  store.on('embed:save', () => fire('save'));
  window.MD2Html = Object.assign(window.MD2Html || {}, { embed: api });
  markClean();
  api.ready = true;
  window.dispatchEvent(new Event('md2html:ready'));
  return api;
}
