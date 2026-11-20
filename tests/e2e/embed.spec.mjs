// Embed mode: a host page defines window.DOCLOOM_EMBED before the app's <script> and drives window.DocLoom.embed.
import { test, expect } from '@playwright/test';
import { APP, openPanelGroup } from './helpers.mjs';

const CONFIG = { host: 'claria', digits: 'en', upload: false, library: false, server: false, brand: null };

const MD = `# گزارش فروش ۱۴۰۵

متن **پررنگ** با رقم ۱۲۳ و 456.

| ماه | فروش |
|---|---:|
| فروردین | ۱۲۰ |
| اردیبهشت | ۱۴۵ |
`;

/** Open the app as the Claria home would: config first, a ready listener, every request recorded. */
async function openEmbedded(page, config = CONFIG) {
  const requests = [];
  const errors = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript((cfg) => {
    window.DOCLOOM_EMBED = cfg;
    window.__ready = 0;
    window.addEventListener('docloom:ready', () => window.__ready++);
  }, config);
  await page.goto(APP);
  await page.waitForFunction(() => window.__ready === 1 && window.DocLoom?.embed?.ready === true);
  return { requests, errors };
}

test('without DOCLOOM_EMBED there is no embed API and no ready event', async ({ page }) => {
  await page.addInitScript(() => window.addEventListener('docloom:ready', () => (window.__ready = true)));
  await page.goto(APP);
  await expect(page.locator('#preview')).toBeVisible();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => ({ api: typeof window.DocLoom, ready: !!window.__ready, slot: !!document.getElementById('md2EmbedSlot') }))).toEqual({ api: 'undefined', ready: false, slot: false });
  await openPanelGroup(page, 'content', 'files');
  await expect(page.locator('#libraryBtn')).toBeVisible();
});

test('the API exists, fires ready once and exposes a slot at the start of the top bar', async ({ page }) => {
  const { errors } = await openEmbedded(page);
  const shape = await page.evaluate(() => {
    const e = window.DocLoom.embed;
    return {
      fns: ['load', 'getMarkdown', 'getHTML', 'getDoc', 'isDirty', 'markClean', 'on', 'print', 'applyBrand'].filter((k) => typeof e[k] !== 'function'),
      slotFirst: document.querySelector('.top-actions').firstElementChild === e.slot,
      host: e.config.host,
    };
  });
  expect(shape).toEqual({ fns: [], slotFirst: true, host: 'claria' });
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.id = 'hostBtn';
    b.textContent = 'ذخیره در کلاریا';
    window.DocLoom.embed.slot.append(b);
  });
  await expect(page.locator('.top-actions > #md2EmbedSlot > #hostBtn')).toBeVisible();
  expect(errors).toEqual([]);
});

test('load → getMarkdown round-trips and leaves the document clean', async ({ page }) => {
  await openEmbedded(page);
  await page.evaluate((md) => window.DocLoom.embed.load({ markdown: md, title: 'عنوان', subtitle: 'زیرعنوان' }), MD);
  await expect(page.locator('#preview > h1')).toHaveText('گزارش فروش ۱۴۰۵');
  await expect(page.locator('#title')).toHaveValue('عنوان');
  await expect(page.locator('#source')).toHaveValue(MD);
  expect(await page.evaluate(() => window.DocLoom.embed.getMarkdown())).toBe(MD);
  await page.waitForTimeout(300); // nothing asynchronous may mark it dirty after the load
  expect(await page.evaluate(() => window.DocLoom.embed.isDirty())).toBe(false);
  // The document's own Persian digits stay as written, even in digits:'en' mode.
  await expect(page.locator('#preview')).toContainText('رقم ۱۲۳');

  await page.evaluate(() => {
    window.__dirty = 0;
    window.DocLoom.embed.on('dirty', () => window.__dirty++);
  });
  await page.locator('#source').fill(MD + '\nپاراگراف تازه.\n');
  await page.dispatchEvent('#source', 'input');
  await page.locator('#source').fill(MD + '\nپاراگراف تازه‌تر.\n');
  await page.dispatchEvent('#source', 'input');
  expect(await page.evaluate(() => [window.DocLoom.embed.isDirty(), window.__dirty])).toEqual([true, 1]);
  await page.evaluate(() => window.DocLoom.embed.markClean());
  expect(await page.evaluate(() => window.DocLoom.embed.isDirty())).toBe(false);
});

test('getDoc + getHTML restore the same studio state through load({doc, html})', async ({ page }) => {
  await openEmbedded(page);
  await page.evaluate((md) => window.DocLoom.embed.load({ markdown: md, title: 'نامه' }), MD);
  await page.locator('.theme[data-theme="green"]').click();
  await page.locator('#preview p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ویرایش مستقیم');
  const saved = await page.evaluate(() => ({ doc: window.DocLoom.embed.getDoc(), html: window.DocLoom.embed.getHTML() }));
  expect(saved.doc.title).toBe('نامه');
  expect(saved.doc.layout.theme).toBe('green');
  expect(saved.html).toContain('ویرایش مستقیم');
  expect(saved.html).not.toContain('contenteditable');
  expect(JSON.parse(JSON.stringify(saved.doc))).toEqual(saved.doc);

  await page.evaluate(() => window.DocLoom.embed.load({ markdown: '# سند دیگر\n', title: 'دیگر' }));
  await expect(page.locator('#preview > h1')).toHaveText('سند دیگر');

  await page.evaluate((s) => window.DocLoom.embed.load(s), saved);
  const back = await page.evaluate(() => ({ doc: window.DocLoom.embed.getDoc(), html: window.DocLoom.embed.getHTML(), dirty: window.DocLoom.embed.isDirty() }));
  expect(back.doc).toEqual(saved.doc);
  expect(back.html).toBe(saved.html);
  expect(back.dirty).toBe(false);
  await expect(page.locator('#title')).toHaveValue('نامه');
  // Edited directly in the preview: getMarkdown converts the preview instead of returning the stale source.
  expect(await page.evaluate(() => window.DocLoom.embed.getMarkdown())).toContain('ویرایش مستقیم');
});

test('Ctrl+S fires save and does not run the library save', async ({ page }) => {
  await openEmbedded(page);
  await page.evaluate((md) => {
    window.DocLoom.embed.load({ markdown: md });
    window.__saves = 0;
    window.DocLoom.embed.on('save', () => window.__saves++);
  }, MD);
  await page.locator('#source').focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  await page.locator('#preview p').first().click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  expect(await page.evaluate(() => window.__saves)).toBe(2);
  await page.waitForTimeout(300);
  await expect(page.locator('.toast, [role="status"]').filter({ hasText: 'نسخه' })).toHaveCount(0);
});

test('no request to /api/* or to another host', async ({ page, baseURL }) => {
  const { requests, errors } = await openEmbedded(page);
  await page.evaluate((md) => window.DocLoom.embed.load({ markdown: md }), MD);
  await page.waitForTimeout(800);
  const bad = requests.filter((u) => !u.startsWith(baseURL) || new URL(u).pathname.startsWith('/api/'));
  expect(bad).toEqual([]);
  expect(errors).toEqual([]);
});

test("digits:'en' leaves no Persian digit in the chrome", async ({ page }) => {
  await openEmbedded(page);
  await page.evaluate((md) => window.DocLoom.embed.load({ markdown: md }), MD);
  await openPanelGroup(page, 'content', 'out');
  await page.locator('#exportMenuBtn').click();
  await expect(page.locator('#exportMenu')).toBeVisible();
  const leaks = await page.evaluate(() => {
    const SKIP = '#preview, #source, #sourcePane, textarea, script, style, [contenteditable]';
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.nodeType === 3 ? n.parentElement : n;
      if (!el || el.closest(SKIP)) continue;
      if (n.nodeType === 3 && /[۰-۹٠-٩]/.test(n.nodeValue)) out.push(n.nodeValue.trim().slice(0, 60));
      if (n.nodeType === 1) for (const a of ['title', 'placeholder', 'aria-label']) if (/[۰-۹٠-٩]/.test(n.getAttribute(a) || '')) out.push(a + ': ' + n.getAttribute(a));
    }
    return out;
  });
  expect(leaks).toEqual([]);
  await expect(page.locator('#zoom')).toHaveText('100%');
  // Chrome created after start-up is converted too: the cleanup dialog counts changes with digits.
  await page.keyboard.press('Escape');
  await openPanelGroup(page, 'content', 'input'); // the cleanup button lives with the input tools
  await page.locator('#cleanupBtn').click();
  await expect(page.locator('.cl-count').first()).toHaveText(/^[0-9]+$/);
  // The Latin → Persian digit rule starts switched off.
  await expect(page.locator('#cl-digits')).not.toBeChecked();
});

test('library, upload and server UI are hidden', async ({ page }) => {
  await openEmbedded(page);
  for (const sel of ['#libraryBtn', '#filesBtn', '#serverBtn', '#autosave']) await expect(page.locator(sel)).toBeHidden();
  await expect(page.locator('#uploadImage')).toBeHidden();
  await openPanelGroup(page, 'content', 'out');
  await page.locator('#exportMenuBtn').click();
  await expect(page.locator('#exportMenu [data-export="html"]')).toBeVisible();
  for (const sel of ['[data-export="pdf-direct"]', '#pdfNumbers', '[data-export="batch"]', '[data-export="share"]', '#destGroup']) await expect(page.locator('#exportMenu ' + sel)).toBeHidden();
  await expect(page.locator('#exportMenu [data-export="pdf"]')).toBeVisible();
  await page.keyboard.press('Escape');
  // ⌘K no longer offers the library.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.locator('.palette-input').fill('کتابخانه');
  await expect(page.locator('.pal-item', { hasText: 'باز کردن کتابخانه' })).toHaveCount(0);
});

test('applyBrand registers a brand in memory and puts it on the document', async ({ page }) => {
  await openEmbedded(page);
  await page.evaluate((md) => window.DocLoom.embed.load({ markdown: md }), MD);
  await page.evaluate(() => window.DocLoom.embed.applyBrand({ id: 'brand_host', name: 'میزبان', mastheadText: 'سربرگ میزبان', footerText: 'پاورقی میزبان' }));
  await expect(page.locator('#preview [data-md2-furniture="header"]')).toContainText('سربرگ میزبان');
  expect(await page.evaluate(() => window.DocLoom.embed.getDoc().brandId)).toBe('brand_host');
  // The next fresh load starts from that brand too.
  await page.evaluate(() => window.DocLoom.embed.load({ markdown: '# تازه\n' }));
  await expect(page.locator('#preview [data-md2-furniture="footer"]')).toContainText('پاورقی میزبان');
});

test('a host page written before the rename still works, unchanged', async ({ page }) => {
  // Host pages are out there and we do not control them: they set window.MD2HTML_EMBED, read
  // window.MD2Html.embed and listen for 'md2html:ready'. All three must still do exactly what they did.
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((cfg) => {
    window.MD2HTML_EMBED = cfg; // the old global, and nothing else
    window.__legacyReady = 0;
    window.addEventListener('md2html:ready', () => window.__legacyReady++);
  }, { host: 'legacy-host', digits: 'en', library: false });

  await page.goto(APP);
  await page.waitForFunction(() => window.__legacyReady === 1 && window.MD2Html?.embed?.ready === true);

  // The old global is the same object as the new one, not a stale copy.
  expect(await page.evaluate(() => window.MD2Html === window.DocLoom)).toBe(true);
  expect(await page.evaluate(() => window.MD2Html.embed.config.host)).toBe('legacy-host');
  expect(await page.evaluate(() => window.MD2Html.embed.config.library)).toBe(false);

  // And the API it was written against still drives the document.
  await page.evaluate(() => window.MD2Html.embed.load({ markdown: '# از میزبان قدیمی\n\nمتن.\n' }));
  await expect(page.locator('#preview h1').first()).toHaveText('از میزبان قدیمی');
  expect(await page.evaluate(() => window.MD2Html.embed.getMarkdown())).toContain('از میزبان قدیمی');
  expect(errors, 'no errors on a legacy host').toEqual([]);
});
