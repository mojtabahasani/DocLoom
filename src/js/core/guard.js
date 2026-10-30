// Warn before closing the tab while the draft has unsaved changes (native beforeunload prompt).
import { store } from './store.js';

const onUnload = (e) => {
  e.preventDefault();
  e.returnValue = '';
};

export function initGuard() {
  store.on('dirty', (dirty) => {
    if (dirty) window.addEventListener('beforeunload', onUnload);
    else window.removeEventListener('beforeunload', onUnload);
  });
}
