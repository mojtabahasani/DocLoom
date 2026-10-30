// App light / dark / system theme. Persisted in localStorage for now (package 1B moves it to IndexedDB settings).
import { store } from '../core/store.js';

const KEY = 'md2html.appTheme';
const VALID = ['light', 'dark', 'system'];

function apply(mode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  document.querySelectorAll('[data-app-theme]').forEach((b) => {
    const on = b.dataset.appTheme === mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

export function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    /* storage blocked: stay on system */
  }
  store.set('appTheme', VALID.includes(saved) ? saved : 'system');
  store.on('appTheme', (mode) => {
    apply(mode);
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* ignore */
    }
  });
  apply(store.get('appTheme'));
  document.querySelectorAll('[data-app-theme]').forEach((b) =>
    b.addEventListener('click', () => store.set('appTheme', b.dataset.appTheme)),
  );
}
