// Document versions: save with dedupe + retention. `versions.snapshot(reason)` snapshots the open document.
import { db as defaultDb, QuotaError } from './db.js';
import { newId } from './doc-model.js';
import { MAX_VERSIONS, pruneVersions, pickVersionsToFree, isDuplicateVersion } from './version-rules.js';

/** Persist one version for `cur.docId` and enforce the cap. Returns {skipped:'same'} or {version}. */
export async function saveVersion(cur, reason, { db = defaultDb, now = Date.now(), cap = MAX_VERSIONS } = {}) {
  const existing = await db.versionsOf(cur.docId);
  const latest = existing.reduce((a, v) => (!a || v.savedAt > a.savedAt ? v : a), null);
  if (isDuplicateVersion(latest, cur)) return { skipped: 'same' };
  const version = {
    id: newId('v'), docId: cur.docId, savedAt: now, reason,
    title: cur.title, subtitle: cur.subtitle || '', source: cur.source, html: cur.html, mode: cur.mode || 'doc', layout: cur.layout || {},
  };
  const write = async () => {
    await db.put('versions', version);
    const drop = pruneVersions([...existing, version], cap);
    if (drop.length) await db.delMany('versions', drop);
  };
  try {
    await write();
  } catch (e) {
    if (!(e instanceof QuotaError)) throw e;
    const free = pickVersionsToFree(await db.all('versions'), 8);
    if (!free.length) throw e;
    await db.delMany('versions', free);
    await write();
  }
  return { version };
}

let provider = null;

export const versions = {
  /** library registers a function returning the current document capture (sync part) and persisting it (async part). */
  bind(fn) {
    provider = fn;
  },
  /** Snapshot the open document. reason: 'auto' | 'manual' | 'before-cleanup' | 'before-import'. */
  async snapshot(reason = 'manual') {
    if (!provider) return { skipped: 'none' };
    const cur = await provider(); // capture happens synchronously inside provider
    if (!cur) return { skipped: 'blank' };
    return saveVersion(cur, reason);
  },
  list: async (docId) => (await defaultDb.versionsOf(docId)).sort((a, b) => b.savedAt - a.savedAt),
  remove: (id) => defaultDb.del('versions', id),
};
