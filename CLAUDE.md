# MD2Html Pro

- Source lives in `src/` (vanilla ES modules + CSS). `MD2Html.html` and `dist/` are **build output**: never edit them directly. Run `npm run build` after changes (it rebuilds `dist/MD2Html.html`, `dist/pwa/`, and copies to `./MD2Html.html`).
- Tests: `npm test` (node:test, pure modules under `src/js/content`, `brand`, `export/docx.js`, etc.).
- Browser check: serve with `python3 -m http.server` (Playwright MCP blocks `file:`).
- Design spec: `docs/superpowers/specs/2026-10-30-md2html-pro-design.md`. Feature parity list: `docs/superpowers/plans/feature-inventory.md`. User guide: `docs/راهنما.md`.
- `1file-old/` is the user's backup of the original single-file app: read-only.
- RTL rules: never mirror prev/next controls; progress bars, sliders and chart x-axes fill left→right.
