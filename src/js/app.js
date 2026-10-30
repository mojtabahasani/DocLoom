// Wiring only: initialise modules in dependency order.
import { initGuard } from './core/guard.js';
import { initPrefs } from './library/prefs.js';
import { initTheme } from './ui/theme.js';
import { initPreview } from './editor/preview.js';
import { initSource } from './editor/source.js';
import { initImages } from './editor/images.js';
import { initFileInput } from './editor/files.js';
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
import { initPwa } from './pwa/register.js';
import { initTasks } from './editor/tasks.js';
import { initBlockTools } from './editor/blocktools.js';
import { initToc } from './ui/toc-panel.js';
import { initSuggest } from './ui/suggest.js';
import { registerSmartCommands, initSmartButtons } from './ui/commands-smart.js';

async function main() {
  initGuard();
  await initPrefs(); // opens IndexedDB, loads settings, migrates the old localStorage theme
  initTheme();
  initPreview();
  initSource();
  initImages();
  initFileInput();
  initPaste();
  initToolbar();
  initPanels();
  initSettings();
  initMetrics();
  initTopbar();
  initShortcuts({ preview });
  registerCommands();
  registerSmartCommands();
  initTasks();
  initBlockTools();
  initToc();
  initSuggest();
  initSmartButtons();
  initLibrary();
  initLibraryUI();
  await library.start(); // reopen the last document
  initPwa();
}

main().catch((e) => console.error('MD2Html failed to start', e));
