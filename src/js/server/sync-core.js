// Library sync: pure decision logic (no DOM, no network). The runtime is in sync.js.
import { resolveBrandImages } from '../library/doc-model.js';
export const SYNC_STORES = ['documents', 'versions', 'brands', 'settings'];
// Per-device preferences never leave the device.
export const SYNC_SETTINGS = new Set(['autosave', 'uploadEndpoint', 'uploadField', 'embedFontInExport', 'openLinksInNewTab', 'defaultBrandId']);
export const CONFLICT_SUFFIX = ' (تعارض)';

export const keyOf = (store, id) => `${store}/${id}`;
export const splitKey = (k) => {
  const i = k.indexOf('/');
  return [k.slice(0, i), k.slice(i + 1)];
};
export const isSynced = (store, id) => store !== 'settings' || SYNC_SETTINGS.has(id);

/** Timestamp a local record carries: documents → updatedAt, versions → savedAt, brands/settings → recorded change time (0 if unknown). */
export function localTs(store, rec, lts = {}) {
  if (store === 'documents') return Number(rec.updatedAt) || 0;
  if (store === 'versions') return Number(rec.savedAt) || 0;
  return Number(lts[keyOf(store, store === 'settings' ? rec.key : rec.id)]) || 0;
}

/**
 * Decide what to do with one item.
 *  local / remote: null | {ts, deleted?}    base: ts both sides agreed on at the last sync (undefined = never synced)
 * @returns {{act:'noop'|'push'|'pull'|'push-delete'|'pull-delete'|'compare'|'conflict', winner?:'local'|'remote'}}
 *
 * `compare` means "this only *looks* like a conflict because the bookkeeping is missing": the caller
 * must fetch both records and call `sameDocContent` before anything is duplicated. See below.
 */
export function decide({ store, local, remote, base }) {
  const noop = { act: 'noop' };
  if (!local && !remote) return noop;
  if (local && !remote) return local.deleted ? noop : { act: 'push' };
  if (!local && remote) return remote.deleted ? noop : { act: 'pull' };
  if (local.deleted && remote.deleted) return noop;
  if (!local.deleted && !remote.deleted && local.ts === remote.ts) return noop;
  const unknownBase = base === undefined;
  const lc = local.deleted || unknownBase || local.ts !== base;
  const rc = remote.deleted || unknownBase || remote.ts !== base;
  if (!lc && !rc) return noop;
  if (lc && !rc) return { act: local.deleted ? 'push-delete' : 'push' };
  if (!lc && rc) return { act: remote.deleted ? 'pull-delete' : 'pull' };
  // both sides changed since the last sync
  if (store === 'versions') return { act: local.deleted ? 'push-delete' : 'pull-delete' }; // versions are immutable: a delete wins
  if (local.deleted) return { act: 'pull' }; // an edit beats a delete
  if (remote.deleted) return { act: 'push' };
  const winner = local.ts > remote.ts ? 'local' : 'remote';
  // A missing base is NOT evidence that both sides were edited. The base map is per-device
  // bookkeeping, and it can simply be gone: storage cleared, a quota write that failed, the server
  // restored from a backup, a first sync from a second device. Treating that as a conflict split
  // every document in two — it is what turned this library into 60 «(تعارض)» copies of 80
  // documents, duplicates of duplicates included. So when the base is unknown, the content decides.
  if (store === 'documents') return { act: unknownBase ? 'compare' : 'conflict', winner };
  return { act: winner === 'local' ? 'push' : 'pull' }; // brands / settings: newer wins
}

/** Fields that make a document the document; ids, times and library metadata are not content. */
const CONTENT_FIELDS = ['title', 'subtitle', 'source', 'sourceType', 'html', 'text', 'mode', 'brandId', 'link', 'watermark', 'letter', 'layout'];

/** Key order can differ once a record has been through JSON, so compare on a stable shape. */
const stable = (v) => {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
  return v === undefined || v === null ? null : v;
};

/**
 * Do these two document records hold the same content? Used before a conflict copy is made, so two
 * sides that merely lost track of each other converge instead of multiplying.
 *
 * `brand` resolves images one side may reference and the other carry: during the migration that
 * stopped copying brand images into every document, the server holds slim records while a browser
 * that has not saved since still holds fat ones. They are the same document, and without resolving
 * them first this comparison would call that a conflict — the very thing it exists to prevent.
 */
export function sameDocContent(a, b, brand = null) {
  if (!a || !b) return false;
  const x = resolveBrandImages(a, brand);
  const y = resolveBrandImages(b, brand);
  for (const k of CONTENT_FIELDS) {
    if (JSON.stringify(stable(x[k])) !== JSON.stringify(stable(y[k]))) return false;
  }
  return true;
}

/** The losing side of a document conflict, kept as a separate document. */
export function conflictCopy(loser, newId, now = Date.now()) {
  return { ...loser, id: newId, title: (loser.title || 'بدون عنوان') + CONFLICT_SUFFIX, pinned: false, createdAt: now, updatedAt: now };
}
