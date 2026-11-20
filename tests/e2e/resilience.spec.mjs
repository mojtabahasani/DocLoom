// The app in a browser that refuses to store anything — a private window, or site data blocked.
// It has to keep working, say so, and never imply the document is safe.
import { test, expect } from '@playwright/test';
import { openApp, runCommand, openLibrary } from './helpers.mjs';

/** indexedDB gone and even touching localStorage throws, the way a locked-down context behaves. */
const blockStorage = (page) =>
  page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { get: () => undefined });
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
  });

test('with no storage at all the editor still works, and says the library is temporary', async ({ page }) => {
  await blockStorage(page);
  const { errors } = await openApp(page);

  await page.fill('#source', '# سلام\n\nمتن آزمایشی.\n');
  await expect(page.locator('#preview h1')).toHaveText('سلام');
  expect(errors, 'a blocked browser must not throw').toEqual([]);

  // The warning arrives on its own at startup, not only when the library is opened.
  await expect(page.locator('#status .status-text')).toContainText('ذخیره‌سازی مرورگر در دسترس نیست');
});

test('the library drawer repeats the warning and the document stays unsaved', async ({ page }) => {
  await blockStorage(page);
  await openApp(page);
  await page.fill('#source', '# مهم\n\nاین نباید ذخیره‌شده به نظر برسد.\n');
  await page.waitForTimeout(2000); // well past the 1.5s autosave

  await openLibrary(page);
  await expect(page.locator('.lib-drawer .lib-notice')).toBeVisible();
  await expect(page.locator('.lib-drawer .lib-notice')).toContainText('پشتیبان');
  await page.keyboard.press('Escape');

  // `dirty` is still set, which is what keeps the "leave page?" guard armed.
  await expect(page.locator('#preview')).toContainText('این نباید ذخیره‌شده به نظر برسد');
});

test('«دربارهٔ برنامه» reports the real storage state when there is none', async ({ page }) => {
  await blockStorage(page);
  await openApp(page);
  await runCommand(page, 'دربارهٔ برنامه');

  const modal = page.locator('.modal');
  await expect(modal).toBeVisible();
  // localStorage throws here too, so it is the harsher of the two messages.
  await expect(modal.locator('.form-error')).toContainText('هیچ ذخیره‌سازی‌ای در دسترس نیست');
  await expect(modal.locator('.form-error')).toContainText('پشتیبان');
  await expect(modal).toContainText('وزیرمتن');
  await expect(modal).toContainText('OFL');
});

test('«دربارهٔ برنامه» on a healthy browser shows the build and the storage that works', async ({ page }) => {
  await openApp(page);
  await runCommand(page, 'دربارهٔ برنامه');

  const modal = page.locator('.modal');
  await expect(modal).toContainText('IndexedDB');
  await expect(modal.locator('.form-error')).toHaveCount(0);
  // The built file carries a real version, not the source-tree placeholder.
  await expect(modal).not.toContainText('نسخهٔ توسعه');
  await expect(modal).toContainText('تاریخ ساخت');
  // The build fingerprint: the only way to tell an open tab or a cached service worker
  // from a freshly built file, since the version stays the same all day.
  await expect(modal).toContainText('شناسهٔ ساخت');
  const id = await modal.locator('code').first().innerText();
  expect(id).toMatch(/^[0-9a-f]{8}$/);
});
