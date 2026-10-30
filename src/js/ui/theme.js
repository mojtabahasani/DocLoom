// App light / dark / system theme. Persistence lives in library/prefs.js (IndexedDB settings store).
import { store } from '../core/store.js';

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
  if (!VALID.includes(store.get('appTheme'))) store.set('appTheme', 'system');
  store.on('appTheme', apply);
  apply(store.get('appTheme'));
  document.querySelectorAll('[data-app-theme]').forEach((b) =>
    b.addEventListener('click', () => store.set('appTheme', b.dataset.appTheme)),
  );
}
