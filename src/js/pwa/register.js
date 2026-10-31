// PWA glue. Everything here is a silent no-op on file:// (and in any context without the APIs).
import { loadSourceFile } from '../editor/files.js';
import { openLaunchedFile } from '../server/linked.js';

const isWeb = () => location.protocol === 'http:' || location.protocol === 'https:';

export function initPwa() {
  if (!isWeb()) return;
  // Files opened through the OS ("Open with" → installed app).
  if ('launchQueue' in window && typeof window.launchQueue.setConsumer === 'function') {
    window.launchQueue.setConsumer(async (params) => {
      const handle = params.files && params.files[0];
      if (!handle) return;
      try {
        await openLaunchedFile(await handle.getFile(), loadSourceFile);
      } catch {
        /* unreadable file: loadSourceFile already reports its own errors */
      }
    });
  }
  // Only the dist/pwa build declares a manifest; the single-file build must not request a service worker.
  if ('serviceWorker' in navigator && document.querySelector('link[rel="manifest"]')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
