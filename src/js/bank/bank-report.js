// Statement -> MD2Html Markdown. Pure: no DOM, no state.
// Markdown rather than HTML on purpose: once it is in the source box, the brand letterhead,
// print layout, PDF, Word and the chart button all work on it like any other document.
import { faAmount, toFaDigits } from './normalize.js';
import { mergeFees as foldFees, summarize } from './bank-table.js';

/** Printable columns. `main` ones are on by default — the five that fit an A4 portrait page. */
export const COLUMNS = [
  { id: 'n', label: 'ردیف', align: 'left', main: false },
  { id: 'date', label: 'تاریخ', align: 'center', main: true },
  { id: 'time', label: 'ساعت', align: 'center', main: false },
  { id: 'desc', label: 'شرح', align: '', main: true },
  { id: 'kind', label: 'نوع تراکنش', align: '', main: false },
  { id: 'deposit', label: 'واریز', align: 'left', main: true },
  { id: 'withdraw', label: 'برداشت', align: 'left', main: true },
  { id: 'balance', label: 'مانده', align: 'left', main: true },
  { id: 'doc', label: 'شماره سند', align: 'left', main: false },
  { id: 'track', label: 'پیگیری', align: 'left', main: false },
  { id: 'branch', label: 'شعبه', align: '', main: false },
  { id: 'channel', label: 'کانال', align: '', main: false },
  { id: 'payId', label: 'شناسه', align: 'left', main: false },
  { id: 'sheba', label: 'شبا', align: 'left', main: false },
  { id: 'note', label: 'یادداشت', align: '', main: false },
];

export const defaultColumns = () => COLUMNS.filter((c) => c.main).map((c) => c.id);

/** Columns that actually carry something in these records — the rest are hidden by default. */
export function usefulColumns(records, chosen = defaultColumns()) {
  return chosen.filter((id) => {
    if (id === 'n') return true;
    if (id === 'date') return records.some((r) => r.date);
    if (id === 'deposit' || id === 'withdraw') return records.some((r) => r[id]);
    if (id === 'balance') return records.some((r) => r.balance !== null);
    if (id === 'desc') return records.some((r) => describe(r) !== '');
    return records.some((r) => String(r[id] ?? '').trim() !== '');
  });
}

const MONEY = new Set(['deposit', 'withdraw', 'balance']);
const DASH = '—';
// A pipe inside a cell would start a new column, and a newline would end the row.
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();

/**
 * What to print in the «شرح» column. Saderat puts a bare document number there and keeps the
 * readable label in «نوع تراکنش», so fall back to the label when the description says nothing.
 */
export function describe(rec) {
  // Banks leave dangling separators where a field was empty: "- واریزپایا", "خرید - ".
  const trim = (s) => String(s ?? '').replace(/^[\s\-–—·:]+/, '').replace(/[\s\-–—·:]+$/, '').trim();
  const desc = trim(rec.desc);
  const kind = trim(rec.kind);
  const useless = !desc || /^[\d\s/-]+$/.test(desc);
  if (useless && kind) return kind;
  if (kind && desc && !desc.includes(kind)) return `${kind} — ${desc}`;
  return desc;
}

function value(rec, id, { digits, index }) {
  if (id === 'n') return toFaDigits(index + 1);
  if (id === 'desc') return describe(rec);
  if (id === 'date') return rec.date ? (digits === 'fa' ? toFaDigits(rec.date.text) : rec.date.text) : '';
  if (id === 'time') return digits === 'fa' ? toFaDigits(rec.time) : rec.time;
  if (MONEY.has(id)) {
    const v = rec[id];
    if (id === 'balance') return v === null ? '' : faAmount(v, { digits });
    return v ? faAmount(v, { digits }) : DASH;
  }
  return rec[id] ?? '';
}

/**
 * Keep rows inside a Jalali range and above a minimum movement.
 * `minAmount` is what hides the 700-rial fee lines when they are not wanted.
 */
export function filterRecords(records, { from = null, to = null, minAmount = 0 } = {}) {
  return records.filter((r) => {
    if (from && (!r.date || r.date.key < from)) return false;
    if (to && (!r.date || r.date.key > to)) return false;
    if (minAmount > 0 && Math.max(r.deposit || 0, r.withdraw || 0) < minAmount) return false;
    return true;
  });
}

const BANKS = [
  [/کشاورزی|keshavarzi/i, 'کشاورزی'],
  [/رفاه|refah/i, 'رفاه'],
  [/صادرات|saderat/i, 'صادرات'],
  [/ملت|mellat/i, 'ملت'],
  [/ملی|melli/i, 'ملی'],
  [/تجارت|tejarat/i, 'تجارت'],
  [/سپه|sepah/i, 'سپه'],
  [/پاسارگاد|pasargad/i, 'پاسارگاد'],
  [/پارسیان|parsian/i, 'پارسیان'],
  [/سامان|saman/i, 'سامان'],
  [/آینده|ayandeh/i, 'آینده'],
  [/بلو|blu/i, 'بلو'],
];

/** Guess the bank from the file name or the sheet name; '' when nothing matches. */
export function guessBank(...hints) {
  const text = hints.filter(Boolean).join(' ');
  for (const [re, name] of BANKS) if (re.test(text)) return name;
  return '';
}

/**
 * buildReport({ statement, options }) -> { title, markdown, rows }
 * options: { columns, digits:'fa'|'latin', mergeFees, from, to, minAmount, summary, totalRow,
 *            bank, title, unit }
 */
export function buildReport({ statement, options = {} }) {
  const o = {
    columns: defaultColumns(),
    digits: 'fa',
    mergeFees: false,
    from: null,
    to: null,
    minAmount: 0,
    summary: true,
    totalRow: true,
    bank: '',
    title: '',
    unit: 'ریال',
    // The app sets the document title instead, so the brand cover carries it and the «#» heading
    // would only repeat it. Standalone Markdown keeps the heading.
    heading: true,
    ...options,
  };
  const base = o.mergeFees ? foldFees(statement.records) : statement.records;
  const rows = filterRecords(base, o);
  const cols = usefulColumns(rows, o.columns).map((id) => COLUMNS.find((c) => c.id === id)).filter(Boolean);
  const sum = summarize(rows);
  const meta = statement.meta || {};
  const num = (n) => faAmount(n, { digits: o.digits });
  const date = (d) => (d ? (o.digits === 'fa' ? toFaDigits(d.text) : d.text) : '');

  const title = o.title || `صورت‌حساب بانک ${o.bank || meta.bank || ''}`.trim();
  const out = [];
  if (o.heading) {
    out.push(`# ${title}`);
    out.push('');
  }

  const facts = [];
  if (meta.holder) facts.push(`**نام:** ${meta.holder}`);
  if (meta.account) facts.push(`**شماره حساب:** ${o.digits === 'fa' ? toFaDigits(meta.account) : meta.account}`);
  if (meta.branch) facts.push(`**شعبه:** ${meta.branch}`);
  if (meta.accountType) facts.push(`**نوع حساب:** ${meta.accountType}`);
  const period = sum.from && sum.to ? `**بازه:** ${date(sum.from)} تا ${date(sum.to)}` : '';
  const count = `**تعداد تراکنش:** ${o.digits === 'fa' ? toFaDigits(rows.length) : rows.length}`;
  if (facts.length) out.push(facts.join(' · '));
  out.push([period, count].filter(Boolean).join(' · '));
  out.push('');

  if (o.summary) {
    const parts = [
      `جمع واریز **${num(sum.deposit)}** ${o.unit}`,
      `جمع برداشت **${num(sum.withdraw)}** ${o.unit}`,
      `خالص **${num(sum.net)}** ${o.unit}`,
    ];
    if (sum.opening !== null) parts.push(`مانده ابتدای دوره **${num(sum.opening)}**`);
    if (sum.closing !== null) parts.push(`مانده پایان دوره **${num(sum.closing)}**`);
    out.push(`> [!نکته] ${parts.join(' · ')}`);
    out.push('');
  }

  if (cols.length && rows.length) {
    out.push('| ' + cols.map((c) => cell(c.label)).join(' | ') + ' |');
    out.push('|' + cols.map((c) => (c.align === 'left' ? '---:' : c.align === 'center' ? ':---:' : '---')).join('|') + '|');
    rows.forEach((rec, index) => {
      out.push('| ' + cols.map((c) => cell(value(rec, c.id, { digits: o.digits, index }))).join(' | ') + ' |');
    });
    if (o.totalRow) {
      out.push(
        '| ' +
          cols
            .map((c, i) => {
              if (c.id === 'deposit') return `**${num(sum.deposit)}**`;
              if (c.id === 'withdraw') return `**${num(sum.withdraw)}**`;
              if (i === 0) return '**جمع کل**';
              return '';
            })
            .join(' | ') +
          ' |',
      );
    }
    out.push('');
  } else {
    out.push('تراکنشی برای نمایش نیست.');
    out.push('');
  }

  return {
    title,
    markdown: out.join('\n'),
    rows,
    summary: sum,
    columns: cols.map((c) => c.id),
  };
}

/**
 * Monthly deposit/withdraw totals as a table MD2Html's chart button can turn into a bar chart
 * (first column labels, every other column entirely numeric — unit in the header).
 */
export function monthlyTable(records, { unit = 'میلیون ریال', scale = 1e6, digits = 'fa' } = {}) {
  const months = new Map();
  for (const r of records) {
    if (!r.date) continue;
    const k = `${r.date.y}/${String(r.date.m).padStart(2, '0')}`;
    const m = months.get(k) || { deposit: 0, withdraw: 0 };
    m.deposit += r.deposit || 0;
    m.withdraw += r.withdraw || 0;
    months.set(k, m);
  }
  if (!months.size) return '';
  const fmt = (n) => {
    const v = Math.round((n / scale) * 10) / 10;
    return digits === 'fa' ? toFaDigits(String(v)).replace(/\./g, '٫') : String(v);
  };
  const lines = [
    `| ماه | واریز (${unit}) | برداشت (${unit}) |`,
    '|---|---:|---:|',
    ...[...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, m]) =>
      `| ${digits === 'fa' ? toFaDigits(k) : k} | ${fmt(m.deposit)} | ${fmt(m.withdraw)} |`,
    ),
  ];
  return lines.join('\n');
}
