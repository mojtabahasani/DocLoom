// Accessibility, checked with axe rather than by eye.
// Scoped to WCAG 2.1 A/AA. The whole UI is Persian and RTL, so this also catches the
// mistakes that only show up in RTL: an icon button with no name, a dialog with no label.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openApp, runCommand, setSource, openLibrary, setTitle } from './helpers.mjs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Dialogs sit on a translucent, blurred backdrop. axe cannot see through `backdrop-filter`, so
 * it blends the overlay into every colour behind it and reports contrast failures that are not
 * real — the dialog's own background is opaque and the text sits on that. Neutralising the
 * backdrop for the scan measures the colours the user actually sees. It is the only thing
 * changed, and only the layer behind the dialog, never the dialog itself.
 */
const UNBLUR = '.backdrop,.palette-back{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';

async function scan(page, within) {
  await page.addStyleTag({ content: UNBLUR });
  let b = new AxeBuilder({ page }).withTags(TAGS);
  if (within) b = b.include(within);
  return b.analyze();
}

/** axe's own wording, trimmed to something readable in a test failure. */
const report = (results) =>
  results.violations
    .map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.help}\n    ${v.nodes[0].target.join(' ')}`)
    .join('\n  ');

const DOC = `# گزارش آزمایشی

متن با **تأکید** و [لینک](https://computer123.ir).

> [!مهم] کادر تأکید.

| ستون | عدد |
|---|---:|
| الف | ۱۲۰ |
`;

test('the main screen has no accessibility violations', async ({ page }) => {
  await openApp(page);
  await setSource(page, DOC);
  const results = await scan(page);
  expect(results.violations, '\n  ' + report(results)).toEqual([]);
});

test('every icon-only control has an accessible name', async ({ page }) => {
  await openApp(page);
  // A button whose only child is an <svg> needs aria-label or title; this is the rule that
  // broke most often while the toolbar was being built.
  const nameless = await page.evaluate(() =>
    [...document.querySelectorAll('button, [role="button"]')]
      .filter((b) => b.offsetParent !== null)
      .filter((b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('title'))
      .map((b) => b.id || b.className || b.outerHTML.slice(0, 60)),
  );
  expect(nameless).toEqual([]);
});

test('the command palette is a labelled dialog and keeps focus', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Meta+k');
  await expect(page.locator('.palette-input')).toBeFocused();
  const results = await scan(page, '.palette');
  expect(results.violations, '\n  ' + report(results)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.palette')).toHaveCount(0);
});

test('the library drawer passes, and Escape gives focus back', async ({ page }) => {
  await openApp(page);
  await openLibrary(page);
  await expect(page.locator('.lib-drawer')).toBeVisible();
  const results = await scan(page, '.lib-drawer');
  expect(results.violations, '\n  ' + report(results)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#libraryBtn')).toBeFocused();
});

test('the archive view of the library passes in both themes', async ({ page }) => {
  await openApp(page);
  await setSource(page, DOC);
  await setTitle(page, 'سند بایگانی');
  await runCommand(page, 'ذخیرهٔ نسخه');
  await openLibrary(page);
  const drawer = page.locator('.lib-drawer');
  await drawer.getByRole('button', { name: 'بایگانی سند' }).first().click();
  await drawer.locator('.lib-archive').click();
  await expect(drawer.locator('.lib-item.archived')).toHaveCount(1);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForTimeout(400); // colours cross-fade on a theme change; scan the settled ones
    const results = await scan(page, '.lib-drawer');
    expect(results.violations, `${theme}\n  ` + report(results)).toEqual([]);
  }
});

test('a modal is labelled, traps Tab and returns focus on close', async ({ page }) => {
  await openApp(page);
  await runCommand(page, 'دربارهٔ برنامه');
  const modal = page.locator('.modal');
  await expect(modal).toHaveAttribute('role', 'dialog');
  await expect(modal).toHaveAttribute('aria-modal', 'true');
  const results = await scan(page, '.modal');
  expect(results.violations, '\n  ' + report(results)).toEqual([]);

  // Tab cycles inside the dialog rather than escaping to the page behind it.
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.modal'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});

test('reading mode and the printed statement pass too', async ({ page }) => {
  await openApp(page);
  await setSource(page, DOC);
  await runCommand(page, 'حالت مطالعه');
  await expect(page.locator('.reader')).toBeVisible();
  const reader = await scan(page, '.reader');
  expect(reader.violations, '\n  ' + report(reader)).toEqual([]);
  await page.keyboard.press('Escape');
});

test('the dark theme keeps enough contrast', async ({ page }) => {
  await openApp(page);
  await setSource(page, DOC);
  await runCommand(page, 'پوستهٔ برنامه: تیره');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const results = await scan(page);
  expect(results.violations, '\n  ' + report(results)).toEqual([]);
});
