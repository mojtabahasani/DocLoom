// Shared helpers for the browser suite.
import { expect } from '@playwright/test';

export const APP = '/MD2Html.html';

/** The app's one allowed request: the offline-mode health probe, which 404s here. */
const EXPECTED_404 = '/api/health';

/**
 * Open the app and start collecting console errors and page errors.
 * Returns { errors, requests } — assert on them at the end of a test.
 */
export async function openApp(page, { path = APP } = {}) {
  const errors = [];
  const requests = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // The health probe's 404 is expected: it is how the app decides it has no server.
    if (m.text().includes('404') || m.text().includes('Failed to load resource')) return;
    errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(path);
  await expect(page.locator('#preview')).toBeVisible();
  await page.waitForFunction(() => !!document.querySelector('#source'));
  return { errors, requests };
}

/** Requests that left the app's own origin, or hit anything but the health probe. */
export function offTargetRequests(requests, baseURL) {
  return requests.filter((u) => !u.startsWith(baseURL) || (u.includes('/api/') && !u.includes(EXPECTED_404)));
}

/**
 * Type Markdown into the source box and wait for the body to actually render.
 * `#preview` is never empty — the seed brand puts a masthead and footer in it — so the wait has
 * to be for a child that is not furniture, otherwise the test races ahead of the render.
 */
export async function setSource(page, md) {
  await page.fill('#source', md);
  await page.dispatchEvent('#source', 'input');
  await page.waitForFunction(
    () => [...document.querySelector('#preview').children].some((n) => !n.hasAttribute('data-md2-furniture')),
    null,
    { timeout: 7000 },
  );
}

/**
 * Open ⌘K, filter, and run the first result.
 * The palette closes first and runs the command on the next tick (`setTimeout(..., 0)`), so callers
 * must wait for the command's own effect before acting — never assume it has run when this resolves.
 */
export async function runCommand(page, query) {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  const input = page.locator('.palette-input');
  await expect(input).toBeFocused();
  await input.fill(query);
  const first = page.locator('.pal-item').first();
  await expect(first).toBeVisible();
  const title = (await first.innerText()).trim();
  await first.click();
  await expect(page.locator('.palette')).toHaveCount(0);
  return title;
}

/** "New document", waited out: the editor is empty and the command has actually run. */
export async function newDocument(page) {
  await runCommand(page, 'سند تازه');
  await expect(page.locator('#title')).toHaveValue('');
  await expect(page.locator('#source')).toHaveValue('');
  await expect(page.locator('#preview')).toHaveAttribute('data-empty', 'true');
}

/** Horizontal fill direction of an element's painted part, relative to its track. */
export async function fillsFromLeft(track, fill) {
  const t = await track.boundingBox();
  const f = await fill.boundingBox();
  if (!t || !f) throw new Error('no bounding box');
  // A left-to-right fill starts flush with the track's left edge.
  return Math.abs(f.x - t.x) <= 2 && f.width < t.width + 2;
}
