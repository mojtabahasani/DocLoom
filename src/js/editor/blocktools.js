// UI-only block tools: a floating bar over code blocks (copy), tables (chart) and charts (remove).
// It lives outside the document, so nothing here can reach print, HTML export or e-mail.
import { el } from '../core/dom.js';
import { preview, markChanged } from './preview.js';
import { copyPlain } from '../export/files.js';
import { chartableData, openChartPopover } from '../ui/chart-ui.js';

let bar;
let target = null;
let timer;

function hide() {
  clearTimeout(timer);
  bar.hidden = true;
  target = null;
}
const later = () => {
  clearTimeout(timer);
  timer = setTimeout(hide, 450);
};

function pick(node) {
  const n = node.closest?.('pre,figure.chart,table');
  if (!n || !preview.contains(n)) return null;
  if (n.tagName === 'TABLE') return chartableData(n) ? { n, kind: 'table' } : null;
  return { n, kind: n.tagName === 'PRE' ? 'code' : 'chart' };
}

function show({ n, kind }) {
  clearTimeout(timer);
  if (target === n && !bar.hidden) return;
  target = n;
  const btn = (label, run, cls = '') => el('button', { type: 'button', class: 'bt ' + cls, text: label, onclick: run });
  bar.replaceChildren(
    kind === 'code' ? btn('کپی کد', (e) => { copyPlain(n.textContent || ''); e.currentTarget.textContent = 'کپی شد'; }) : null,
    kind === 'table' ? btn('نمودار', () => openChartPopover(n, bar.getBoundingClientRect())) : null,
    kind === 'chart' ? btn('حذف نمودار', () => { n.remove(); hide(); markChanged(); }, 'danger') : null,
  );
  bar.hidden = false;
  const r = n.getBoundingClientRect();
  const w = bar.offsetWidth;
  const left = kind === 'table' ? r.left + 6 : r.right - w - 8;
  const top = kind === 'table' ? r.top - bar.offsetHeight - 4 : r.top + 6;
  bar.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, left)) + 'px';
  bar.style.top = Math.max(8, Math.min(window.innerHeight - 40, top < 8 ? r.top + 4 : top)) + 'px';
}

export function initBlockTools() {
  bar = el('div', { class: 'blocktools', role: 'toolbar', 'aria-label': 'ابزار بلوک', hidden: true });
  document.body.append(bar);
  bar.addEventListener('pointerenter', () => clearTimeout(timer));
  bar.addEventListener('pointerleave', later);
  bar.addEventListener('mousedown', (e) => e.preventDefault());
  preview.addEventListener('pointerover', (e) => {
    const p = pick(e.target);
    if (p) show(p);
    else if (!bar.hidden) later();
  });
  preview.addEventListener('pointerleave', later);
  preview.addEventListener('click', (e) => {
    const p = pick(e.target); // touch: tapping a block shows its tools
    if (p) show(p);
  });
  document.addEventListener('selectionchange', () => {
    const a = getSelection()?.anchorNode;
    const p = a && a.nodeType && preview.contains(a) ? pick(a.nodeType === 1 ? a : a.parentElement) : null;
    if (p?.kind === 'table') show(p);
  });
  document.addEventListener('scroll', () => !bar.hidden && hide(), true);
  window.addEventListener('resize', hide);
}
