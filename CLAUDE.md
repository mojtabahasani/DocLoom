# MD2Html Pro

- Source lives in `src/` (vanilla ES modules + CSS). `MD2Html.html` and `dist/` are **build output**: never edit them directly. Run `npm run build` after changes (it rebuilds `dist/MD2Html.html`, `dist/pwa/`, and copies to `./MD2Html.html`). Only the root `MD2Html.html` and `dist/pwa/` are tracked; `dist/MD2Html.html` is gitignored (identical copy) and the server serves the root one.
- `AGENTS.md` is a symlink to this file: edit only `CLAUDE.md`.
- Tests: `npm test` (node:test, pure modules under `src/js/content`, `brand`, `export/docx.js`, etc.).
- Browser tests: `npm run test:e2e` (`@playwright/test`, specs in `tests/e2e/*.spec.mjs`, config `playwright.config.mjs`). Its `webServer` runs `npm run build` and `tests/e2e/static-server.mjs`, which serves the repo root with **no `/api/*`** so the app stays in offline mode. Two projects: `desktop` (all specs) and `mobile` (Pixel 5, `layout.spec.mjs` only). `npm run test:all` runs both suites. Palette commands run on `setTimeout(…, 0)` after the palette closes — always wait for the command's effect, never assume `runCommand` has already run it.
- Browser check by hand: serve with `python3 -m http.server` (Playwright MCP blocks `file:`).
- Design spec: `docs/superpowers/specs/2026-10-30-md2html-pro-design.md`. Feature parity list: `docs/superpowers/plans/feature-inventory.md`. User guide: `docs/راهنما.md`.
- `docs/قالب-گزارش.md` is the prompt handed to outside models (ChatGPT / Gemini). Its two ```text blocks are asserted byte-equal to `src/js/content/report-prompt.js` by `tests/report-prompt.test.mjs`: edit the module, then the doc. The user-level skill `~/.claude/skills/md2html/` mirrors it.
- `1file-old/` is the user's backup of the original single-file app: read-only.
- RTL rules: never mirror prev/next controls; progress bars, sliders and chart x-axes fill left→right.

## Server (S1)
- `server/` is pure Node (no npm deps), port 7123 (`MD2HTML_PORT`), data in `~/Documents/MD2Html/` (`MD2HTML_DATA`). Foreground: `npm run server`. Serves `dist/pwa/` directly (no restart after `npm run build`).
- `server/install.sh` / `uninstall.sh` (LaunchAgent + `md2html` CLI) are written but **must be run by the user**; never run them, `launchctl` or write to `~/Library` from an agent. Test with `install.sh --dry-run <plist>`.
- Client sync: `src/js/server/` (pure merge in `sync-core.js`); active only when `/api/health` answers same-origin; never fetches on `file://`.
- Tests: `tests/server/*.test.mjs` (integration uses `MD2HTML_TEST=1` for the remote-address override header; never set it otherwise).

## Server (S2)
- Files: `server/lib/files.js` (+ `file-routes.js`): realpath-confined API `/api/files/*`, SSE `/api/watch?path=`, backups in `data/backups/files/`. Test roots via `MD2HTML_ROOTS` (colon-separated; default `~/MyApp ~/Documents ~/Desktop ~/Downloads`): **never write into the real roots when testing.**
- Client: `src/js/server/linked.js` (linked docs, live reload, ⌘S), `files-ui.js` (drawer), `files-picker.js`, `files-export.js`. The `link` field ({path,etag,mtime,size,dirty}) lives on the document; seed brand id is `brand_computer123`.

## Server (S3)
- PDF/batch: `server/lib/pdf.js` (Chrome via `--remote-debugging-pipe` CDP, single-worker queue, 60s timeout; `MD2HTML_CHROME` override), `batch.js`, route `/render` (loopback or job token only; app boots in render mode, `src/js/server/render-mode.js`). Current-doc PDF posts the export HTML to `/api/pdf`.
- Shares: `server/lib/shares.js` (`data/shares/<22-char id>/`, public `/s/<id>`, CSP `connect-src 'none'`). Finder bundles are generated: edit `server/finder/build-workflows.mjs`, run it, never edit `.workflow` by hand; never install them (install.sh does, user-run). Service workers cache the shell: unregister when smoke-testing a rebuilt app.

## Embed mode
- Opt-in only: a host page defines `window.MD2HTML_EMBED = { host, digits: 'en'|'fa', upload, library, server, brand }` before the app's `<script>`. **Without the global nothing changes** (`embedConfig().active === false`, every capability on, Persian digits). Config: `src/js/core/embed-config.js` (a capability is off only on an explicit `false`; `digits` defaults to `'fa'`). API: `src/js/embed/embed.js`, wired last in `app.js`.
- `library:false` skips `initLibrary`/`initLibraryUI`/`library.start` (no reopen, no autosave) and hides library/versions/backup UI and palette entries. `server:false` skips the `/api/health` probe (`initSync` returns false) and the server modules, and hides files/server/direct-PDF/batch/share/destination UI. `upload:false` hides the zi2.ir panel and refuses `uploadPendingImage`. Hidden nodes carry `data-embed-hidden` (`src/styles/embed.css`). No PWA glue in embed mode.
- `window.MD2Html.embed` (`ready`, `config`, `slot`, `load({markdown,title,subtitle,doc,html})`, `getMarkdown()`, `getHTML()`, `getDoc()`, `isDirty()`, `markClean()`, `on('dirty'|'save', fn)` → unsubscribe, `print()`, `applyBrand(obj)`), then `window` event `md2html:ready`. ⌘S fires `'save'` only (store event `embed:save`). Host brands live in memory (`brands.register`), never in IndexedDB.
- Digits: `src/js/core/digits.js` holds the active script; `toFaDigits`/`faPercent`, `formatJalali` default, chart `fmtNum`, cleanup defaults and the presentation runtime (`data-digits="en"`) follow it. With `digits:'en'` `src/js/embed/chrome-digits.js` (MutationObserver) turns chrome digits Latin, never inside `#preview`, `#source`, `#sourcePane`, the reader, textareas or `[data-md2-keep-digits]`. Parsing accepts Persian digits in every mode.
- Tests: `tests/embed.test.mjs`, `tests/e2e/embed.spec.mjs`. On Windows run the browser suite with `E2E_CHANNEL=msedge` (or `chrome`) instead of downloading Chromium.
