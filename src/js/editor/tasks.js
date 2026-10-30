// Clickable task-list items in the preview; the matching "- [ ]" line in the Markdown source follows.
import { store } from '../core/store.js';
import { preview, previewInSync, markChanged } from './preview.js';

const TASK_LINE = /^(\s*[-*+]\s+)\[([ xX])\](\s)/;

/** Toggle the n-th task line of a Markdown source (fenced code skipped). Returns the new source or null. */
export function toggleTaskInSource(src, index) {
  const lines = String(src).split('\n');
  let fence = null;
  let n = -1;
  for (let i = 0; i < lines.length; i++) {
    const f = lines[i].match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence || !TASK_LINE.test(lines[i])) continue;
    if (++n === index) {
      lines[i] = lines[i].replace(TASK_LINE, (m, a, mark, sp) => `${a}[${mark === ' ' ? 'x' : ' '}]${sp}`);
      return lines.join('\n');
    }
  }
  return null;
}

export function initTasks() {
  preview.addEventListener('click', (e) => {
    const li = e.target.closest?.('li.task');
    if (!li || !preview.contains(li)) return;
    const rect = li.getBoundingClientRect();
    const cs = getComputedStyle(li);
    const dist = cs.direction === 'rtl' ? rect.right - e.clientX : e.clientX - rect.left;
    if (dist > parseFloat(cs.fontSize) * 2) return; // only the checkbox area, not the text
    const all = Array.from(preview.querySelectorAll('li.task'));
    const synced = previewInSync();
    li.classList.toggle('task-done');
    if (synced) {
      const next = toggleTaskInSource(store.get('source'), all.indexOf(li));
      if (next !== null) store.set('source', next);
    }
    markChanged();
  });
}
