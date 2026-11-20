// Wiring only: initialise modules in dependency order.
import { initGuard } from './core/guard.js';
import { placeToolbarControls, initDocCrumb } from './ui/toolbar-move.js';
import { store } from './core/store.js';
import { initPrefs } from './library/prefs.js';
import { initTheme } from './ui/theme.js';
import { initPreview } from './editor/preview.js';
import { initSource } from './editor/source.js';
import { initImages } from './editor/images.js';
import { initFileInput, registerSheetHandler } from './editor/files.js';
import { initBankImport } from './bank/bank-ui.js';
import { initSabaImport } from './saba/saba-ui.js';
import { initPaste } from './editor/paste.js';
import { initToolbar } from './editor/toolbar.js';
import { initPanels } from './ui/panels.js';
import { initSettings } from './ui/settings.js';
import { initMetrics } from './ui/metrics.js';
import { initTopbar } from './ui/topbar.js';
import { initShortcuts } from './ui/shortcuts.js';
import { registerCommands } from './ui/commands.js';
import { preview } from './editor/preview.js';
import { initLibrary, library } from './library/library.js';
import { initLibraryUI } from './library/library-ui.js';
import { initSync } from './server/sync.js';
import { initServerUI } from './server/server-ui.js';
import { initLinked, openFromUrl, activateLinked } from './server/linked.js';
import { initFilesUI, openFiles } from './server/files-ui.js';
import { initExportDest } from './server/files-export.js';
import { initPwa } from './pwa/register.js';
import { isRenderMode, runRender } from './server/render-mode.js';
import { initBatchUI } from './server/batch-ui.js';
import { initShareUI } from './server/share-ui.js';
import { initTasks } from './editor/tasks.js';
import { initBlockTools } from './editor/blocktools.js';
import { initToc } from './ui/toc-panel.js';
import { initDrawers } from './ui/drawer.js';
import { initLang } from './ui/lang.js';
import { initSuggest } from './ui/suggest.js';
import { initBrands } from './brand/brands.js';
import { initBrandUI } from './brand/brand-ui.js';
import { initLetterUI } from './brand/letter-ui.js';
import { initLayers } from './brand/layers-ui.js';
import { registerSmartCommands, initSmartButtons } from './ui/commands-smart.js';
import { embedConfig } from './core/embed-config.js';
import { initEmbed } from './embed/embed.js';

// Embed mode (window.DOCLOOM_EMBED): without the global every flag is on and `active` is false.
const EMBED = embedConfig();

async function main() {
  placeToolbarControls(); // before anything binds by id: the controls start life in a <template>
  initGuard();
  await initPrefs(); // opens IndexedDB, loads settings, migrates the old localStorage theme
  initTheme();
  initPreview();
  initSource();
  initImages();
  initFileInput();
  initBankImport(registerSheetHandler); // spreadsheets open the bank-statement importer
  initSabaImport(registerSheetHandler); // .fp3 opens the Saba / FastReport importer
  initPaste();
  initToolbar();
  initPanels();
  initSettings();
  initMetrics();
  initTopbar();
  initDocCrumb(store);
  initShortcuts({ preview });
  registerCommands();
  registerSmartCommands();
  initTasks();
  initBlockTools();
  initToc();
  initSuggest();
  initSmartButtons();
  await initBrands(); // before the library opens a document: brands seed on first run
  if (isRenderMode()) return runRender(); // headless Chrome (server PDF): build the page from the server and stop
  initBrandUI();
  initLetterUI();
  initLayers();
  if (EMBED.library) {
    initLibrary();
    initLibraryUI();
    await library.start(); // reopen the last document
  }
  if (EMBED.server) initServerUI();
  if (!EMBED.active) initPwa(); // the host page owns installation and file launching
  if (EMBED.server) {
    initLinked({ openFiles });
    initFilesUI();
    initExportDest();
    initBatchUI();
    initShareUI();
  }
  if (EMBED.active) initEmbed();
  initDrawers(); // after embed: a group's count must not include a tool embed mode just hid
  initLang();
  if (await initSync()) {
    activateLinked();
    await openFromUrl();
  } // no-op (and no network) unless served by the DocLoom server
}

main().catch((e) => console.error('DocLoom failed to start', e));
