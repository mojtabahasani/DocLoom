// Interactive HTML export entry (browser glue). The builder itself is pure: see interactive-core.js.
import { store } from '../core/store.js';
import { watermarkExportHTML } from '../brand/watermark.js';
import { exportParts, EXPORT_STYLES } from './html.js';
import { renderInteractive } from './interactive-core.js';

export function buildInteractiveHTML(s = store.snapshot()) {
  const { main, accent, tint, font } = exportParts(s);
  return renderInteractive({ title: s.title, mainHTML: main.outerHTML, accent, tint, fontCss: font, css: EXPORT_STYLES, watermarkHTML: watermarkExportHTML(s.watermark) });
}
