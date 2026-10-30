// App preferences stored in the IndexedDB `settings` store. Pure validation.
export const PREF_KEYS = [
  'appTheme', 'autosave', 'uploadEndpoint', 'uploadField', 'embedFontInExport', 'openLinksInNewTab',
  'defaultBrandId', 'lastDocId', 'recentCommands',
];
// Keys that mirror a live store key (the rest are library-internal).
export const STORE_PREF_KEYS = ['appTheme', 'autosave', 'uploadEndpoint', 'uploadField', 'embedFontInExport', 'openLinksInNewTab'];

const rules = {
  appTheme: (v) => ['light', 'dark', 'system'].includes(v),
  autosave: (v) => typeof v === 'boolean',
  uploadEndpoint: (v) => typeof v === 'string' && v.length <= 300 && (v === '' || /^https:\/\//i.test(v)),
  uploadField: (v) => v === 'file',
  embedFontInExport: (v) => typeof v === 'boolean',
  openLinksInNewTab: (v) => typeof v === 'boolean',
  defaultBrandId: (v) => v === null || (typeof v === 'string' && v.length <= 80),
  lastDocId: (v) => v === null || (typeof v === 'string' && v.length <= 80),
  recentCommands: (v) => Array.isArray(v) && v.length <= 12 && v.every((x) => typeof x === 'string' && x.length <= 80),
};

/** Keep only known keys with valid values. */
export function sanitizePrefs(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const k of PREF_KEYS) if (k in obj && rules[k](obj[k])) out[k] = obj[k];
  return out;
}
