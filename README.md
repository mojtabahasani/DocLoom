<p align="center">
  <img src="./docs/assets/docloom-banner.png" alt="DocLoom — Convert Markdown to Any Format" width="640">
</p>

# DocLoom

[![CI](https://github.com/mojtabahasani/DocLoom/actions/workflows/ci.yml/badge.svg)](https://github.com/mojtabahasani/DocLoom/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**Offline-first Markdown & bidirectional (`EN` / `FA`, `LTR` / `RTL`) document studio, single-file HTML/PWA/DOCX/PDF compiler, and zero-dependency legacy spreadsheet (`OLE2/CFB`, `BIFF8 .xls`, `.xlsx`, `CSV`) & FastReport (`.fp3`) spatial table engine.**

DocLoom compiles a modular vanilla ES module & CSS workspace into a completely self-contained, zero-CDN single HTML artifact (under 900 KB with inlined fonts) alongside an installable Progressive Web App (`dist/pwa/`) and an optional pure-Node companion server (`server/`).

---

## Why DocLoom?

Most browser-based document studios break down when dealing with three real-world engineering challenges:

1. **Bilingual & Bidirectional (`LTR`/`RTL`) Typography:** Switching smoothly between English (`LTR`) and Persian (`RTL`) workspaces—while keeping inline code runs, numeral scripts, and table layouts aligned across HTML, print, `.docx`, and PDF targets—often breaks in standard Markdown renderers.
2. **Legacy Binary & Coordinate-Based Reports:** Importing older binary `.xls` (OLE2 Compound File / BIFF8 records), messy SpreadsheetML exports, or FastReport `.fp3` prepared XML reports (which encode no explicit `<table>` structure—only raw `Left`/`Top`/`Width` memo coordinates) normally requires heavy server runtimes or proprietary desktop suites.
3. **Zero-Telemetry, Non-Destructive Local Workflows:** Sensitive financial, technical, and administrative documents require a deterministic, archive-first local studio that runs 100% offline from `file://` or `127.0.0.1` and **never silently destroys user history**.

DocLoom unifies all three into a compact, dependency-minimal codebase backed by 397 Node unit & integration tests, 59 Playwright browser/WCAG 2.1 AA accessibility checks, and 48 XSS sanitizer vectors.

---

## Key Engineering Highlights

### 1. Single-File Compiler, Live Bilingual UI (`EN`/`FA`) & Offline PWA
- **`build.mjs`** bundles `src/js/app.js`, ordered CSS layers (`src/styles/`), and base64-inlined WOFF2 fonts via `esbuild` into a single standalone HTML file (`< 900 KB` build-time size budget).
- **Live Bilingual Localization Engine (`src/js/core/i18n.js`, `src/js/ui/lang.js`)**: Defaults to English (`LTR`) with a one-click topbar `EN / FA` toggle and command palette shortcuts that dynamically localize panels, modals, AI prompts (`REPORT_PROMPT_EN`), layout direction, and digit formatting.
- Generates `dist/pwa/` with a content-hashed Service Worker (`pwa/sw.js`) that safely bypasses dynamic `/api/*` and revocable `/s/*` routes.

### 2. Zero-Dependency Binary Spreadsheet & Spatial Table Parsers
- **Pure-JS OLE2/CFB & BIFF8 `.xls` Decoder (`src/js/bank/cfb.js`, `src/js/bank/biff.js`)**: Implements Compound File Binary sector/FAT/DIFAT/mini-stream traversal and BIFF8 record parsing (`RK` 4-mode number unpacking, `SST` `CONTINUE` string blocks, and rich-text/phonetic block skipping) from scratch with zero third-party Excel libraries.
- **International & Regional Multi-Format Ledger Pipeline (`src/js/bank/sheet-read.js`, `bank-table.js`, `normalize.js`, `kinds.js`)**: Supports `.xlsx` (via `fflate`), SpreadsheetML, CSV, international English ledger headers (`Transaction Date`, `Credit`, `Debit`, `Running Balance`, `Narrative`), ISO Gregorian (`YYYY-MM-DD`) and Jalali dates, heuristic header scoring across multi-row preambles, and reverse-chronological balance reordering.
- **FastReport `.fp3` Geometric Table Reconstructor (`src/js/saba/fp3.js`, `fp3-table.js`, `saba-report.js`)**: Reconstructs semantic tables and key-value metadata directly from absolute memo coordinates in prepared FastReport XML files.

### 3. Multi-Format Export & Headless Chrome CDP PDF Engine
- **Client-Side OOXML `.docx` Builder (`src/js/export/docx.js`, `docx-dom.js`)**: Assembles standards-compliant Word documents in the browser via `fflate` with bidirectional runs, tables, callouts, headings, and embedded assets.
- **Rich Export Targets (`src/js/export/`)**: Standalone searchable HTML (`interactive.js`), slide presentation mode (`present.js`), PNG snapshot (`png.js`), print stylesheets (`print.css`), and 9 unified document color themes (`src/js/export/theme.js`).
- **Zero-Dependency Companion Server (`server/`)**: Pure Node.js HTTP server (`server/index.js`) with headless Chrome over `--remote-debugging-pipe` CDP (`server/lib/pdf.js`) for single-document and batch PDF generation, realpath-confined file linking (`server/lib/files.js`), SSE live reload, PIN auth, and revocable share links (`/s/<id>`).

### 4. Non-Destructive Archive & Conflict-Safe Multi-Device Sync
- **Archive-Instead-of-Delete (`tests/no-destroy.test.mjs`)**: Document and brand removals set `archivedAt` while preserving all versions; server-side deletion writes gzipped snapshots into `library/_retired/` before writing tombstones. A static enforcement test prevents unapproved destructive database or filesystem calls.
- **Content-Aware Sync (`src/js/server/sync-core.js`)**: Avoids false-positive conflict duplicates when local `base` state is missing by resolving inherited brand assets (`docToPatch`) and comparing normalized content (`sameDocContent`).
- **Asset Deduplication (`src/js/library/doc-model.js`, `tools/dedupe-library.mjs`)**: Deduplicates ~5 MB per-revision base64 letterhead/signature payloads by referencing parent brand assets.

### 5. Security, Accessibility & Embeddable SDK
- **Strict HTML Sanitizer (`src/js/content/sanitize.js`)**: Verified against 48 XSS attack vectors (`tests/sanitize.test.mjs` and Playwright `tests/e2e/xss.spec.mjs`).
- **WCAG 2.1 A/AA Audited (`tests/e2e/a11y.spec.mjs`)**: Automated `@axe-core/playwright` audits across editor, command palette, modals, dark mode, and reading views.
- **Embed Mode (`src/js/core/embed-config.js`, `src/js/embed/embed.js`)**: Opt-in host integration configuration and `postMessage` API (`window.DOCLOOM_EMBED`).

---

## Quick Start

### Prerequisites
- **Node.js** `>= 20`
- **Chromium / Google Chrome** (optional, required only for Playwright E2E tests and server-side CDP PDF rendering)

### Install & Build
```bash
git clone https://github.com/mojtabahasani/DocLoom.git
cd DocLoom
npm install
npm run build
```

Build outputs:
- `DocLoom.html` / `dist/DocLoom.html` — standalone single-file studio (open directly in any browser)
- `dist/pwa/` — installable PWA bundle

### Run the Companion Server (Optional)
```bash
npm run server
```
Starts the pure-Node companion server on `http://127.0.0.1:7123`.

### Run Tests & Static Guards
```bash
# Run all 397 unit and server integration tests
npm test

# Run static code quality and guardrail checks
npm run guard:ratchet

# Run Playwright browser E2E & WCAG 2.1 accessibility tests
npm run test:e2e
```

---

## Repository Structure

```text
DocLoom/
├── build.mjs                 # Single-file HTML + PWA compiler (esbuild + inlined WOFF2)
├── src/
│   ├── index.html            # Application shell & icon-rail panel drawers
│   ├── styles/               # Layered CSS design tokens, layout, drawer, print & table styles
│   ├── fonts/                # Subset Vazirmatn WOFF2 fonts (OFL)
│   └── js/
│       ├── core/             # Versioning, storage compatibility, digits, XML, runtime guard
│       ├── content/          # Markdown parser, typography normalization, SVG charts, TOC, sanitizer
│       ├── bank/             # Zero-dep OLE2/CFB, BIFF8 .xls, XLSX, CSV, tabular formatter
│       ├── saba/             # FastReport .fp3 XML geometric table reconstructor
│       ├── brand/            # Document mastheads, footers, QR blocks, watermarks, signatures
│       ├── export/           # Client-side DOCX, interactive HTML, slides, PNG, themes
│       ├── library/          # IndexedDB store, version history, backups, fuzzy search
│       ├── server/           # Conflict-safe sync client, linked files, PDF & batch client
│       ├── embed/            # Opt-in host page integration API
│       └── ui/               # Command palette (Cmd/Ctrl+K), rail drawer, modals, reading mode
├── server/                   # Zero-dep Node HTTP server, CDP PDF renderer, file API, CLI
├── pwa/                      # Service worker & manifest templates
├── scripts/guardian/         # Static rule scanner & baseline ratchet
├── tools/                    # Ledger reconciliation verifier & library deduplication tool
└── tests/                    # 397 unit/server tests + Playwright E2E, XSS & axe-core suites
```

---

## License

Released under the [MIT License](./LICENSE).
