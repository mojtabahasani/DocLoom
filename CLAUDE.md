# MD2Html Pro

- Source lives in `src/` (vanilla ES modules + CSS). `MD2Html.html` and `dist/` are **build output**: never edit them directly. Run `npm run build` after changes (it rebuilds `dist/MD2Html.html`, `dist/pwa/`, and copies to `./MD2Html.html`).
- Tests: `npm test` (node:test, pure modules under `src/js/content`, `brand`, `export/docx.js`, etc.).
- Browser check: serve with `python3 -m http.server` (Playwright MCP blocks `file:`).
- Design spec: `docs/superpowers/specs/2026-10-30-md2html-pro-design.md`. Feature parity list: `docs/superpowers/plans/feature-inventory.md`. User guide: `docs/راهنما.md`.
- `1file-old/` is the user's backup of the original single-file app: read-only.
- RTL rules: never mirror prev/next controls; progress bars, sliders and chart x-axes fill left→right.

## Server (S1)
- `server/` is pure Node (no npm deps), port 4123 (`MD2HTML_PORT`), data in `~/Documents/MD2Html/` (`MD2HTML_DATA`). Foreground: `npm run server`. Serves `dist/pwa/` directly (no restart after `npm run build`).
- `server/install.sh` / `uninstall.sh` (LaunchAgent + `md2html` CLI) are written but **must be run by the user**; never run them, `launchctl` or write to `~/Library` from an agent. Test with `install.sh --dry-run <plist>`.
- Client sync: `src/js/server/` (pure merge in `sync-core.js`); active only when `/api/health` answers same-origin; never fetches on `file://`.
- Tests: `tests/server/*.test.mjs` (integration uses `MD2HTML_TEST=1` for the remote-address override header; never set it otherwise).

## Server (S2)
- Files: `server/lib/files.js` (+ `file-routes.js`): realpath-confined API `/api/files/*`, SSE `/api/watch?path=`, backups in `data/backups/files/`. Test roots via `MD2HTML_ROOTS` (colon-separated; default `~/MyApp ~/Documents ~/Desktop ~/Downloads`): **never write into the real roots when testing.**
- Client: `src/js/server/linked.js` (linked docs, live reload, ⌘S), `files-ui.js` (drawer), `files-picker.js`, `files-export.js`. The `link` field ({path,etag,mtime,size,dirty}) lives on the document; seed brand id is `brand_computer123`.
