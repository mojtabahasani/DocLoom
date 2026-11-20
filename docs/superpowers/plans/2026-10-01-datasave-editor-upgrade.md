# DataSave Editor Upgrade Implementation Plan

> **For agentic workers:** Execute the tasks in order and preserve the single-file offline-first product model. Automated tests are not in scope unless the user requests them.

**Goal:** Upgrade DataSave into a Persian rich document editor with fixed side panels, contextual formatting, clipboard import, A4 page furniture, analytics, flexible export, and optional uploads to the user’s zi2.ir API.

**Architecture:** Keep the deliverable as one standalone HTML file and make its embedded JavaScript responsibilities explicit. Extend the settings JSON with a versioned, backward-compatible upload endpoint configuration. The PHP backend remains a separate existing project; do not alter it from this workspace.

**Tech Stack:** HTML, CSS, vanilla JavaScript, browser Clipboard and File System Access APIs with fallbacks, `fetch` multipart upload, browser print.

## Global Constraints

- The app remains a standalone HTML file and works offline for local editing and exports.
- Upload is optional, user initiated, and sends image data only to the configured endpoint.
- No third-party API key or password is embedded in the HTML.
- Pasted HTML is sanitized; executable code and unsafe URL schemes never enter the editor.
- PDF output uses the browser print dialog; unsupported Save As APIs fall back to normal download.
- Do not modify `/Users/macminim4/MyApp/xi2-php`; it is outside the writable project root and the deployment snapshot/route is not yet confirmed.
- Do not add or run automated tests unless the user requests testing.

---

## File Structure

- Modify `/Users/macminim4/MyApp/Vpn-Project/DataSave/DataSave.html`: all editor markup, styles, application state, paste/import handling, upload client, analytics, and exports.
- The same HTML file also owns the HTML-source editing mode; no executable source editor or third-party code editor is added.
- Modify `/Users/macminim4/MyApp/Vpn-Project/DataSave/datasave-settings.example.json`: document the configurable upload endpoint and request field while keeping secrets out of the example.
- Create `/Users/macminim4/MyApp/Vpn-Project/DataSave/docs/superpowers/docs/zi2-upload-setup.md`: explain how to locate the deployed API URL, configure CORS for local-file origins or serve the app from an allowed origin, and verify the response shape without exposing credentials.

## Task 1: Make the workspace fixed and center independently scrollable

**Files:**
- Modify `DataSave.html` CSS for `.top`, `.layout`, `.left`, `.right`, `.center`, and `.stage`.
- Modify `DataSave.html` markup to group long side-panel controls into collapsible sections.

**Interfaces:**
- The app shell occupies the viewport below the top bar.
- `.stage` is the only primary scrolling region on desktop; the left and right panels stay fixed in the shell.
- At narrow widths, retain responsive stacking and allow normal page scrolling for usability.

- [x] Adjust desktop grid height and overflow so the center document scrolls while tool panels remain stationary.
- [x] Collapse optional side-panel sections by default where needed to keep the controls accessible within viewport height.
- [x] Preserve current mobile single-column behavior and keyboard focus visibility.

## Task 2: Add contextual text formatting and undo/redo

**Files:**
- Modify `DataSave.html` toolbar markup, styles, and embedded editor script.

**Interfaces:**
- `History.push(label)`, `History.undo()`, and `History.redo()` manage editor DOM snapshots and selection restoration.
- `SelectionToolbar.show(range)` and `SelectionToolbar.hide()` manage the floating toolbar.
- Formatting actions use a saved selection and call a shared `applyInline(command, value)` or `applyBlockAlignment(value)` path.

- [x] Add floating toolbar actions for left/center/right alignment, bold, font size step up/down, text color, background color, preset highlights, and clear formatting.
- [x] Position the toolbar near selected text while clamping it inside the viewport; hide on collapsed selection, outside click, or Escape.
- [x] Preserve selection while the toolbar receives pointer interaction.
- [x] Record typing, formatting, insertion, and deletion into bounded undo/redo history; clear the redo stack after a new edit.
- [x] Add Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z keyboard behavior without intercepting undo in ordinary form fields.
- [x] Keep selection-based formatting in the editable document and in HTML export.

## Task 3: Import rich HTML and clipboard images safely

**Files:**
- Modify `DataSave.html` paste/drop handlers, sanitizer, and image target controls.

**Interfaces:**
- `ClipboardImporter.read(event)` returns sanitized HTML, plain text, or image `File` data.
- `MediaManager.insertImage(file, target)` inserts an embedded image into the document/header/footer target.
- `safeClone(root)` remains the sole boundary for external DOM content entering exportable content.

- [x] Prefer `text/html` clipboard content when present; otherwise insert `text/plain`.
- [x] Expand the safe tag/attribute/style allowlist for common copied website formatting, tables, list markers, text alignment, colors, font weight, and safe links.
- [x] Reject scriptable elements, event attributes, forms, frames, unsafe URL schemes, CSS URLs, and unsupported image sources.
- [x] Read clipboard image items and route them to the currently selected insertion target; keep the file picker fallback.
- [x] Preserve external image URLs as URLs and inline clipboard image blobs as data URLs.
- [x] Set an upload/insertion size ceiling and show actionable errors without discarding the current document.
- [x] Add a source-HTML mode with a monospace editor, refresh-from-preview, and explicit apply-to-preview controls.
- [x] Accept `.html` files through the source/document picker; parse the document body and sanitize it before rendering.
- [x] Ensure edits to source `head`, CSS, scripts, and event attributes are never executed; the app regenerates its own HTML shell on export.

## Task 4: Add header/footer layout and A4 repeating page furniture

**Files:**
- Modify `DataSave.html` left settings panel, preview markup generation, export HTML CSS, and print CSS.

**Interfaces:**
- `state.pageFurniture.header` and `state.pageFurniture.footer` hold `enabled`, `text`, `image`, `imageMode`, `align`, `width`, `height`, and `repeat` values.
- `renderPageFurniture()` updates preview furniture and export structure.

- [x] Add independent show toggles for document title, subtitle, header, and footer.
- [x] Add header/footer text inputs, clipboard/file image insertion, remove-image controls, alignment choices, stretch/center/right/left placement, and dimension controls.
- [x] Implement print-only fixed page furniture with A4 page margins reserved so content does not overlap repeated header/footer.
- [x] Ensure preview shows first-page furniture and indicates repeat settings; exported HTML carries the same print settings.
- [x] Preserve long-content pagination and existing break-avoidance rules where possible.

## Task 5: Connect optional image uploads to configurable zi2.ir API

**Files:**
- Modify `DataSave.html` media settings and `MediaManager`.
- Modify `datasave-settings.example.json` with non-secret endpoint fields.
- Create `docs/superpowers/docs/zi2-upload-setup.md`.

**Interfaces:**
- Settings: `uploadEndpoint` (suggested default `https://zi2.ir/api/upload/upload.php` from the local rewrite rule; editable) and `uploadField` (fixed to `file` for the inspected handler).
- `MediaManager.upload(file)` POSTs `FormData` and returns `{url, shareUrl, id}` after validating the response.
- Response parsing supports the inspected PHP shape `success === true` and `data.upload.fileUrl`, while displaying a useful message for incompatible live responses.

- [x] Add an optional “Upload to zi2.ir” action and configurable endpoint field; prefill the locally documented rewrite route and treat hosted behavior as unconfirmed.
- [x] Send `FormData` using the configured field name; do not manually set multipart Content-Type.
- [x] Validate HTTP status, JSON shape, returned HTTPS URL, MIME, and configured file size before inserting the link.
- [x] Show a user-facing confirmation that the upload creates a public URL before the first upload in a session.
- [x] Handle CORS/preflight/network errors and preserve the original embedded image on failure.
- [x] Add guidance for deployed route discovery, anonymous upload configuration, file-origin CORS behavior, server upload limits, and a hosted-origin alternative.
- [x] Extend settings import to accept schema version 1 and the new version while never accepting or exporting secrets.

## Task 6: Add live document analytics

**Files:**
- Modify `DataSave.html` analytics panel and editor update hooks.

**Interfaces:**
- `DocumentAnalytics.measure(root)` returns `{lines, chars, charsNoSpaces, words, estimatedBytes, links, images, tables, headings}`.
- `DocumentAnalytics.render(metrics)` updates accessible metric labels.

- [x] Compute metrics from the editable document after source parse, rich paste, editor input, and undo/redo.
- [x] Count visible text lines, characters with/without whitespace, words, links, images, tables, and heading elements.
- [x] Label byte count as an estimate and calculate it from UTF-8 encoded text/content without implying it is the final exported file size.

## Task 7: Add named exports and synchronize output paths

**Files:**
- Modify `DataSave.html` export manager, dialogs, and output builders.

**Interfaces:**
- `ExportManager.save(name, blob)` uses `showSaveFilePicker` when available and falls back to a named browser download.
- `ExportManager.buildMarkdown()` serializes supported content and image/link URLs.
- `ExportManager.buildHTML()` serializes sanitized content plus page furniture and print styles.

- [x] Ask for a filename before HTML and Markdown export and normalize extension safely.
- [x] Use Save As path selection when available; handle cancellation without creating a file; fall back to browser download otherwise.
- [x] Keep PDF output in the print dialog and identify Save as PDF as the user-selectable file destination.
- [x] Ensure HTML carries rich formatting, page furniture, print A4 settings, and embedded or external images.
- [x] Ensure Markdown output includes supported text structure, links, images, headings, lists, and tables with documented limitations for rich-only styling.
- [x] Keep email export behavior coherent with sanitized rich content and omit editor-only controls.

## Task 8: Consolidate settings and perform requested-scope review

**Files:**
- Modify `DataSave.html` settings import/export and user help text.
- Modify `datasave-settings.example.json`.
- Update `docs/superpowers/docs/zi2-upload-setup.md` if live API configuration findings change.

**Interfaces:**
- JSON settings schema version 2 includes appearance, page furniture, and upload endpoint/field configuration; it excludes credentials and document content.
- Version 1 settings remain importable with defaults for new fields.

- [x] Validate every imported setting by type, range, and endpoint protocol; reject malformed files without partially changing state.
- [x] Update the example JSON with the suggested endpoint and `file` field name.
- [x] Review feature coverage against every section of the approved design and correct gaps.
- [ ] Manually inspect key flows in the intended browser if available; do not claim external API upload works until the actual deployed route/CORS response is confirmed.

## Review Notes

- The `xi2-php` folder has multiple local snapshots. The inspected handler reads `$_FILES['file']` and returns `data.upload.fileUrl`, while its API guide describes a different field name and URL layout. Production endpoint must be confirmed before upload can be considered connected.
- The local `public/.htaccess` rewrites `/api/...` to `/src/api/...`, but the upload handler builds `fileUrl` by stripping `/src/api/upload/upload.php` from `REQUEST_URI`; a rewritten request can therefore return a malformed URL. The client includes a narrowly scoped path correction, and the deployed response still requires confirmation.
- `zi2.ir` could not be reached with the available web reader, so the plan keeps the endpoint configurable and makes no assumption about its current public route.
- This workspace is not a Git repository; commits are not part of this plan.
