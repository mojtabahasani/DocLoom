// App preferences stored in the IndexedDB `settings` store. Pure validation.
export const PREF_KEYS = [
  'appTheme', 'autosave', 'uploadEndpoint', 'uploadField', 'embedFontInExport', 'openLinksInNewTab',
  'defaultBrandId', 'lastDocId', 'recentCommands', 'brandsSeeded', 'groupGlyph', 'panelGroups',
];
// Keys that mirror a live store key (the rest are library-internal).
export const STORE_PREF_KEYS = ['appTheme', 'autosave', 'uploadEndpoint', 'uploadField', 'embedFontInExport', 'openLinksInNewTab', 'groupGlyph'];

const rules = {
  appTheme: (v) => ['light', 'dark', 'system'].includes(v),
  autosave: (v) => typeof v === 'boolean',
  uploadEndpoint: (v) => typeof v === 'string' && v.length <= 300 && (v === '' || /^https:\/\//i.test(v)),
  uploadField: (v) => v === 'file',
  embedFontInExport: (v) => typeof v === 'boolean',
  openLinksInNewTab: (v) => typeof v === 'boolean',
  defaultBrandId: (v) => v === null || (typeof v === 'string' && v.length <= 80),
  brandsSeeded: (v) => v === true,
  groupGlyph: (v) => v === 'icon' || v === 'emoji',
  // Which group each side panel was left on: {content:'input', design:'look'} — keys and values
  // are plain slugs, checked here so a hand-edited backup cannot push anything else into the DOM.
  panelGroups: (v) =>
    v !== null && typeof v === 'object' && !Array.isArray(v) &&
    Object.entries(v).every(([k, g]) => /^[a-z]{1,20}$/.test(k) && typeof g === 'string' && /^[a-z]{1,20}$/.test(g)),
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
