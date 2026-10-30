// Content analytics panel.
import { $, el, raf } from '../core/dom.js';
import { store } from '../core/store.js';
import { analyze } from '../content/analytics.js';
import { preview, plainText } from '../editor/preview.js';

export function initMetrics() {
  const box = $('#metrics');
  const update = raf(() => {
    const vals = analyze({
      text: plainText(),
      htmlBytes: new TextEncoder().encode(preview.innerHTML).length,
      links: preview.querySelectorAll('a').length,
      images: preview.querySelectorAll('img').length,
      tables: preview.querySelectorAll('table').length,
      headings: preview.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
    });
    box.replaceChildren(...vals.map(([label, value]) => el('div', { class: 'metric' }, el('b', { text: String(value) }), ' ' + label)));
  });
  store.on('content', update);
  update();
}
