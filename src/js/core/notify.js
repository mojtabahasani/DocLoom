// Toast notifications, optionally with an action button (e.g. "برگردان" / undo).
import { el } from './dom.js';

let host;
let timer;

function ensureHost() {
  if (host) return host;
  host = document.getElementById('status') || el('div', { id: 'status' });
  if (!host.isConnected) document.body.append(host);
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  return host;
}

/** notify('متن') or notify('متن', { action: { label, run }, duration }) */
export function notify(text, opts = {}) {
  const h = ensureHost();
  const { action, duration = action ? 8000 : 3000 } = opts;
  h.replaceChildren(el('span', { class: 'status-text', text }));
  h.classList.toggle('has-action', !!action);
  if (action) {
    h.append(
      el('button', {
        type: 'button',
        class: 'status-action',
        text: action.label,
        onclick: () => {
          hide();
          action.run();
        },
      }),
    );
  }
  h.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(hide, duration);
}

export function hide() {
  clearTimeout(timer);
  host?.classList.remove('show');
}
