// Brand records (IndexedDB `brands` store) and applying a brand to the open document.
import { store } from '../core/store.js';
import { db } from '../library/db.js';
import { getPref, setPref } from '../library/prefs.js';
import { refreshFurniture } from '../editor/preview.js';
import { normalizeBrand, seedBrand, duplicateBrand, brandThemeColors, planSeedMigration, SEED_ID } from './brand-model.js';

let list = [];
// Embed mode: brands the host registered for this page only (never written to IndexedDB) and its default.
const memory = new Map();
let memoryDefault = null;
const changed = () => store.emit('brands:changed');
const sorted = (a) => a.sort((x, y) => (x.name || '').localeCompare(y.name || '', 'fa'));

export const brands = {
  all: () => list,
  get: (id) => list.find((b) => b.id === id) || null,
  current: () => brands.get(store.get('brandId')),
  defaultId: () => (memoryDefault && brands.get(memoryDefault) ? memoryDefault : brands.get(getPref('defaultBrandId')) ? getPref('defaultBrandId') : list[0]?.id || null),
  setDefault: (id) => setPref('defaultBrandId', id),

  /** Add a brand for this page only (embed host); `asDefault` makes it the default without touching preferences. */
  register(input, { asDefault = false } = {}) {
    const b = normalizeBrand(input);
    memory.set(b.id, b);
    list = sorted([...list.filter((x) => x.id !== b.id), b]);
    if (asDefault) memoryDefault = b.id;
    changed();
    return b;
  },

  async reload() {
    // Archived brands stay out of the list; a brand the host handed us lives in memory only,
    // and its in-memory copy wins over anything stored under the same id.
    const stored = (await db.all('brands')).map(normalizeBrand).filter((b) => !b.archivedAt && !memory.has(b.id));
    list = sorted([...stored, ...memory.values()]);
    changed();
  },
  async save(input) {
    const b = normalizeBrand(input);
    if (memory.has(b.id)) memory.set(b.id, b); // a host brand stays in memory (letter counter included)
    else await db.put('brands', b);
    const i = list.findIndex((x) => x.id === b.id);
    if (i >= 0) list[i] = b;
    else list.push(b);
    sorted(list);
    changed();
    return b;
  },
  /** «حذف»: the brand is archived (hidden everywhere), never destroyed. */
  async remove(id) {
    if (memory.delete(id)) {
      // A host brand was never written to disk, so forgetting it destroys nothing.
      if (memoryDefault === id) memoryDefault = null;
    } else {
      const b = brands.get(id);
      if (b) await db.put('brands', { ...b, archivedAt: Date.now() });
    }
    list = list.filter((x) => x.id !== id);
    if (getPref('defaultBrandId') === id) setPref('defaultBrandId', null);
    changed();
  },
  async restore(id) {
    const b = (await db.all('brands')).find((x) => x.id === id);
    return b ? brands.save({ ...b, archivedAt: null }) : null;
  },
  async duplicate(id) {
    const src = brands.get(id);
    return src ? brands.save(duplicateBrand(src)) : null;
  },
};

/**
 * Apply a brand to the open document. `soft` keeps a header/footer/theme the document already customised
 * (used when a brand is attached implicitly, e.g. entering letter mode). `refresh: false` only updates state.
 */
export function applyBrand(id, { soft = false, refresh = true } = {}) {
  const b = brands.get(id);
  if (!b) return false;
  const s = store.snapshot();
  const patch = {
    brandId: b.id,
    signatureImage: b.signatureImage,
    stampImage: b.stampImage,
    qr: { ...b.qr, value: b.qr.value || (b.qr.kind === 'url' ? b.website : '') },
    letter: { ...s.letter, signer: soft && s.letter.signer?.name ? s.letter.signer : { ...b.signer } },
  };
  if (!(soft && (s.masthead || s.mastheadImage))) Object.assign(patch, { masthead: b.mastheadText, mastheadImage: b.mastheadImage });
  if (!(soft && (s.footerText || s.footerImage))) Object.assign(patch, { footerText: b.footerText, footerImage: b.footerImage });
  if (!soft) {
    const c = brandThemeColors(b);
    Object.assign(patch, { theme: c ? 'brand' : b.theme, brandColors: c || { primary: '', accent: '' } });
  }
  store.patch(patch);
  store.set('dirty', true);
  if (refresh) refreshFurniture();
  store.emit('brand:applied', b);
  return true;
}

/**
 * Fold seed-brand duplicates (old random-id seeding, one per device) into the deterministic one:
 * documents, the default-brand preference and the open document are re-pointed first, then the copies go.
 */
export async function migrateSeedBrands() {
  const plan = planSeedMigration(list);
  if (!plan) return false;
  if (plan.save) await brands.save(plan.save);
  const drop = new Set(plan.drop);
  for (const d of await db.all('documents')) if (drop.has(d.brandId)) await db.put('documents', { ...d, brandId: SEED_ID });
  if (drop.has(getPref('defaultBrandId'))) await setPref('defaultBrandId', SEED_ID);
  if (drop.has(store.get('brandId'))) store.set('brandId', SEED_ID);
  for (const id of drop) await brands.remove(id);
  return true;
}

export async function initBrands() {
  await db.open();
  await brands.reload();
  if (!getPref('brandsSeeded') && !list.length) {
    const seed = await brands.save(seedBrand()); // fixed id: running this twice, or on two devices, is idempotent
    await setPref('defaultBrandId', seed.id);
  }
  await setPref('brandsSeeded', true);
  await migrateSeedBrands();
  store.on('backup:imported', () => void brands.reload().then(migrateSeedBrands));
  // A new document starts with the default brand's colours, header, footer, signature and QR (state only: the page stays empty).
  store.on('doc:new', () => {
    const id = brands.defaultId();
    if (id) applyBrand(id, { refresh: false });
  });
}
