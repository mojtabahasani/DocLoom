// Wiring only: initialise modules in dependency order.
import { initGuard } from './core/guard.js';
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

initGuard();
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
initShortcuts();
