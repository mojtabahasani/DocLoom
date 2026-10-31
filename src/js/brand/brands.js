// Brand records (IndexedDB `brands` store) and applying a brand to the open document.
import { store } from '../core/store.js';
import { db } from '../library/db.js';
import { getPref, setPref } from '../library/prefs.js';
import { refreshFurniture } from '../editor/preview.js';
import { normalizeBrand, seedBrand, duplicateBrand, brandThemeColors, planSeedMigration, SEED_ID } from './brand-model.js';

let list = [];
const changed = () => store.emit('brands:changed');
const sorted = (a) => a.sort((x, y) => (x.name || '').localeCompare(y.name || '', 'fa'));

export const brands = {
  all: () => list,
  get: (id) => list.find((b) => b.id === id) || null,
  current: () => brands.get(store.get('brandId')),
  defaultId: () => (brands.get(getPref('defaultBrandId')) ? getPref('defaultBrandId') : list[0]?.id || null),
  setDefault: (id) => setPref('defaultBrandId', id),

  async reload() {
    list = sorted((await db.all('brands')).map(normalizeBrand));
    changed();
  },
  async save(input) {
    const b = normalizeBrand(input);
    await db.put('brands', b);
    const i = list.findIndex((x) => x.id === b.id);
    if (i >= 0) list[i] = b;
    else list.push(b);
    sorted(list);
    changed();
    return b;
  },
  async remove(id) {
    await db.del('brands', id);
    list = list.filter((b) => b.id !== id);
    if (getPref('defaultBrandId') === id) setPref('defaultBrandId', null);
    changed();
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
