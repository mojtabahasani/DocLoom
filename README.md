# DataSave (دیتاسیو)

**Offline-first Persian/RTL Markdown document studio, single-file HTML/PWA/DOCX/PDF compiler, and zero-dependency legacy spreadsheet & FastReport parsing engine.**

DataSave compiles a modular vanilla JavaScript and CSS workspace into a completely self-contained, zero-CDN single HTML artifact (`DataSave.html`, under 900 KB with inlined Vazirmatn fonts) alongside an installable PWA (`dist/pwa/`) and an optional pure-Node companion server (`server/`).

---

## Why DataSave Exists

Publishing polished RTL (Persian/Arabic) and bidirectional technical, administrative, and financial documents in the browser is still surprisingly brittle:

- Standard Markdown renderers break RTL typography, ZWNJ spacing, Arabic-to-Persian character normalization, and mixed Latin/Persian code/digit runs.
- Legacy Iranian banking exports (`.xls` BIFF8/OLE2, SpreadsheetML, reversed columns, merged headers) and desktop accounting exports (FastReport `.fp3` coordinate XML) require heavy server stacks or proprietary Windows tools to render cleanly.
- Teams working in sensitive or air-gapped environments need an archive-first studio that **never silently destroys documents** and works 100% locally from `file://` or `127.0.0.1` without sending document text to external servers.

DataSave solves all three in a pure, dependency-minimal codebase backed by 390+ unit tests and 59+ Playwright browser/accessibility checks.

---

## Key Engineering Highlights

### 1. Single-File Compiler & Offline-First PWA
- **`build.mjs`** bundles `src/js/app.js`, ordered CSS layers (`src/styles/`), and base64-inlined subset `Vazirmatn` WOFF2 fonts via `esbuild` into a single portable `DataSave.html` (`< 900 KB` budget enforced at build time).
- Also emits `dist/pwa/` with a version-hashed Service Worker (`pwa/sw.js`) that explicitly excludes revocable server routes (`/s/*`, `/render`, `/api/*`).

### 2. Zero-Dependency Binary & Financial Parsers
- **OLE2 & BIFF8 Binary `.xls` Reader (`src/js/bank/cfb.js`, `src/js/bank/biff.js`)**: Pure JavaScript Compound File Binary (CFB/FAT/DIFAT/mini-stream) container and BIFF8 record decoder (`RK` 4-mode unpacking, `SST` `CONTINUE` boundaries, rich-text/phonetic skipping) written from scratch with zero external Excel dependencies.
- **Multi-Format Statement Pipeline (`src/js/bank/sheet-read.js`, `bank-table.js`, `kinds.js`, `statement-html.js`)**: Handles `.xlsx` (via `fflate`), SpreadsheetML, CSV, heuristic header scoring under multi-row preambles, chronological balance reordering, fee folding, and fixed-column color-coded print layout.
- **FastReport `.fp3` Reconstructor (`src/js/saba/fp3.js`, `fp3-table.js`, `saba-report.js`)**: Rebuilds semantic tables from absolute `Left`/`Width`/`Top` geometry in prepared FastReport XML streams.

### 3. Multi-Format Export & Headless Chrome PDF
- **Client-side OOXML `.docx` Builder (`src/js/export/docx.js`, `docx-dom.js`)**: Generates Word documents directly in the browser (`fflate` ZIP assembly, bidirectional RTL/LTR runs, headings, tables, callouts, and embedded images).
- **Rich Output Targets (`src/js/export/`)**: Interactive searchable HTML (`interactive.js`), slide presentation mode (`present.js`), PNG snapshot (`png.js`), print stylesheets (`print.css`), and 9 curated document color themes (`src/js/export/theme.js`, including lined notebook paper `"دفترچه"`).
- **Pure-Node Companion Server (`server/`)**: Zero third-party npm dependencies at runtime. Uses headless Chrome over `--remote-debugging-pipe` CDP (`server/lib/pdf.js`) for deterministic batch and single-document PDF generation, plus local file-linking (`server/lib/files.js`), SSE file watching, PIN auth, and revocable local share links (`/s/<id>`).

### 4. Archive-Instead-of-Delete & Multi-Device Sync
- **Non-Destructive Guarantee (`tests/no-destroy.test.mjs`)**: Deleting a document or brand only sets `archivedAt`; server-side deletes gzip snapshots into `library/_retired/` before writing tombstones. A dedicated test scans the codebase so any new destructive call breaks CI unless explicitly justified.
- **Conflict-Safe Sync (`src/js/server/sync-core.js`)**: Distinguishes missing local `base` state from true dual edits by resolving inherited brand assets (`docToPatch`) and comparing normalized content (`sameDocContent`) before creating conflict copies.
- **Brand Asset Deduplication (`src/js/library/doc-model.js`, `tools/dedupe-library.mjs`)**: Documents inherit large base64 letterhead, footer, signature, and stamp images from their brand record instead of duplicating ~5 MB across every document revision.

### 5. Embeddable SDK & Persian Typographic Engine
- **Embed Mode (`src/js/core/embed-config.js`, `src/js/embed/embed.js`)**: Host web apps can embed DataSave via `window.DATASAVE_EMBED` and `window.DataSave` with configurable digit mode (`fa`/`en`) and feature flags.
- **RTL Normalization & Sanitization (`src/js/content/`)**: Arabic-to-Persian letter normalization (`ي`/`ك`), automatic ZWNJ placement, interactive SVG bar/line/pie chart extraction (`chart.js`), syntax highlighting (`highlight.js`), and a strict HTML allowlist sanitizer verified against 48 XSS test vectors (`tests/sanitize.test.mjs`).

---

## Quick Start

### Prerequisites
- **Node.js** `>= 20` (uses built-in `node:test`)
- **Chromium / Google Chrome** (optional, required only for Playwright E2E tests and server-side PDF rendering)

### Install & Build
```bash
git clone https://github.com/mojtabahasani/DataSave.git
cd DataSave
npm install
npm run build
```

This generates:
- `DataSave.html` (standalone single-file studio — open directly in any modern browser)
- `dist/pwa/` (installable PWA bundle)

### Run the Companion Server (Optional)
```bash
npm run server
```
Starts the pure-Node server on `http://127.0.0.1:7123` (configurable via `DATASAVE_PORT`, `DATASAVE_DATA`, and `DATASAVE_LAN`).

### Run Tests & Static Guards
```bash
# Unit & server integration tests (390 tests via node --test)
npm test

# Static code rules & secret/RTL/non-destructive ratchet checks
npm run guard:ratchet

# Playwright end-to-end & WCAG 2.1 A/AA accessibility suite
npm run test:e2e
```

---

## Repository Structure

```text
DataSave/
├── build.mjs                 # Single-file HTML + PWA compiler (esbuild + inlined WOFF2)
├── DataSave.html             # Compiled standalone distribution artifact (< 900 KB)
├── src/
│   ├── index.html            # Application shell & icon-rail panel groups
│   ├── styles/               # Layered CSS tokens, layout, drawer, print & statement styles
│   ├── fonts/                # Subset Vazirmatn WOFF2 fonts (OFL)
│   └── js/
│       ├── core/             # Versioning, storage naming compatibility, digits, XML, guard
│       ├── content/          # Markdown parser, RTL Persian rules, charts, TOC, HTML sanitizer
│       ├── bank/             # Zero-dep OLE2/CFB, BIFF8 .xls, XLSX, CSV, statement renderer
│       ├── saba/             # FastReport .fp3 XML geometric table reconstructor
│       ├── brand/            # Brand letterheads, Jalali dates, QR footer, watermark, positioning
│       ├── export/           # Client-side DOCX, interactive HTML, slides, PNG, themes
│       ├── library/          # IndexedDB store, version history, backups, fuzzy search
│       ├── server/           # Conflict-safe sync client, linked files, PDF & batch client
│       ├── embed/            # Opt-in host page integration API
│       └── ui/               # Command palette (Cmd/Ctrl+K), rail drawer, modals, reading mode
├── server/                   # Zero-dep Node HTTP server, CDP PDF renderer, file API, macOS CLI
├── pwa/                      # Service worker & manifest templates
├── scripts/guardian/         # Static rule scanner & baseline ratchet
├── tools/                    # Bank reconciliation verifier & library deduplication utility
└── tests/                    # Unit, server integration, XSS, accessibility & Playwright E2E tests
```

---

## License

Released under the [MIT License](./LICENSE).

---

## معرفی کوتاه (فارسی)

**دیتاسیو (DataSave)** یک استودیوی متن‌باز و آفلاین برای نگارش، زیباسازی و تبدیل اسناد فارسی و دوجهته (RTL/LTR) است:
- تبدیل **Markdown و HTML** به خروجی تمیز چاپی، فایل **Word (`.docx`)**، **PDF**، اسلاید ارائه و صفحه وب تعاملی.
- موتور بومی و بدون وابستگی برای خواندن مستقیم صورت‌حساب‌های بانکی (`.xlsx`، `.xls` باینری با پارسر اختصاصی OLE2/BIFF8، CSV) و گزارش‌های `.fp3` صبا و تبدیل آن‌ها به گزارش چاپی استاندارد.
- معماری **تک‌فایلِ آفلاین (`DataSave.html`)** به‌همراه سرور سبک Node.js، کتابخانه نسخه‌دار غیرمخرب (بایگانی به‌جای حذف)، و بیش از 390 تست خودکار واحد و مرورگر.
