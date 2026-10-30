// Table -> chart popover: choose type and column(s), preview, insert an SVG figure after the table.
import { store } from '../core/store.js';
import { el } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { CHART_TYPES, extractChartData, renderChart, chartPalette } from '../content/chart.js';
import { sanitizeToFragment } from '../content/sanitize.js';
import { THEME_COLORS } from '../export/html.js';
import { markChanged } from '../editor/preview.js';

export const tableRows = (table) => Array.from(table.rows).map((tr) => Array.from(tr.cells).map((c) => (c.textContent || '').trim()));
export const chartableData = (table) => extractChartData(tableRows(table));

let pop = null;
export function closeChartPopover() {
  pop?.remove();
  pop = null;
  document.removeEventListener('keydown', onKey, true);
  document.removeEventListener('mousedown', onOutside, true);
}
const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), closeChartPopover());
const onOutside = (e) => pop && !pop.contains(e.target) && !e.target.closest?.('.blocktools') && closeChartPopover();

/** SVG figure fragment for the current accent colour. */
export function chartFragment(opts) {
  const accent = (THEME_COLORS[store.get('theme')] || THEME_COLORS.navy)[0];
  const svg = renderChart({ ...opts, palette: chartPalette(accent) });
  return sanitizeToFragment(`<figure class="chart">${svg}</figure>`);
}

export function openChartPopover(table, anchor) {
  closeChartPopover();
  const data = chartableData(table);
  if (!data) return notify('این جدول ستون عددی ندارد؛ ستون اول باید برچسب باشد و دست‌کم یک ستون فقط عدد داشته باشد.');
  let type = 'bar';
  const chosen = new Set([0]);
  const view = el('div', { class: 'cp-view', 'aria-hidden': 'true' });
  const typeBtns = CHART_TYPES.map(([id, label]) => el('button', { type: 'button', class: 'cp-type', 'aria-pressed': String(id === type), text: label, onclick: () => { type = id; sync(); } }));
  const colBox = el('div', { class: 'cp-cols', role: 'group', 'aria-label': 'ستون‌های عددی' });
  const checks = data.series.map((s, i) => {
    const cb = el('input', { type: 'checkbox', id: 'cpc' + i, ...(i === 0 ? { checked: '' } : {}) });
    cb.addEventListener('change', () => {
      if (cb.checked) chosen.add(i);
      else chosen.delete(i);
      if (!chosen.size) (chosen.add(i), (cb.checked = true));
      if (type === 'pie' && cb.checked) [...chosen].forEach((j) => j !== i && chosen.delete(j));
      sync();
    });
    colBox.append(el('label', { class: 'check' }, cb, ' ' + s.name));
    return cb;
  });
  const options = () => ({ type, data, series: [...chosen].sort((a, b) => a - b) });
  function sync() {
    typeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(CHART_TYPES[i][0] === type)));
    if (type === 'pie' && chosen.size > 1) {
      const first = Math.min(...chosen);
      chosen.clear();
      chosen.add(first);
    }
    checks.forEach((cb, i) => (cb.checked = chosen.has(i)));
    view.replaceChildren(chartFragment(options()));
  }
  const insert = el('button', { type: 'button', class: 'btn primary', text: 'درج نمودار', onclick: () => {
    table.after(chartFragment(options()));
    closeChartPopover();
    markChanged();
    notify('نمودار بعد از جدول درج شد.');
  } });
  pop = el('div', { class: 'popover chart-pop', role: 'dialog', 'aria-label': 'نمودار از جدول' },
    el('strong', { text: 'نمودار از جدول' }),
    el('div', { class: 'cp-types', role: 'group', 'aria-label': 'نوع نمودار' }, ...typeBtns),
    colBox, view,
    el('div', { class: 'cp-actions' }, insert, el('button', { type: 'button', class: 'btn', text: 'انصراف', onclick: closeChartPopover })),
  );
  document.body.append(pop);
  sync();
  const w = Math.min(360, window.innerWidth - 16);
  pop.style.width = w + 'px';
  const r = anchor || table.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
  pop.style.left = left + 'px';
  pop.style.top = Math.max(8, Math.min(window.innerHeight - pop.offsetHeight - 8, r.top + 36)) + 'px';
  insert.focus();
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('mousedown', onOutside, true);
}
