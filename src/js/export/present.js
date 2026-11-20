// Presentation mode (in-app overlay) and standalone presentation export. Pure parts: present-core.js.
import { store } from '../core/store.js';
import { el } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { sanitizeChildren } from '../content/sanitize.js';
import { preview } from '../editor/preview.js';
import { embeddedFontCSS } from './html.js';
import { themeColors } from './theme.js';
import { saveAs, safeFilename } from './files.js';
import { splitSlides, renderPresentation } from './present-core.js';

function build(embedFont) {
  const s = store.snapshot();
  const root = document.createElement('div');
  root.append(sanitizeChildren(preview));
  const [accent, tint] = themeColors(s);
  return renderPresentation({ title: s.title, slides: splitSlides(root), accent, tint, fontCss: embedFont ? embeddedFontCSS() : '' });
}

let active = null;

export function startPresentation() {
  if (active) return;
  let html;
  try {
    html = build(true);
  } catch {
    return notify('ساخت ارائه ممکن نشد؛ سند دست‌نخورده است.');
  }
  const frame = el('iframe', { class: 'present-frame', title: 'حالت ارائه', srcdoc: html });
  const layer = el('div', { class: 'present-layer' }, frame);
  const stop = () => {
    window.removeEventListener('message', onMsg);
    document.removeEventListener('keydown', onKey, true);
    layer.remove();
    document.body.classList.remove('presenting');
    active = null;
  };
  const onMsg = (e) => e.data?.md2 === 'present-exit' && stop();
  const onKey = (e) => e.key === 'Escape' && (e.preventDefault(), stop());
  window.addEventListener('message', onMsg);
  document.addEventListener('keydown', onKey, true);
  frame.addEventListener('load', () => frame.contentWindow?.focus());
  document.body.classList.add('presenting');
  document.body.append(layer);
  active = { stop };
}

export async function exportPresentation() {
  let html;
  try {
    html = build(store.get('embedFontInExport'));
  } catch {
    return notify('ساخت فایل ارائه ممکن نشد؛ سند دست‌نخورده است.');
  }
  await saveAs(safeFilename((store.get('title') || 'docloom') + '-ارائه', 'html'), html, 'text/html;charset=utf-8', 'ارائهٔ HTML');
}
