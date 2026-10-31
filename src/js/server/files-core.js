// File browser / link helpers. Pure (no DOM, no network).
export const WRITE_EXT = new Set(['.md', '.markdown', '.txt', '.html', '.htm', '.pdf', '.docx', '.png']);

export const extOf = (p) => {
  const m = /\.[^./\\]+$/.exec(String(p));
  return m ? m[0].toLowerCase() : '';
};
export const baseName = (p) => String(p).split('/').filter(Boolean).pop() || '';
export const dirName = (p) => {
  const i = String(p).lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
};
export const joinPath = (dir, name) => (dir.endsWith('/') ? dir : dir + '/') + name;
export const stemOf = (name) => String(name).replace(/\.[^./]+$/, '');
/** 'html' for .html/.htm files, otherwise 'text' (Markdown or plain text source). */
export const kindOfPath = (p) => (/\.html?$/i.test(p) ? 'html' : 'text');

/** [{name, path}] from the root folder down to `dir`. */
export function crumbs(dir, root) {
  if (!dir || !root || !(dir === root || dir.startsWith(root + '/'))) return [];
  const out = [{ name: baseName(root) || root, path: root }];
  let cur = root;
  for (const seg of dir.slice(root.length).split('/').filter(Boolean)) {
    cur = joinPath(cur, seg);
    out.push({ name: seg, path: cur });
  }
  return out;
}

/**
 * Where an export goes when "save beside the file" is chosen: same folder, linked file's name + the export's own
 * suffix (e.g. "-تعاملی") and extension. Never the linked file itself.
 * @param {{linkPath:string, name:string, titleBase:string}} o  titleBase = the sanitized document title the export name starts with
 */
export function besideTarget({ linkPath, name, titleBase }) {
  const ext = extOf(name);
  let stem = stemOf(name);
  stem = titleBase && stem.startsWith(titleBase) ? stemOf(baseName(linkPath)) + stem.slice(titleBase.length) : stemOf(baseName(linkPath)) + (stem === titleBase ? '' : '-' + stem);
  let target = joinPath(dirName(linkPath), stem + ext);
  if (target === linkPath) target = joinPath(dirName(linkPath), stem + '-خروجی' + ext);
  return target;
}

export function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Cleans a typed file name for the server (no separators / control chars / leading dot); adds `ext` when missing. */
export function cleanFileName(raw, ext = '.md') {
  let n = String(raw || '').replace(/[\\/\0-\x1f:*?"<>|]/g, '-').trim().replace(/^\.+/, '');
  if (!n) return '';
  if (!/\.[A-Za-z0-9]{1,6}$/.test(n)) n += ext;
  return n.slice(0, 200);
}

/** Decide what a disk event means for the open linked document. */
export function diskAction({ link, event, saving }) {
  if (!link || saving) return 'ignore';
  if (!event.exists) return 'missing';
  if (event.etag === link.etag) return 'same';
  return link.dirty ? 'conflict' : 'reload';
}
