// The printed bank statement, as HTML rather than Markdown. Pure: no DOM, no state.
//
// Markdown cannot do what this page needs: a date with its clock stacked under it, a
// description in 6.5px, and per-cell colour for the three money columns. So this builds the
// markup directly — every class is on the sanitizer's whitelist and styled in
// styles/statement.css, which the export embeds too, so print and PDF look the same.
//
// The layout is fixed on purpose. رج, زمان and the three money columns have set widths and
// «شرح عملیات» takes everything that is left.
import { escapeHTML } from '../content/markdown.js';
import { faAmount, toFaDigits } from './normalize.js';
import { summarize, mergeFees } from './bank-table.js';
import { classify, describeCompact, groupTotals, GROUPS } from './kinds.js';
import { filterRecords } from './bank-report.js';

const e = escapeHTML;
const DASH = '—';

/** Latin product names and reference codes keep their own digits; Persian text does not. */
const fa = (s, digits) => (digits === 'fa' ? toFaDigits(String(s)) : String(s));

function row(rec, index, { digits }) {
  const k = classify(rec);
  const date = rec.date ? fa(rec.date.text, digits) : '';
  const time = rec.time ? fa(rec.time, digits) : '';
  const money = (v, cls) =>
    `<td class="${cls}">${v ? e(faAmount(v, { digits })) : DASH}</td>`;
  return (
    `<tr${k.cls ? ` class="${k.cls}"` : ''}>` +
    `<td class="s-n">${e(fa(index + 1, digits))}</td>` +
    `<td class="s-when"><span class="s-date">${e(date)}</span>${time ? `<span class="s-time">${e(time)}</span>` : ''}</td>` +
    `<td class="s-desc">${e(describeCompact(rec, k))}</td>` +
    money(rec.deposit, 's-in') +
    money(rec.withdraw, 's-out') +
    `<td class="s-bal">${rec.balance === null ? '' : e(faAmount(rec.balance, { digits }))}</td>` +
    '</tr>'
  );
}

/**
 * Chips naming the tints that appear in this statement, each with how many lines and how much
 * money the group moved — the count alone does not say whether a group matters.
 */
export function legendHTML(records, { digits = 'fa' } = {}) {
  const totals = groupTotals(records);
  if (totals.size < 2) return '';
  const money = (t) => {
    const both = t.in > 0 && t.out > 0;
    if (both) return `+${faAmount(t.in, { digits })} −${faAmount(t.out, { digits })}`;
    return faAmount(t.in || t.out, { digits });
  };
  const chips = [...totals.entries()]
    .sort((a, b) => Math.max(b[1].in, b[1].out) - Math.max(a[1].in, a[1].out))
    .map(
      ([g, t]) =>
        `<span class="${GROUPS[g].cls}">${e(GROUPS[g].label)} <b>${e(toFaDigits(t.count))}</b>` +
        `<small>${e(money(t))}</small></span>`,
    )
    .join('');
  return `<div class="stmt-legend">${chips}</div>`;
}

/**
 * buildStatementHTML({ statement, options }) -> { title, html, rows, summary }
 * options: { digits:'fa'|'latin', sort:'asc'|'desc', mergeFees, from, to, minAmount,
 *            bank, title, unit, summary, legend, totalRow }
 */
export function buildStatementHTML({ statement, options = {} }) {
  const o = {
    digits: 'fa',
    sort: 'asc',
    mergeFees: false,
    from: null,
    to: null,
    minAmount: 0,
    bank: '',
    title: '',
    unit: 'ریال',
    summary: true,
    legend: true,
    totalRow: true,
    ...options,
  };
  const base = o.mergeFees ? mergeFees(statement.records) : statement.records;
  const rows = filterRecords(base, o);
  // parseStatement hands them over oldest-first; newest-first is a display choice.
  const ordered = o.sort === 'desc' ? [...rows].reverse() : rows;
  const sum = summarize(rows);
  const meta = statement.meta || {};
  const num = (n) => faAmount(n, { digits: o.digits });
  const date = (d) => (d ? fa(d.text, o.digits) : '');
  const title = o.title || `صورت‌حساب بانک ${o.bank || ''}`.trim();

  const out = [];
  const facts = [];
  if (meta.holder) facts.push(`<b>نام:</b> ${e(meta.holder)}`);
  if (meta.account) facts.push(`<b>شماره حساب:</b> ${e(fa(meta.account, o.digits))}`);
  if (meta.branch) facts.push(`<b>شعبه:</b> ${e(meta.branch)}`);
  if (meta.accountType) facts.push(`<b>نوع حساب:</b> ${e(meta.accountType)}`);
  const period = sum.from && sum.to ? `<b>بازه:</b> ${e(date(sum.from))} تا ${e(date(sum.to))}` : '';
  const count = `<b>تعداد تراکنش:</b> ${e(fa(ordered.length, o.digits))}`;
  if (facts.length) out.push(`<p>${facts.join(' · ')}</p>`);
  out.push(`<p>${[period, count].filter(Boolean).join(' · ')}</p>`);

  if (o.summary) {
    const parts = [
      `جمع واریز <b>${e(num(sum.deposit))}</b> ${e(o.unit)}`,
      `جمع برداشت <b>${e(num(sum.withdraw))}</b> ${e(o.unit)}`,
      `خالص <b>${e(num(sum.net))}</b> ${e(o.unit)}`,
    ];
    if (sum.opening !== null) parts.push(`مانده ابتدای دوره <b>${e(num(sum.opening))}</b>`);
    if (sum.closing !== null) parts.push(`مانده پایان دوره <b>${e(num(sum.closing))}</b>`);
    out.push(`<aside class="callout callout-note"><span class="callout-title">نکته</span><p>${parts.join(' · ')}</p></aside>`);
  }
  if (o.legend) out.push(legendHTML(ordered, { digits: o.digits }));

  if (ordered.length) {
    const head =
      '<thead><tr>' +
      ['رج', 'زمان', 'شرح عملیات', 'واریز', 'برداشت', 'مانده']
        .map((h, i) => `<th class="${['s-n', 's-when', 's-desc', 's-in', 's-out', 's-bal'][i]}">${e(h)}</th>`)
        .join('') +
      '</tr></thead>';
    const body = '<tbody>' + ordered.map((r, i) => row(r, i, o)).join('') + '</tbody>';
    const foot = o.totalRow
      ? '<tfoot><tr>' +
        '<td class="s-n"></td><td class="s-when"><b>جمع کل</b></td><td class="s-desc"></td>' +
        `<td class="s-in">${e(num(sum.deposit))}</td>` +
        `<td class="s-out">${e(num(sum.withdraw))}</td>` +
        `<td class="s-bal">${sum.closing === null ? '' : e(num(sum.closing))}</td>` +
        '</tr></tfoot>'
      : '';
    out.push(`<table class="stmt">${head}${body}${foot}</table>`);
  } else out.push('<p>تراکنشی برای نمایش نیست.</p>');

  return { title, html: out.join('\n'), rows: ordered, summary: sum };
}
