// Browser suite. `npm test` stays the fast node:test run; this is `npm run test:e2e`.
// It drives dist output (DocLoom.html), so run `npm run build` first — the webServer command does.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT) || 8732;
const baseURL = `http://127.0.0.1:${PORT}`;
// E2E_CHANNEL=msedge|chrome uses an installed browser instead of Playwright's downloaded Chromium.
const channel = process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {};

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.mjs/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...channel, viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'], ...channel }, testMatch: /layout\.spec\.mjs/ },
  ],
  webServer: {
    command: 'npm run build && node tests/e2e/static-server.mjs',
    env: { ...process.env, E2E_PORT: String(PORT) }, // not `E2E_PORT=… node`: cmd.exe (Windows) has no inline env
    url: `${baseURL}/DocLoom.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
  },
});
