// App preferences in the IndexedDB `settings` store (replaces localStorage). Migrates the old localStorage theme once.
import { store } from '../core/store.js';
import { db } from './db.js';
import { sanitizePrefs, STORE_PREF_KEYS } from './prefs-schema.js';
import { readStored, writeStored, removeStored } from '../core/naming.js';

const LEGACY_THEME = 'docloom.appTheme'; // read under the old «md2html.» spelling too — see core/naming.js
const MIRROR = 'docloom.prefs'; // used only when IndexedDB is unavailable
let cache = {};

const readMirror = () => {
  try {
    return JSON.parse(readStored(MIRROR) || '{}');
  } catch {
    return {};
  }
};

export const getPref = (key, fallback = null) => (key in cache ? cache[key] : fallback);

export async function setPref(key, value) {
  const clean = sanitizePrefs({ [key]: value });
  if (!(key in clean)) return;
  cache[key] = value;
  if (db.persistent) {
    try {
      await db.put('settings', { key, value });
    } catch {
      /* quota: preferences are small, ignore */
    }
  } else writeStored(MIRROR, JSON.stringify(cache));
}

export async function initPrefs() {
  await db.open();
  let saved = {};
  if (db.persistent) saved = Object.fromEntries((await db.all('settings')).map((r) => [r.key, r.value]));
  else saved = readMirror();
  cache = sanitizePrefs(saved);
  // One-time migration of the pre-1B localStorage theme (under either spelling of the app's name).
  try {
    const legacy = readStored(LEGACY_THEME);
    if (legacy !== null && db.persistent) {
      if (!('appTheme' in cache) && sanitizePrefs({ appTheme: legacy }).appTheme) await setPref('appTheme', legacy);
      removeStored(LEGACY_THEME);
    } else if (legacy !== null && !('appTheme' in cache) && sanitizePrefs({ appTheme: legacy }).appTheme) cache.appTheme = legacy;
  } catch {
    /* storage blocked */
  }
  for (const k of STORE_PREF_KEYS) if (k in cache) store.set(k, cache[k]);
  for (const k of STORE_PREF_KEYS) store.on(k, (v) => setPref(k, v));
}

/** Make the in-memory prefs and the store match `prefs` (already validated and written to the DB). */
export function applyPrefs(prefs) {
  cache = { ...cache, ...sanitizePrefs(prefs) };
  for (const k of STORE_PREF_KEYS) if (k in cache) store.set(k, cache[k]);
}
