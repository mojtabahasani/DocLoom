// Toast notifications, optionally with an action button (e.g. "Undo" / "برگردان").
import { el } from './dom.js';
import { store } from './store.js';
import { localizeToast, localizeToastAction } from './i18n.js';

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

/** notify('message') or notify('message', { action: { label, run }, duration }) */
export function notify(text, opts = {}) {
  const h = ensureHost();
  const lang = store.get?.('lang') || 'en';
  h.dir = lang === 'fa' ? 'rtl' : 'ltr';
  const { action, duration = action ? 8000 : 3000 } = opts;
  h.replaceChildren(el('span', { class: 'status-text', text: localizeToast(text, lang) }));
  h.classList.toggle('has-action', !!action);
  if (action) {
    h.append(
      el('button', {
        type: 'button',
        class: 'status-action',
        text: localizeToastAction(action.label, lang),
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
