// The RTL hard rule, checked in a real browser instead of by eye:
//   1. prev/next controls are never mirrored — left = previous, right = next
//   2. progress bars, sliders and chart x-axes fill left -> right
// This is the checklist that was got wrong twice by hand (the date picker and the volume bar).
import { test, expect } from '@playwright/test';
import { openApp, setSource, runCommand } from './helpers.mjs';

const TABLE_DOC = `# فروش

| ماه | فروش |
|---|---:|
| فروردین | ۱۲۰ |
| اردیبهشت | ۱۴۵ |
| خرداد | ۹۰ |
`;

const LONG_DOC = '# گزارش بلند\n\n' + Array.from({ length: 60 }, (_, i) => `## بخش ${i + 1}\n\nیک پاراگراف نسبتاً بلند برای آن‌که صفحه قابل پیمایش شود و نوار پیشرفت معنا پیدا کند.\n`).join('\n');

test('the document is RTL but the page never scrolls sideways', async ({ page }) => {
  await openApp(page);
  await setSource(page, TABLE_DOC);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(1);
});

test('the chart x axis runs left to right: the first table row sits leftmost', async ({ page }) => {
  await openApp(page);
  await setSource(page, TABLE_DOC);
  await runCommand(page, 'درج نمودار از جدول');
  await page.locator('.chart-pop').waitFor();
  await page.locator('.cp-actions button.primary').click();

  const svg = page.locator('#preview svg.chart-svg').first();
  await expect(svg).toBeVisible();
  expect(await svg.evaluate((n) => getComputedStyle(n).direction)).toBe('ltr');

  const xs = await svg.evaluate((n) =>
    [...n.querySelectorAll('text')]
      .filter((t) => ['فروردین', 'اردیبهشت', 'خرداد'].includes(t.textContent.trim()))
      .map((t) => ({ label: t.textContent.trim(), x: t.getBoundingClientRect().x })),
  );
  expect(xs.map((o) => o.label)).toEqual(['فروردین', 'اردیبهشت', 'خرداد']);
  expect(xs[0].x, 'فروردین must be left of اردیبهشت').toBeLessThan(xs[1].x);
  expect(xs[1].x, 'اردیبهشت must be left of خرداد').toBeLessThan(xs[2].x);
});

test('the reading-mode progress bar fills from the left', async ({ page }) => {
  await openApp(page);
  await setSource(page, LONG_DOC);
  await runCommand(page, 'حالت مطالعه');

  const track = page.locator('.reader-progress');
  await expect(track).toBeVisible();
  const fill = track.locator('> *').first();

  const before = await fill.boundingBox();
  const box = await track.boundingBox();
  expect(Math.abs(before.x - box.x), 'the fill starts flush with the left edge').toBeLessThanOrEqual(2);

  await page.locator('.reader-scroll').evaluate((n) => n.scrollTo(0, n.scrollHeight));
  await expect.poll(async () => Number(await track.getAttribute('aria-valuenow'))).toBeGreaterThan(50);

  const after = await fill.boundingBox();
  expect(after.width, 'the fill grows as you read').toBeGreaterThan(before.width);
  expect(Math.abs(after.x - box.x), 'and it still grows rightward from the left edge').toBeLessThanOrEqual(2);

  // The A+/A- group is an LTR island inside the RTL bar.
  expect(await page.locator('.reader-group.ltr-group').evaluate((n) => getComputedStyle(n).direction)).toBe('ltr');
  await page.keyboard.press('Escape');
  await expect(page.locator('.reader')).toHaveCount(0);
});

test('presentation keys are not mirrored: right advances, left goes back', async ({ page }) => {
  await openApp(page);
  await setSource(page, '# اسلاید یک\n\nمتن.\n\n# اسلاید دو\n\nمتن.\n\n# اسلاید سه\n\nمتن.\n');
  await runCommand(page, 'شروع حالت ارائه');

  const deck = page.frameLocator('.present-frame');
  await expect(deck.locator('section.slide')).toHaveCount(3);

  // Slides switch with `display`, not opacity: the shown one carries class `on`.
  const indexOfCurrent = () =>
    page.locator('.present-frame').evaluate((f) =>
      [...f.contentDocument.querySelectorAll('section.slide')].findIndex((s) => s.classList.contains('on')),
    );

  await deck.locator('section.slide.on').click({ position: { x: 20, y: 20 } }); // focus inside the frame
  expect(await indexOfCurrent()).toBe(0);

  await page.keyboard.press('ArrowRight');
  await expect.poll(indexOfCurrent, { message: 'ArrowRight must advance, not go back' }).toBe(1);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(indexOfCurrent, { message: 'ArrowLeft must go back' }).toBe(0);
  await page.keyboard.press('Space');
  await expect.poll(indexOfCurrent, { message: 'Space advances too' }).toBe(1);

  // The counter and the disabled state follow the same direction.
  await expect(deck.locator('.ctl .count')).toHaveText('۲ / ۳');

  // The on-screen control group is an LTR island, and its progress bar fills from the left.
  expect(await deck.locator('.ctl').evaluate((n) => getComputedStyle(n).direction)).toBe('ltr');
  expect(await deck.locator('.pbar').evaluate((n) => getComputedStyle(n).direction)).toBe('ltr');
  const bar = await deck.locator('.pbar').boundingBox();
  const barFill = await deck.locator('.pbar i').boundingBox();
  expect(Math.abs(barFill.x - bar.x)).toBeLessThanOrEqual(2);

  await page.keyboard.press('Escape');
  await expect(page.locator('.present-frame')).toHaveCount(0);
});
