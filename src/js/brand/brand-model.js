// Brand record: defaults, validation, helpers (pure).
import { normalizeQr } from './qr.js';
import { DOC_THEMES } from '../export/theme.js';

export const BRAND_THEMES = DOC_THEMES.map((t) => [t.id, t.label]);
export const IMAGE_FIELDS = ['mastheadImage', 'footerImage', 'signatureImage', 'stampImage'];
export const SEED_NAME = 'مجتمع کامپیوتر یک دو سه';
const DATA_IMG = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]*$/;
const MAX_IMAGE_CHARS = 12 * 1024 * 1024;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const newBrandId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const image = (v) => (typeof v === 'string' && v.length <= MAX_IMAGE_CHARS && DATA_IMG.test(v) ? v : '');
const color = (v) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : '');

/** Clean any input into a complete, valid Brand (unknown fields dropped, bad values reset). */
export function normalizeBrand(b = {}) {
  const o = b && typeof b === 'object' ? b : {};
  const counter = Math.floor(Number(o.letterCounter));
  return {
    id: str(o.id, 80) || newBrandId(),
    name: str(o.name, 120),
    theme: BRAND_THEMES.some((t) => t[0] === o.theme) ? o.theme : 'navy',
    colors: { primary: color(o.colors?.primary), accent: color(o.colors?.accent) },
    mastheadText: str(o.mastheadText, 200),
    mastheadImage: image(o.mastheadImage),
    footerText: str(o.footerText, 300),
    footerImage: image(o.footerImage),
    signatureImage: image(o.signatureImage),
    stampImage: image(o.stampImage),
    signer: { name: str(o.signer?.name, 120), role: str(o.signer?.role, 160) },
    letterPrefix: str(o.letterPrefix, 20),
    letterCounter: Number.isFinite(counter) ? Math.max(1, Math.min(999999, counter)) : 1,
    website: str(o.website, 200),
    qr: normalizeQr(o.qr),
    ...(Number(o.archivedAt) > 0 ? { archivedAt: Number(o.archivedAt) } : {}),
  };
}

/** Persian error message, or null when the brand can be saved. */
export function validateBrand(b) {
  if (!b || !str(b.name, 120)) return 'نام برند را وارد کنید.';
  if (b.website && !/^(https?:\/\/)?[^\s/$.?#][^\s]*\.[^\s]{2,}$/i.test(b.website.trim())) return 'نشانی وب‌سایت معتبر نیست.';
  for (const k of ['primary', 'accent']) {
    const v = b.colors?.[k];
    if (v && !HEX.test(v)) return 'رنگ باید به شکل #RRGGBB باشد.';
  }
  return null;
}

/** Deterministic id of the built-in brand: the same on every device, so seeding twice (or on two devices) never duplicates it. */
export const SEED_ID = 'brand_computer123';

export function seedBrand() {
  return normalizeBrand({
    id: SEED_ID, name: SEED_NAME, theme: 'navy', mastheadText: SEED_NAME, footerText: 'DocLoom Studio · example.com',
    website: 'https://www.example.com', letterPrefix: '۱۲۳', letterCounter: 1,
    qr: { enabled: false, kind: 'url', value: 'https://www.example.com', position: 'footer' },
  });
}

export function duplicateBrand(b, id = newBrandId()) {
  return { ...normalizeBrand({ ...b, archivedAt: null }), id, name: (b.name || 'برند') + ' (کپی)', letterCounter: 1 };
}

/** A light tint of a hex colour (used for card backgrounds when a brand gives only a primary colour). */
export function tintOf(hex, amount = 0.9) {
  const h = color(hex);
  if (!h) return '#edf3f2';
  const full = h.length === 4 ? '#' + [...h.slice(1)].map((c) => c + c).join('') : h;
  const ch = [1, 3, 5].map((i) => Math.round(parseInt(full.slice(i, i + 2), 16) * (1 - amount) + 255 * amount));
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
}

/** Document theme colours for a brand with custom colours, else null (the named theme applies). */
export function brandThemeColors(b) {
  const p = color(b?.colors?.primary);
  return p ? { primary: p, accent: color(b.colors.accent) || tintOf(p) } : null;
}

const seedShape = (b) => {
  const { id, letterCounter, ...rest } = normalizeBrand(b);
  return JSON.stringify(rest);
};

/**
 * Duplicates of the seed brand made by the old random-id seeding: same name and still exactly the seed content
 * (a customised copy - image, signer, other texts - is never touched; only the letter counter may differ).
 */
export function planSeedMigration(list) {
  const pristine = seedShape(seedBrand());
  const dupes = list.filter((b) => b.id !== SEED_ID && b.name === SEED_NAME && seedShape(b) === pristine);
  if (!dupes.length) return null;
  const canonical = list.find((b) => b.id === SEED_ID) || seedBrand();
  const counter = Math.max(canonical.letterCounter, ...dupes.map((b) => b.letterCounter));
  return { save: !list.some((b) => b.id === SEED_ID) || counter !== canonical.letterCounter ? { ...canonical, letterCounter: counter } : null, drop: dupes.map((b) => b.id) };
}
