// Full backup file: build + strict validation. Pure.
import { sanitizePrefs } from './prefs-schema.js';
import { REASONS } from './version-rules.js';
import { normalizeTags } from './doc-model.js';

export const BACKUP_FORMAT = 'md2html-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

export function buildBackup({ documents = [], versions = [], brands = [], settings = {} }, now = Date.now()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: 'MD2Html',
    exportedAt: new Date(now).toISOString(),
    documents,
    versions,
    brands,
    settings: sanitizePrefs(settings),
  };
}

const isStr = (v, max = Infinity) => typeof v === 'string' && v.length <= max;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);

function cleanDoc(d) {
  if (!plain(d) || !isStr(d.id, 80) || !d.id) return null;
  if (!isStr(d.title, 500) || !isStr(d.source) || !isStr(d.html)) return null;
  if (!isNum(d.createdAt) || !isNum(d.updatedAt)) return null;
  if (d.tags !== undefined && !Array.isArray(d.tags)) return null;
  if (d.layout !== undefined && !plain(d.layout)) return null;
  return {
    ...d,
    subtitle: isStr(d.subtitle) ? d.subtitle : '',
    text: isStr(d.text) ? d.text : '',
    mode: ['doc', 'web', 'letter'].includes(d.mode) ? d.mode : 'doc',
    tags: normalizeTags(d.tags || []),
    pinned: d.pinned === true,
    layout: d.layout || {},
  };
}

function cleanVersion(v) {
  if (!plain(v) || !isStr(v.id, 80) || !v.id || !isStr(v.docId, 80) || !isNum(v.savedAt)) return null;
  if (!REASONS.includes(v.reason) || !isStr(v.title, 500) || !isStr(v.source) || !isStr(v.html)) return null;
  return v;
}

function cleanBrand(b) {
  return plain(b) && isStr(b.id, 80) && b.id && isStr(b.name, 200) ? b : null;
}

/** @returns {{ok:true, data:{documents,versions,brands,settings}, counts} | {ok:false, error:string}} */
export function validateBackup(obj) {
  if (!plain(obj) || obj.format !== BACKUP_FORMAT) return { ok: false, error: 'فایل پشتیبان معتبرِ MD2Html نیست.' };
  if (obj.version !== BACKUP_VERSION) return { ok: false, error: 'نسخهٔ این فایل پشتیبان پشتیبانی نمی‌شود.' };
  if (![obj.documents, obj.versions, obj.brands].every(Array.isArray)) return { ok: false, error: 'ساختار فایل پشتیبان ناقص است.' };
  const take = (list, clean, label) => {
    const seen = new Set();
    const out = [];
    for (const [i, item] of list.entries()) {
      const c = clean(item);
      if (!c) return { error: `${label} شمارهٔ ${i + 1} در فایل پشتیبان نامعتبر است.` };
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
    return { out };
  };
  const docs = take(obj.documents, cleanDoc, 'سند');
  if (docs.error) return { ok: false, error: docs.error };
  const vers = take(obj.versions, cleanVersion, 'نسخهٔ');
  if (vers.error) return { ok: false, error: vers.error };
  const brands = take(obj.brands, cleanBrand, 'برند');
  if (brands.error) return { ok: false, error: brands.error };
  const ids = new Set(docs.out.map((d) => d.id));
  const versions = vers.out.filter((v) => ids.has(v.docId)); // orphan versions are dropped
  const data = { documents: docs.out, versions, brands: brands.out, settings: sanitizePrefs(obj.settings) };
  return { ok: true, data, counts: { documents: docs.out.length, versions: versions.length, brands: brands.out.length } };
}

/** Merge strategy: for equal ids keep the newer document; versions/brands are unioned by id. */
export function planMerge(existing, incoming) {
  const have = new Map(existing.documents.map((d) => [d.id, d]));
  const documents = incoming.documents.filter((d) => !have.has(d.id) || have.get(d.id).updatedAt < d.updatedAt);
  const haveV = new Set(existing.versions.map((v) => v.id));
  const haveB = new Set(existing.brands.map((b) => b.id));
  return {
    documents,
    versions: incoming.versions.filter((v) => !haveV.has(v.id)),
    brands: incoming.brands.filter((b) => !haveB.has(b.id)),
    settings: {},
  };
}
