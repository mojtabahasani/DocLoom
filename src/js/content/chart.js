// Charts from tables. Pure: numeric extraction (Persian / Arabic-Indic digits, separators, %) and SVG string rendering.
// The x axis of bar and line charts always runs LEFT -> RIGHT (first row at the left); the SVG is forced to direction:ltr.
import { toFaDigits } from './persian.js';
import { localSeparators, percentSign } from '../core/digits.js';
import { escapeHTML } from './markdown.js';

export const CHART_TYPES = [
  ['bar', 'میله‌ای'],
  ['line', 'خطی'],
  ['pie', 'دایره‌ای'],
];

const DIGIT_MAP = { '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9, '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9 };

/** '۱٬۲۳۴٫۵' / '12%' / '1,234' -> { value, percent } or null. */
export function parseNumber(text) {
  let t = String(text ?? '').replace(/[\s‌‎‏ ]/g, '');
  if (!t) return null;
  let percent = false;
  if (/[%٪]$/.test(t)) {
    percent = true;
    t = t.slice(0, -1);
  }
  t = t
    .replace(/[۰-۹٠-٩]/g, (d) => DIGIT_MAP[d])
    .replace(/[٬،]/g, ',')
    .replace(/٫/g, '.')
    .replace(/^[−–]/, '-');
  if (!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(t)) return null;
  const value = Number(t.replace(/,/g, ''));
  return Number.isFinite(value) ? { value, percent } : null;
}

/**
 * rows: string[][] with the header row first. The first column holds the labels;
 * a column is a data series only when every non-empty cell in it is numeric.
 * Returns { labels, series: [{ name, col, values, percent }] } or null.
 */
export function extractChartData(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const [head, ...body] = rows;
  const width = Math.max(...rows.map((r) => r.length));
  const series = [];
  for (let c = 1; c < width; c++) {
    const cells = body.map((r) => parseNumber(r[c]));
    const filled = body.filter((r) => String(r[c] ?? '').trim() !== '');
    if (!filled.length || filled.some((r) => parseNumber(r[c]) === null)) continue;
    series.push({
      name: String(head[c] ?? '').trim() || `ستون ${toFaDigits(c)}`,
      col: c,
      values: cells.map((n) => (n ? n.value : 0)),
      percent: cells.filter(Boolean).every((n) => n.percent),
    });
  }
  if (!series.length) return null;
  return { labels: body.map((r) => String(r[0] ?? '').trim()), series };
}

/** Theme accent first, then fixed companions. */
export const chartPalette = (accent = '#1c5263') => [accent, '#d9922b', '#3d7fc4', '#8c63b3', '#c4524a', '#4e9a73', '#6b7a74'];

export function fmtNum(n, percent = false) {
  const r = Math.round(n * 100) / 100;
  const [i, f] = String(Math.abs(r)).split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const s = (r < 0 ? '-' : '') + grouped + (f ? '.' + f : '');
  return localSeparators(toFaDigits(s)) + (percent ? percentSign() : '');
}

const W = 640;
const H = 340;
const INK = '#51625f';
const GRID = '#dfe6e2';
const num = (n) => String(Math.round(n * 10) / 10);
const clip = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s);

function niceTicks(min, max) {
  if (max === min) max = min + 1;
  const raw = (max - min) / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

function legend(names, colors, x0, y) {
  let x = x0;
  let out = '';
  names.forEach((n, i) => {
    const label = clip(n, 18);
    out += `<rect x="${num(x)}" y="${y - 9}" width="11" height="11" rx="2" fill="${colors[i % colors.length]}"/>`;
    out += `<text x="${num(x + 16)}" y="${y}" font-size="11" fill="${INK}" text-anchor="start">${escapeHTML(label)}</text>`;
    x += 28 + label.length * 6.4;
  });
  return out;
}

function axisChart(type, data, sel, colors) {
  const ser = sel.map((i) => data.series[i]);
  const n = data.labels.length;
  const L = 62;
  const R = 16;
  const T = ser.length > 1 ? 40 : 22;
  const B = 56;
  const pw = W - L - R;
  const ph = H - T - B;
  const all = ser.flatMap((s) => s.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const y = (v) => T + ph - ((v - lo) / (hi - lo)) * ph;
  const slot = pw / n;
  const pct = ser.every((s) => s.percent);
  let g = '';
  for (const t of ticks) {
    g += `<line x1="${L}" y1="${num(y(t))}" x2="${W - R}" y2="${num(y(t))}" stroke="${t === 0 ? '#9fb0a8' : GRID}" stroke-width="1"/>`;
    g += `<text x="${L - 8}" y="${num(y(t) + 4)}" font-size="11" fill="${INK}" text-anchor="end">${fmtNum(t, pct)}</text>`;
  }
  const rotate = slot < 46;
  const maxChars = rotate ? 14 : Math.max(3, Math.floor(slot / 6.4));
  data.labels.forEach((lab, i) => {
    const cx = L + slot * (i + 0.5);
    const ty = H - B + 18;
    g += rotate
      ? `<text x="${num(cx)}" y="${ty}" font-size="11" fill="${INK}" text-anchor="end" transform="rotate(-35 ${num(cx)} ${ty})">${escapeHTML(clip(lab, maxChars))}</text>`
      : `<text x="${num(cx)}" y="${ty}" font-size="11" fill="${INK}" text-anchor="middle">${escapeHTML(clip(lab, maxChars))}</text>`;
  });
  const showVals = n * ser.length <= 14;
  if (type === 'bar') {
    const gw = slot * 0.72;
    const bw = gw / ser.length;
    ser.forEach((s, si) => {
      s.values.forEach((v, i) => {
        const x = L + slot * i + (slot - gw) / 2 + bw * si;
        const y0 = y(Math.max(v, 0));
        const h = Math.max(1, Math.abs(y(v) - y(0)));
        g += `<rect x="${num(x + 1)}" y="${num(y0)}" width="${num(Math.max(1, bw - 2))}" height="${num(h)}" rx="2" fill="${colors[si % colors.length]}"/>`;
        if (showVals) g += `<text x="${num(x + bw / 2)}" y="${num(v >= 0 ? y0 - 5 : y0 + h + 12)}" font-size="10" fill="${INK}" text-anchor="middle">${fmtNum(v, s.percent)}</text>`;
      });
    });
  } else {
    ser.forEach((s, si) => {
      const col = colors[si % colors.length];
      const pts = s.values.map((v, i) => `${num(L + slot * (i + 0.5))},${num(y(v))}`);
      g += `<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      s.values.forEach((v, i) => {
        g += `<circle cx="${num(L + slot * (i + 0.5))}" cy="${num(y(v))}" r="3.6" fill="${col}" stroke="#ffffff" stroke-width="1.5"/>`;
        if (showVals) g += `<text x="${num(L + slot * (i + 0.5))}" y="${num(y(v) - 9)}" font-size="10" fill="${INK}" text-anchor="middle">${fmtNum(v, s.percent)}</text>`;
      });
    });
  }
  if (ser.length > 1) g += legend(ser.map((s) => s.name), colors, L, 16);
  return g;
}

function pieChart(data, sel, colors) {
  const s = data.series[sel[0]];
  const vals = s.values.map(Math.abs);
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  const cx = 170;
  const cy = H / 2;
  const r = 118;
  let a0 = -Math.PI / 2;
  let g = '';
  vals.forEach((v, i) => {
    if (v <= 0) return;
    const a1 = a0 + (v / total) * Math.PI * 2;
    const col = colors[i % colors.length];
    if (v / total > 0.9999) g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}" stroke="#ffffff" stroke-width="2"/>`;
    else {
      const p = (a) => `${num(cx + r * Math.cos(a))} ${num(cy + r * Math.sin(a))}`;
      g += `<path d="M${cx} ${cy} L${p(a0)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)} Z" fill="${col}" stroke="#ffffff" stroke-width="2"/>`;
    }
    a0 = a1;
  });
  const rows = data.labels.slice(0, 12);
  rows.forEach((lab, i) => {
    const yy = 52 + i * 24;
    g += `<rect x="340" y="${yy - 10}" width="12" height="12" rx="2" fill="${colors[i % colors.length]}"/>`;
    g += `<text x="360" y="${yy}" font-size="12" fill="${INK}" text-anchor="start">${escapeHTML(clip(lab, 20))}  ·  \u2066${fmtNum((vals[i] / total) * 100, true)}\u2069</text>`;
  });
  if (data.labels.length > 12) g += `<text x="360" y="${52 + 12 * 24}" font-size="12" fill="${INK}" text-anchor="start">…</text>`;
  return g;
}

/**
 * renderChart({ type:'bar'|'line'|'pie', data, series:[indexes into data.series], palette, title }) -> SVG string
 * (only elements/attributes the sanitizer whitelists for charts).
 */
export function renderChart({ type = 'bar', data, series = [0], palette = chartPalette(), title = '' }) {
  const sel = (type === 'pie' ? series.slice(0, 1) : series).filter((i) => data.series[i]);
  if (!sel.length) throw new Error('no series');
  const names = sel.map((i) => data.series[i].name).join('، ');
  const label = `${CHART_TYPES.find((t) => t[0] === type)?.[1] || ''}: ${title || names}`;
  const body = type === 'pie' ? pieChart(data, sel, palette) : axisChart(type, data, sel, palette);
  return (
    `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHTML(label)}" style="width:100%;max-width:${W}px;height:auto;direction:ltr">` +
    `<title>${escapeHTML(label)}</title>${body}</svg>`
  );
}
