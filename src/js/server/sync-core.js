// Library sync: pure decision logic (no DOM, no network). The runtime is in sync.js.
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
 * @returns {{act:'noop'|'push'|'pull'|'push-delete'|'pull-delete'|'conflict', winner?:'local'|'remote'}}
 */
export function decide({ store, local, remote, base }) {
  const noop = { act: 'noop' };
  if (!local && !remote) return noop;
  if (local && !remote) return local.deleted ? noop : { act: 'push' };
  if (!local && remote) return remote.deleted ? noop : { act: 'pull' };
  if (local.deleted && remote.deleted) return noop;
  if (!local.deleted && !remote.deleted && local.ts === remote.ts) return noop;
  const lc = local.deleted || base === undefined || local.ts !== base;
  const rc = remote.deleted || base === undefined || remote.ts !== base;
  if (!lc && !rc) return noop;
  if (lc && !rc) return { act: local.deleted ? 'push-delete' : 'push' };
  if (!lc && rc) return { act: remote.deleted ? 'pull-delete' : 'pull' };
  // both sides changed since the last sync
  if (store === 'versions') return { act: local.deleted ? 'push-delete' : 'pull-delete' }; // versions are immutable: a delete wins
  if (local.deleted) return { act: 'pull' }; // an edit beats a delete
  if (remote.deleted) return { act: 'push' };
  const winner = local.ts > remote.ts ? 'local' : 'remote';
  if (store === 'documents') return { act: 'conflict', winner };
  return { act: winner === 'local' ? 'push' : 'pull' }; // brands / settings: newer wins
}

/** The losing side of a document conflict, kept as a separate document. */
export function conflictCopy(loser, newId, now = Date.now()) {
  return { ...loser, id: newId, title: (loser.title || 'بدون عنوان') + CONFLICT_SUFFIX, pinned: false, createdAt: now, updatedAt: now };
}
