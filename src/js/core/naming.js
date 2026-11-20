// The app was «MD2Html» before it became DocLoom / DocLoom (docloom).
//
// Everything written from here on carries the new name. Everything the old name wrote is still the
// user's own data, so it is adopted, never abandoned: each helper below reads the new name first and
// falls back to the old one. That is the whole rule — a rename must not cost anyone a document, a
// preference or a backup file.
//
// Two names are deliberately NOT changed, because they are addresses rather than labels:
//   • the IndexedDB database name (`library/db.js`) — renaming it means copying the whole library
//     into a second database, and this user already hits the browser quota with one copy.
//   • `data-md2-furniture` / `data-md2-keep-digits` — these are written into the HTML of every
//     document, and 44 saved documents already carry them. Renaming the attribute would mean
//     rewriting that HTML, or carrying two spellings forever, to change a marker nobody ever sees.
export const APP_ID = 'docloom';
export const LEGACY_APP_ID = 'md2html';
export const APP_NAME_FA = 'DocLoom';
export const APP_NAME_EN = 'DocLoom';

/** The old spelling of a key this version writes, e.g. `docloom.prefs` → `md2html.prefs`. */
export const legacyKey = (key) => String(key).replace(APP_ID, LEGACY_APP_ID);

const store = () => {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null; // private mode / blocked site data
  }
};

/**
 * Read a stored value, adopting what the old name left behind. When only the legacy key exists its
 * value is copied to the new key and the old one dropped, so the carry-over happens exactly once.
 */
export function readStored(key) {
  const ls = store();
  if (!ls) return null;
  try {
    const now = ls.getItem(key);
    if (now !== null) return now;
    const old = ls.getItem(legacyKey(key));
    if (old === null) return null;
    try {
      ls.setItem(key, old);
      ls.removeItem(legacyKey(key));
    } catch {
      /* out of quota: still return the value, just do not carry it over */
    }
    return old;
  } catch {
    return null;
  }
}

export function writeStored(key, value) {
  const ls = store();
  if (!ls) return false;
  try {
    ls.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStored(key) {
  const ls = store();
  if (!ls) return;
  try {
    ls.removeItem(key);
    ls.removeItem(legacyKey(key));
  } catch {
    /* ignore */
  }
}
