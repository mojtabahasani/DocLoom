import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, extractChartData, renderChart, fmtNum, chartPalette } from '../src/js/content/chart.js';

test('parseNumber: Latin, Persian and Arabic-Indic digits', () => {
  assert.deepEqual(parseNumber('1234'), { value: 1234, percent: false });
  assert.equal(parseNumber('۱۲۳۴').value, 1234);
  assert.equal(parseNumber('١٢٣٤').value, 1234);
});
test('parseNumber: thousand separators , ٬ ، and decimal ٫ .', () => {
  assert.equal(parseNumber('1,234,567').value, 1234567);
  assert.equal(parseNumber('۱٬۲۳۴٬۵۶۷').value, 1234567);
  assert.equal(parseNumber('۱،۲۳۴').value, 1234);
  assert.equal(parseNumber('۳٫۵').value, 3.5);
  assert.equal(parseNumber('1,234.5').value, 1234.5);
  assert.equal(parseNumber('-12').value, -12);
  assert.equal(parseNumber('−۱۲').value, -12);
});
test('parseNumber: percent and zero-width / spaces', () => {
  assert.deepEqual(parseNumber('۴۵٪'), { value: 45, percent: true });
  assert.deepEqual(parseNumber('12.5 %'), { value: 12.5, percent: true });
  assert.equal(parseNumber(' ۱ ۲۳۴ ').value, 1234);
});
test('parseNumber: rejects words, mixed, malformed grouping, empty', () => {
  for (const s of ['abc', '12 تومان', '1,23', '12,3456', '1.2.3', '', '  ', '--1', 'x1', '1e5']) assert.equal(parseNumber(s), null, s);
});

const rows = [
  ['ماه', 'فروش', 'سود', 'توضیح', 'رشد'],
  ['فروردین', '۱٬۲۰۰', '300', 'خوب', '۱۰٪'],
  ['اردیبهشت', '1,500', '', 'عالی', '۲۰٪'],
  ['خرداد', '٢٠٠٠', '450', '', ''],
];
test('extractChartData: labels, numeric columns kept, non-numeric skipped, % detected', () => {
  const d = extractChartData(rows);
  assert.deepEqual(d.labels, ['فروردین', 'اردیبهشت', 'خرداد']);
  assert.deepEqual(d.series.map((s) => s.name), ['فروش', 'سود', 'رشد']);
  assert.deepEqual(d.series[0].values, [1200, 1500, 2000]);
  assert.deepEqual(d.series[1].values, [300, 0, 450]); // empty cell -> 0
  assert.equal(d.series[2].percent, true);
  assert.deepEqual(d.series.map((s) => s.col), [1, 2, 4]);
});
test('extractChartData: no numeric column / too few rows -> null', () => {
  assert.equal(extractChartData([['a', 'b'], ['x', 'y']]), null);
  assert.equal(extractChartData([['a', 'b']]), null);
  assert.equal(extractChartData([['a', 'b'], ['x', '1'], ['y', 'bad']]), null);
});

test('fmtNum: Persian digits with grouping', () => {
  assert.equal(fmtNum(1234567), '۱٬۲۳۴٬۵۶۷');
  assert.equal(fmtNum(3.456), '۳٫۴۶');
  assert.equal(fmtNum(45, true), '۴۵٪');
});

test('renderChart: bar / line / pie are safe, self-contained SVG; x axis is left to right', () => {
  const d = extractChartData(rows);
  for (const type of ['bar', 'line', 'pie']) {
    const svg = renderChart({ type, data: d, series: [0, 1], palette: chartPalette('#1c5263') });
    assert.ok(svg.startsWith('<svg class="chart-svg"') && svg.endsWith('</svg>'), type);
    assert.ok(/direction:ltr/.test(svg));
    assert.ok(!/<script|on\w+=|href=|<image|<use|foreignObject/i.test(svg), type);
    assert.ok(svg.includes('#1c5263'));
    assert.ok(svg.includes('فروردین') || type === 'pie' ? true : false);
  }
  const bar = renderChart({ type: 'bar', data: d, series: [0] });
  const xs = [...bar.matchAll(/<text x="([\d.]+)"[^>]*text-anchor="middle">(فروردین|اردیبهشت|خرداد)</g)].map((m) => [Number(m[1]), m[2]]);
  assert.deepEqual(xs.map((x) => x[1]), ['فروردین', 'اردیبهشت', 'خرداد']);
  assert.ok(xs[0][0] < xs[1][0] && xs[1][0] < xs[2][0], 'first row is at the LEFT');
  const line = renderChart({ type: 'line', data: d, series: [0] });
  const pts = line.match(/points="([^"]+)"/)[1].split(' ').map((p) => Number(p.split(',')[0]));
  assert.ok(pts[0] < pts[1] && pts[1] < pts[2]);
});
test('renderChart: text is escaped, pie uses a single series, no series throws', () => {
  const d = { labels: ['<b>&"x'], series: [{ name: 'a', col: 1, values: [5], percent: false }, { name: 'b', col: 2, values: [3], percent: false }] };
  const svg = renderChart({ type: 'pie', data: d, series: [0, 1] });
  assert.ok(svg.includes('&lt;b&gt;&amp;&quot;x') && !svg.includes('<b>'));
  assert.equal((svg.match(/<circle/g) || []).length, 1); // one slice = full circle
  assert.throws(() => renderChart({ type: 'bar', data: d, series: [9] }));
});

test('pie legend: the percent sign stays after the number (bidi-isolated), not before the label', () => {
  const d = extractChartData([['ماه', 'فروش'], ['فروردین', '25.53'], ['اردیبهشت', '74.47']]);
  const svg = renderChart({ type: 'pie', data: d, series: [0] });
  assert.match(svg, /فروردین  ·  ⁦[^<]*٪⁩</);
  assert.doesNotMatch(svg, /٪فروردین/);
});
