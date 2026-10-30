// App preferences in the IndexedDB `settings` store (replaces localStorage). Migrates the old localStorage theme once.
import { store } from '../core/store.js';
import { db } from './db.js';
import { sanitizePrefs, STORE_PREF_KEYS } from './prefs-schema.js';

const LEGACY_THEME = 'md2html.appTheme';
const MIRROR = 'md2html.prefs'; // used only when IndexedDB is unavailable
let cache = {};

const readMirror = () => {
  try {
    return JSON.parse(localStorage.getItem(MIRROR) || '{}');
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
  } else {
    try {
      localStorage.setItem(MIRROR, JSON.stringify(cache));
    } catch {
      /* storage blocked */
    }
  }
}

export async function initPrefs() {
  await db.open();
  let saved = {};
  if (db.persistent) saved = Object.fromEntries((await db.all('settings')).map((r) => [r.key, r.value]));
  else saved = readMirror();
  cache = sanitizePrefs(saved);
  // One-time migration of the pre-1B localStorage theme.
  try {
    const legacy = localStorage.getItem(LEGACY_THEME);
    if (legacy !== null && db.persistent) {
      if (!('appTheme' in cache) && sanitizePrefs({ appTheme: legacy }).appTheme) await setPref('appTheme', legacy);
      localStorage.removeItem(LEGACY_THEME);
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
