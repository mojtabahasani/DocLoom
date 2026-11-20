// The side panels' group drawers: the tabs are built from the markup, the count on a group is
// the number of tools really inside it, context brings the right group forward, and the arrow
// keys move the way the direction rule says they must.
import { test, expect } from '@playwright/test';
import { openApp, runCommand } from './helpers.mjs';

const tab = (panel, group) => `#g-${panel}-${group}`;
const activeGroup = (page, panel) => page.locator(`[data-drawer="${panel}"] .dtab.on`).first();

test('both panels build their groups, in the order the markup declares them', async ({ page }) => {
  const { errors } = await openApp(page);
  for (const [panel, order] of [
    ['content', ['input', 'toc', 'files', 'out', 'prefs']],
    ['design', ['look', 'blocks', 'letter', 'marks', 'insight']],
  ]) {
    const ids = await page.locator(`[data-drawer="${panel}"] > .dnav .dtab`).evaluateAll((els) => els.map((e) => e.id));
    expect(ids, panel).toEqual(order.map((g) => `g-${panel}-${g}`));
  }
  // Every group lists what is inside it, by name — no bare number anywhere on a tab.
  await page.click(tab('design', 'look'));
  await expect(page.locator('[data-drawer="design"] .dhead-list')).toContainText('حاشیهٔ چاپ A4');
  expect(errors).toEqual([]);
});

test('picking a group swaps the panel body and names what is inside it', async ({ page }) => {
  await openApp(page);
  await page.click(tab('design', 'letter'));
  await expect(page.locator('#dg-letter')).toBeVisible();
  await expect(page.locator('#dg-look')).toBeHidden();
  await expect(page.locator('[data-drawer="design"] .dhead-name')).toHaveText('سند اداری');
  // The header lists the tools, so you learn what a group holds without opening anything.
  await expect(page.locator('[data-drawer="design"] .dhead-list')).toContainText('نامهٔ اداری');
});

test('a palette command brings its own group forward', async ({ page }) => {
  await openApp(page);

  // Letter mode is switched on from ⌘K, while the design panel is showing something else.
  await page.click(tab('design', 'look'));
  await expect(activeGroup(page, 'design')).toHaveAttribute('id', 'g-design-look');
  await runCommand(page, 'حالت نامه');
  // Both levels open: the rail group, and the tab inside it that actually holds the fields.
  await expect(activeGroup(page, 'design')).toHaveAttribute('id', 'g-design-letter');
  await expect(activeGroup(page, 'office')).toHaveAttribute('id', 'g-office-letter');
  await expect(page.locator('#letterMode')).toBeChecked();
  await expect(page.locator('#letterTo')).toBeVisible();

  // So does the watermark command, which lives in a different group again.
  await page.click(tab('design', 'look'));
  await runCommand(page, 'واترمارک: متن دلخواه');
  await expect(activeGroup(page, 'design')).toHaveAttribute('id', 'g-design-marks');
  await expect(activeGroup(page, 'layers')).toHaveAttribute('id', 'g-layers-wm');
  await expect(page.locator('#wmText')).toBeVisible();
});

test('a group with two jobs nests a tab row instead of stacking accordions', async ({ page }) => {
  await openApp(page);
  await page.click(tab('design', 'letter'));
  await expect(page.locator('#dg-office-mast')).toBeVisible();
  await expect(page.locator('#dg-office-letter')).toBeHidden();
  await page.click(tab('office', 'letter'));
  await expect(page.locator('#dg-office-mast')).toBeHidden();
  await expect(page.locator('#dg-office-letter')).toBeVisible();
  // The outer group's header lists what the inner tabs hold, not the fields inside them.
  await expect(page.locator('[data-drawer="design"] .dhead-list')).toHaveText('سربرگ و پاورقی · نامهٔ اداری');
  // No accordion is left in the design panel: the nested tabs replaced every one of them.
  await expect(page.locator('.side.right details.acc')).toHaveCount(0);
});

test('arrow keys follow the direction rule: down and left go forward, up and right go back', async ({ page }) => {
  await openApp(page);

  // The rail is vertical: down is the next group, up the previous one.
  await page.click(tab('design', 'look'));
  await page.locator(tab('design', 'look')).press('ArrowDown');
  await expect(activeGroup(page, 'design')).toHaveAttribute('id', 'g-design-blocks');
  await page.locator(tab('design', 'blocks')).press('ArrowUp');
  await expect(activeGroup(page, 'design')).toHaveAttribute('id', 'g-design-look');

  // Both panels wear the rail, so the same holds for the content column.
  await page.click(tab('content', 'input'));
  await page.locator(tab('content', 'input')).press('ArrowDown');
  await expect(activeGroup(page, 'content')).toHaveAttribute('id', 'g-content-toc');
  await page.locator(tab('content', 'toc')).press('ArrowUp');
  await expect(activeGroup(page, 'content')).toHaveAttribute('id', 'g-content-input');

  // A nested tab row is laid out right to left, so there the next tab is the one to the LEFT.
  await page.click(tab('design', 'letter'));
  await page.click(tab('office', 'mast'));
  await page.locator(tab('office', 'mast')).press('ArrowLeft');
  await expect(activeGroup(page, 'office')).toHaveAttribute('id', 'g-office-letter');
  await page.locator(tab('office', 'letter')).press('ArrowRight');
  await expect(activeGroup(page, 'office')).toHaveAttribute('id', 'g-office-mast');
});

test('the group mark can be an emoji instead of an icon', async ({ page }) => {
  await openApp(page);
  await page.click(tab('content', 'prefs'));
  await expect(page.locator(tab('design', 'look') + ' .g-glyph svg')).toHaveCount(1);
  await page.click('[data-glyph="emoji"]');
  await expect(page.locator(tab('design', 'look') + ' .g-glyph')).toHaveText('🎨');
  await page.click('[data-glyph="icon"]');
  await expect(page.locator(tab('design', 'look') + ' .g-glyph svg')).toHaveCount(1);
});
