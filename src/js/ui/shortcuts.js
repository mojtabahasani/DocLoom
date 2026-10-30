// Keyboard shortcuts. (⌘K palette arrives in package 1B and registers itself here.)
import { preview, undo, redo } from '../editor/preview.js';

export function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    if (!preview.contains(e.target) && e.target !== preview) return;
    e.preventDefault();
    if (k === 'z' && !e.shiftKey) undo();
    else redo();
  });
}
