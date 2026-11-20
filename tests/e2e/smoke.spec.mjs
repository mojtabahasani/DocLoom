import { test, expect } from '@playwright/test';
import { openApp, setSource, runCommand, offTargetRequests } from './helpers.mjs';

const SAMPLE = `# گزارش آزمایشی

متن **پررنگ** و __دومی__ و *مورب* و ~~خط‌خورده~~ و [لینک](https://computer123.ir) و \`کد\`.

> [!مهم] کادر تأکید.

- [ ] کار مانده
- [x] کار انجام‌شده

| ماه | فروش (میلیون تومان) |
|---|---:|
| فروردین | ۱۲۰ |
| اردیبهشت | ۱۴۵ |

\`\`\`js
const x = 1;
\`\`\`
`;

test('the app boots clean and makes no network request but the health probe', async ({ page, baseURL }) => {
  const { errors, requests } = await openApp(page);
  await setSource(page, SAMPLE);
  expect(errors, 'console must be clean').toEqual([]);
  expect(offTargetRequests(requests, baseURL), 'the offline app must not reach the network').toEqual([]);
});

test('the DocLoom Markdown dialect renders', async ({ page }) => {
  await openApp(page);
  await setSource(page, SAMPLE);
  const p = page.locator('#preview');

  await expect(p.locator('h1')).toHaveText('گزارش آزمایشی');
  // Both bold delimiters: the inline regex uses a named backreference, so ** and __ must both close.
  await expect(p.locator('strong')).toHaveCount(2);
  await expect(p.locator('em')).toHaveCount(1);
  await expect(p.locator('del')).toHaveCount(1);
  // safeURL() normalises through new URL(), so the origin gets its trailing slash.
  await expect(p.locator('a')).toHaveAttribute('href', 'https://computer123.ir/');
  await expect(p.locator('a')).toHaveAttribute('rel', /noopener/);

  await expect(p.locator('.callout-important .callout-title')).toHaveText('مهم');
  await expect(p.locator('li.task')).toHaveCount(2);
  await expect(p.locator('li.task-done')).toHaveCount(1);
  await expect(p.locator('table tbody tr')).toHaveCount(2);
  await expect(p.locator('pre.code[data-lang="js"]')).toBeVisible();

  // No raw markers leak into the rendered text.
  await expect(p).not.toContainText('[!مهم]');
  await expect(p).not.toContainText('~~');
});

test('unsupported syntax degrades to text instead of breaking the document', async ({ page }) => {
  await openApp(page);
  await setSource(page, 'آدرس لخت https://computer123.ir و پانویس[^1] و فرمول $x^2$.\n\n<script>window.__pwned=1<\/script>\n');
  const p = page.locator('#preview');
  await expect(p.locator('a')).toHaveCount(0); // bare URLs are not linkified — the prompt sheet says so
  await expect(p).toContainText('[^1]');
  await expect(p).toContainText('$x^2$');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('⌘K opens the palette, filters, and runs a command', async ({ page }) => {
  await openApp(page);
  const title = await runCommand(page, 'حالت مطالعه');
  expect(title).toContain('مطالعه');
  await expect(page.locator('.palette')).toHaveCount(0);
});

test('the report prompt is offered in the palette and can be copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openApp(page);
  await runCommand(page, 'پرامپت گزارش');

  const sheet = page.locator('.prompt-sheet');
  await expect(sheet).toBeVisible();
  const base = await sheet.inputValue();
  expect(base).toContain('اولین کاراکتر خروجی باید «#» باشد');
  expect(base).not.toContain('باسمه تعالی');

  await page.check('#promptLetter');
  const withLetter = await sheet.inputValue();
  expect(withLetter.startsWith(base)).toBe(true);
  expect(withLetter).toContain('باسمه تعالی');

  await page.getByRole('button', { name: 'کپی پرامپت' }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toBe(withLetter);
});

test('cleanup fixes AI output: Arabic letters, spacing and filler paragraphs', async ({ page }) => {
  await openApp(page);
  await setSource(page, 'حتماً! در ادامه گزارش شما:\n\n# نتيجه\n\nاين متن مي رود و كتاب ها زياد است.\n\nامیدوارم مفید باشد.\n');
  await runCommand(page, 'پاک‌سازی سریع');
  await page.waitForTimeout(400);
  const src = await page.inputValue('#source');
  expect(src).not.toContain('حتماً!');
  expect(src).not.toContain('امیدوارم مفید باشد');
  expect(src).not.toMatch(/[يك]/);
  expect(src).toContain('می‌رود');
  expect(src).toContain('کتاب‌ها');
});
