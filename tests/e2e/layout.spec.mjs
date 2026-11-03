// Mobile layout. Runs under the `mobile` project (Pixel 5) as well as `desktop`, so the same
// assertions describe both ends of the responsive range.
import { test, expect } from '@playwright/test';
import { openApp, setSource } from './helpers.mjs';

const DOC = `# گزارش موبایل

یک پاراگراف.

| ستون | عدد |
|---|---:|
| الف | ۱۲۰ |

\`\`\`js
const wide = 'یک خط کد خیلی خیلی طولانی که باید داخل کادر خودش اسکرول شود نه کل صفحه';
\`\`\`
`;

test('nothing makes the page scroll sideways', async ({ page }) => {
  await openApp(page);
  await setSource(page, DOC);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page body must never scroll horizontally').toBeLessThanOrEqual(1);
});

test('wide blocks scroll inside their own box, not the page', async ({ page }) => {
  await openApp(page);
  await setSource(page, DOC);
  const fits = await page.evaluate(() => {
    const out = [];
    for (const n of document.querySelectorAll('#preview table, #preview pre')) {
      const box = n.closest('[style*="overflow"], .code, pre, table').getBoundingClientRect();
      out.push({ tag: n.tagName, within: box.width <= document.documentElement.clientWidth + 1 });
    }
    return out;
  });
  for (const f of fits) expect(f.within, `${f.tag} must stay inside the viewport`).toBe(true);
});

test('the layout stacks and the desktop-only buttons are hidden on a phone', async ({ page }, testInfo) => {
  await openApp(page);
  await setSource(page, DOC);
  const width = page.viewportSize().width;

  const stacked = await page.locator('.layout').evaluate((n) => getComputedStyle(n).flexDirection === 'column');
  const hidden = await page.locator('#selectAll').isVisible().catch(() => false);

  if (width <= 720) {
    expect(stacked, 'columns stack below 720px').toBe(true);
    expect(hidden, '«انتخاب همه» is hidden on a phone').toBe(false);
    await expect(page.locator('#preview')).toContainText('گزارش موبایل');
  } else {
    expect(stacked, 'the desktop layout is a grid, not a column').toBe(false);
    expect(hidden, '«انتخاب همه» is available on desktop').toBe(true);
  }
  testInfo.annotations.push({ type: 'viewport', description: `${width}px` });
});
