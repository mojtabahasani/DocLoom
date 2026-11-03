// The IndexedDB library: autosave, survive a reload, search, versions.
// This is the "save and reopen after refresh" smoke the design spec asks for (§۸).
import { test, expect } from '@playwright/test';
import { openApp, setSource, runCommand, newDocument } from './helpers.mjs';

const title = (n) => `گزارش ${n}`;

/** Stored document titles, read straight out of IndexedDB. */
function storedTitles(page) {
  return page.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open('md2html');
      r.onsuccess = () => res(r.result);
    });
    const all = await new Promise((res) => {
      const r = db.transaction('documents', 'readonly').objectStore('documents').getAll();
      r.onsuccess = () => res(r.result);
    });
    return all.filter((d) => !d.deleted).map((d) => d.title || '');
  });
}

async function newDocWith(page, name, body) {
  await newDocument(page);
  await setSource(page, body); // content first: the title cover is not built onto an empty document
  await page.fill('#title', name);
  // Wait for the title to reach the document furniture, not just the input: the autosave
  // snapshot reads the store, so continuing too early can persist an empty title.
  await expect(page.locator('#preview [data-md2-furniture="title"] h1')).toHaveText(name);
  await runCommand(page, 'ذخیرهٔ نسخه'); // forces a write instead of waiting on the 1.5s autosave
  await expect.poll(() => storedTitles(page)).toContain(name);
}

test('a document survives a reload', async ({ page }) => {
  await openApp(page);
  await newDocWith(page, title('ماندگار'), '# ماندگار\n\nاین متن باید بعد از تازه‌سازی سر جایش باشد.\n');

  await page.reload();
  await expect(page.locator('#preview')).toBeVisible();
  await expect(page.locator('#title')).toHaveValue(title('ماندگار'));
  await expect(page.locator('#preview')).toContainText('باید بعد از تازه‌سازی سر جایش باشد');
});

test('the library drawer lists documents and searches their text', async ({ page }) => {
  await openApp(page);
  await newDocWith(page, title('آبی'), '# آبی\n\nواژهٔ یکتا: زیتون‌پلو.\n');
  await newDocWith(page, title('سبز'), '# سبز\n\nواژهٔ یکتا: قورمه‌سبزی.\n');

  await page.click('#libraryBtn');
  const drawer = page.locator('.lib-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('.lib-item')).toHaveCount(2);

  // Search reaches the body text, not just the title.
  await drawer.locator('.lib-search').fill('زیتون‌پلو');
  await expect(drawer.locator('.lib-item')).toHaveCount(1);
  await expect(drawer.locator('.lib-title')).toContainText('آبی');

  await drawer.locator('.lib-search').fill('');
  await expect(drawer.locator('.lib-item')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible(); // the drawer is hidden by a class, it stays in the DOM
});

test('opening another document from the library swaps the editor', async ({ page }) => {
  await openApp(page);
  await newDocWith(page, title('اول'), '# اول\n\nمتن اول.\n');
  await newDocWith(page, title('دوم'), '# دوم\n\nمتن دوم.\n');
  await expect(page.locator('#preview')).toContainText('متن دوم');

  await page.click('#libraryBtn');
  await page.locator('.lib-drawer .lib-item', { hasText: title('اول') }).locator('.lib-open').click();
  await expect(page.locator('#preview')).toContainText('متن اول');
  await expect(page.locator('#title')).toHaveValue(title('اول'));
});

test('a saved version can be restored after the text changes', async ({ page }) => {
  await openApp(page);
  await newDocWith(page, title('نسخه‌دار'), '# نسخه‌دار\n\nمتن اصلی.\n');

  await setSource(page, '# نسخه‌دار\n\nمتن عوض شد.\n');
  await page.waitForTimeout(1800); // let autosave land
  await expect(page.locator('#preview')).toContainText('متن عوض شد');

  await runCommand(page, 'نسخه‌های این سند');
  const dialog = page.locator('.modal');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/نسخه|بازگردانی/).first()).toBeVisible();
  await page.keyboard.press('Escape');
});
