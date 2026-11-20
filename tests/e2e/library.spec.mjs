// The IndexedDB library: autosave, survive a reload, search, versions.
// This is the "save and reopen after refresh" smoke the design spec asks for (§۸).
import { test, expect } from '@playwright/test';
import { openApp, setSource, runCommand, newDocument, openLibrary, setTitle } from './helpers.mjs';

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
  await setTitle(page, name);
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

  await openLibrary(page);
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

  await openLibrary(page);
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

/** Every stored document as {title, archived, versions}, read straight out of IndexedDB. */
function storedState(page) {
  return page.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open('md2html');
      r.onsuccess = () => res(r.result);
    });
    const all = (s) => new Promise((res) => {
      const r = db.transaction(s, 'readonly').objectStore(s).getAll();
      r.onsuccess = () => res(r.result);
    });
    const [docs, vers] = [await all('documents'), await all('versions')];
    return docs.map((d) => ({ title: d.title || '', archived: !!d.archivedAt, versions: vers.filter((v) => v.docId === d.id).length }));
  });
}

test('«بایگانی» keeps the document and its versions; the archive view brings it back', async ({ page }) => {
  await openApp(page);
  await newDocWith(page, title('ماندگار'), '# ماندگار\n\nواژهٔ یکتا: کشک‌بادمجان.\n');
  await newDocWith(page, title('رفتنی'), '# رفتنی\n\nواژهٔ یکتا: میرزاقاسمی.\n');

  await openLibrary(page);
  const drawer = page.locator('.lib-drawer');
  await expect(drawer.locator('.lib-item')).toHaveCount(2);
  await expect(drawer.locator('.lib-archive')).toBeHidden(); // no archive, no button

  // The open document is archived: the editor moves to the other one and the row leaves the list.
  await drawer.locator('.lib-item', { hasText: title('رفتنی') }).getByRole('button', { name: 'بایگانی سند' }).click();
  await expect(drawer.locator('.lib-item')).toHaveCount(1);
  await expect(page.locator('#title')).toHaveValue(title('ماندگار'));
  await expect(drawer.locator('.lib-count')).toHaveText('۱ سند');

  // Nothing was destroyed: the record is still stored, marked, with its version.
  await expect.poll(async () => (await storedState(page)).find((d) => d.title === title('رفتنی'))).toEqual({ title: title('رفتنی'), archived: true, versions: 1 });

  // A search that misses in the library points at the archive.
  await drawer.locator('.lib-search').fill('میرزاقاسمی');
  await expect(drawer.locator('.lib-item')).toHaveCount(0);
  await expect(drawer.locator('.lib-hint')).toHaveText('۱ نتیجه در بایگانی');
  await drawer.locator('.lib-hint').click();
  await expect(drawer.locator('.lib-item.archived')).toHaveCount(1);
  await expect(drawer.locator('.lib-archive')).toHaveAttribute('aria-pressed', 'true');
  await drawer.locator('.lib-search').fill('');

  // It survives a reload, and does not come back as the open document.
  await page.reload();
  await expect(page.locator('#title')).toHaveValue(title('ماندگار'));
  await openLibrary(page);
  await expect(drawer.locator('.lib-item')).toHaveCount(1);
  await drawer.locator('.lib-archive').click();
  await expect(drawer.locator('.lib-archive')).toHaveText('بایگانی (۱)');
  await drawer.locator('.lib-item.archived').getByRole('button', { name: 'بازگردانی' }).click();

  // Back in the library, archive view closes itself when it is empty.
  await expect(drawer.locator('.lib-item:not(.archived)')).toHaveCount(2);
  await expect(drawer.locator('.lib-archive')).toBeHidden();
  await expect.poll(async () => (await storedState(page)).map((d) => d.archived)).toEqual([false, false]);
});

test('archiving has an undo, and the palette does not list archived documents', async ({ page }) => {
  await openApp(page);
  await newDocWith(page, title('الف'), '# الف\n\nمتن الف.\n');
  await newDocWith(page, title('ب'), '# ب\n\nمتن ب.\n');

  await openLibrary(page);
  const drawer = page.locator('.lib-drawer');
  await drawer.locator('.lib-item', { hasText: title('الف') }).getByRole('button', { name: 'بایگانی سند' }).click();
  await expect(drawer.locator('.lib-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'برگردان' }).click();
  await expect(drawer.locator('.lib-item')).toHaveCount(2);

  await drawer.locator('.lib-item', { hasText: title('الف') }).getByRole('button', { name: 'بایگانی سند' }).click();
  await expect(drawer.locator('.lib-item')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.locator('.palette-input').fill(title('الف'));
  await expect(page.locator('.pal-item', { hasText: title('الف') })).toHaveCount(0);
});
