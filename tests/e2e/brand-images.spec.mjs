// A document references its brand's images instead of copying them (library/doc-model.js).
// The risk this guards is specific: the four base64 images are ~5 MB together, and copying them
// into every document and every version grew one library to 215 MB — but get the resolution wrong
// and the letterhead silently vanishes from the document, the preview and every exported PDF.
import { test, expect } from '@playwright/test';
import { openApp, setSource, runCommand, openPanelGroup } from './helpers.mjs';

// Two different 1×1 PNGs, both valid for normalizeBrand's data-URI check. They must differ: an
// image identical to the brand's is exactly the one that gets referenced instead of stored.
const RED = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
const BLUE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==';
const BLUE_BYTES = Buffer.from(BLUE.split(',')[1], 'base64');

const brand = (id, name) => ({
  id, name, theme: 'navy', mastheadText: 'سربرگ آزمون', mastheadImage: RED,
  footerText: '', footerImage: '', signatureImage: '', stampImage: '',
  colors: { primary: '', accent: '' }, signer: { name: '', role: '' },
  letterPrefix: '', letterCounter: 1, website: '',
  qr: { enabled: false, kind: 'url', value: '', position: 'footer', size: 84 },
});

/** Put a brand straight into IndexedDB, the way a synced or restored brand arrives. */
async function seedBrand(page, b) {
  await page.evaluate(async (rec) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('md2html');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise((res, rej) => {
      const tx = db.transaction('brands', 'readwrite');
      tx.objectStore('brands').put(rec);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  }, b);
}

/** A stored document, as the library wrote it. */
function storedDoc(page, title) {
  return page.evaluate(async (t) => {
    const db = await new Promise((res) => {
      const r = indexedDB.open('md2html');
      r.onsuccess = () => res(r.result);
    });
    const all = await new Promise((res) => {
      const r = db.transaction('documents', 'readonly').objectStore('documents').getAll();
      r.onsuccess = () => res(r.result);
    });
    db.close();
    return all.find((d) => d.title === t) || null;
  }, title);
}

async function pickBrand(page, name) {
  await openPanelGroup(page, 'content', 'input');
  await page.locator('#brandBtn').click();
  await page.locator('#brandMenu button', { hasText: name }).first().click();
}

const masthead = (page) => page.locator('#preview [data-md2-furniture="header"] img');

test('a document references the brand letterhead and still shows it after a reload', async ({ page }) => {
  await openApp(page);
  await seedBrand(page, brand('bTest', 'برند آزمون'));
  await openApp(page); // reload so brands.reload() picks the seeded record up

  await setSource(page, '# گزارش برند\n\nمتن.\n');
  await openPanelGroup(page, 'content', 'input');
  await page.fill('#title', 'گزارش برند');
  await pickBrand(page, 'برند آزمون');

  // The letterhead is on the page.
  await expect(masthead(page)).toHaveAttribute('src', RED);

  await runCommand(page, 'ذخیرهٔ نسخه');

  // ... but the document's layout does not carry a copy of it.
  await expect.poll(async () => (await storedDoc(page, 'گزارش برند'))?.layout?.brandImages).toEqual(['mastheadImage']);
  const rec = await storedDoc(page, 'گزارش برند');
  expect(rec.layout.mastheadImage, 'the image must not be copied into the layout').toBeUndefined();
  // The rendered furniture inside `html` is a separate copy that exports read directly; it is
  // deliberately left alone here, so assert on the layout, which is what this change owns.
  expect(JSON.stringify(rec.layout), 'the layout holds no base64 at all').not.toContain('data:image');

  // Reopening resolves it from the brand: what you saved is what you get back.
  await openApp(page);
  await expect(masthead(page)).toHaveAttribute('src', RED);
});

test('a letterhead chosen for one document is kept, not replaced by the brand', async ({ page }) => {
  await openApp(page);
  await seedBrand(page, brand('bTest2', 'برند دوم'));
  await openApp(page);

  await setSource(page, '# سند جدا\n\nمتن.\n');
  await openPanelGroup(page, 'content', 'input');
  await page.fill('#title', 'سند جدا');
  await pickBrand(page, 'برند دوم');
  await expect(masthead(page)).toHaveAttribute('src', RED);

  // This document gets a different letterhead through the real picker («سند اداری ← سربرگ و پاورقی»).
  await openPanelGroup(page, 'design', 'letter');
  await openPanelGroup(page, 'office', 'mast');
  await page.locator('#mastheadImage').click();
  await page.setInputFiles('#imageFile', { name: 'own.png', mimeType: 'image/png', buffer: BLUE_BYTES });
  await expect(masthead(page)).toHaveAttribute('src', BLUE);
  await runCommand(page, 'ذخیرهٔ نسخه');

  const rec = await storedDoc(page, 'سند جدا');
  expect(rec.layout.mastheadImage, 'an image picked for this document belongs to it').toBe(BLUE);
  expect(rec.layout.brandImages ?? [], 'and it is not listed as inherited').not.toContain('mastheadImage');

  // The brand's own letterhead must not win it back on reopen.
  await openApp(page);
  await expect(masthead(page)).toHaveAttribute('src', BLUE);
});
