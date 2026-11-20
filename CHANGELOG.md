# Changelog

All notable changes to **DocLoom** are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [1.4.0] — 2026-11-20

### Added
- **Bilingual English/Persian (`EN`/`FA`, `LTR`/`RTL`) Localization Engine (`src/js/core/i18n.js`, `src/js/ui/lang.js`)**: Opens in English (`LTR`) by default with a one-click topbar `EN / FA` toggle, command palette actions, persistent language preference, and dynamic drawer/direction/digit-script switching (`tests/i18n.test.mjs`).
- **International English Ledger & ISO Date Parsing (`src/js/bank/bank-table.js`, `src/js/bank/normalize.js`)**: Recognizes English spreadsheet/CSV headers (`Transaction Date`, `Credit`, `Debit`, `Amount In/Out`, `Running Balance`, `Description`, `Narrative`, `Account Holder`, `Currency`) and standard ISO Gregorian dates (`YYYY-MM-DD`).
- **Bilingual AI Report & Official Letter Prompt Generator (`src/js/content/report-prompt.js`, `src/js/ui/prompt-sheet.js`, `src/js/ui/about.js`)**: Added English report/letter Markdown prompts (`REPORT_PROMPT_EN`, `LETTER_ADDON_EN`) and localized About & Prompt modals (`tests/report-prompt.test.mjs`).
- **GitHub Actions CI & Brand Banner (`.github/workflows/ci.yml`, `docs/assets/docloom-banner.png`)**: Automated `npm ci`, single-file build, unit/integration suite, and static guardrails on every push and pull request.

## [1.3.0] — 2026-11-20

### Added
- **Icon-Rail Panel Drawers (`src/js/ui/drawer.js`, `src/styles/drawer.css`)**: Replaced stacked sidebar accordions with colored vertical icon-rail groups, nested tabbed subsections, full keyboard navigation, and automatic control reveal (`reveal()`).
- **Nine Unified Document Themes (`src/js/export/theme.js`)**: Centralized document theme definitions shared across live preview CSS, command palette, brand settings, and all HTML/PDF exports (verified by `tests/doc-themes.test.mjs`).
- **Static Code Guardrails (`scripts/guardian/`)**: Added automated checks for template slot integrity (`MD-MOVE`), dialog consistency, secret hygiene, and theme token usage.
- **Library Deduplication Utility (`tools/dedupe-library.mjs`)**: Audits and strips redundant per-revision brand image copies and archives identical conflict duplicates.
- **Public Open-Source Packaging**: Added global English `README.md`, `MIT` `LICENSE`, and clean repository metadata.

### Fixed
- **Sync Conflict False Positives (`src/js/server/sync-core.js`)**: Separated missing per-device `base` metadata from genuine dual edits by resolving inherited brand assets and comparing normalized document content before emitting conflict copies.
- **Brand Image Deduplication (`src/js/library/doc-model.js`)**: Documents inherit large base64 brand assets via `brandId` instead of duplicating them on every revision.
- **Backup Rotation Ordering (`server/lib/backup.js`)**: Switched backup pruning sort from filename string order to embedded date ordering.

## [1.2.0] — 2026-11-14

### Added
- **Archive-Instead-of-Delete Architecture (`tests/no-destroy.test.mjs`)**: Document and brand deletions set `archivedAt`; server deletion gzips snapshots into `library/_retired/` with read-only recovery routes (`/api/retired`).

## [1.1.0] — 2026-11-14

### Added
- **Server Hardening (`server/lib/security.js`, `server/index.js`)**: Loopback-only (`127.0.0.1`) default binding with runtime LAN toggle, global PIN rate limiting, agent instruction file write protection, and 48 XSS sanitizer regression vectors (`tests/sanitize.test.mjs`).

## [1.0.0] — 2026-11-04

### Added
- Initial tagged release featuring single-file HTML compilation (`< 900 KB`), installable PWA, zero-dependency OLE2/CFB & BIFF8 `.xls` parser, FastReport `.fp3` geometric table reconstructor, client-side OOXML `.docx` export, headless Chrome CDP PDF rendering, and `axe-core` WCAG 2.1 A/AA audit coverage.
