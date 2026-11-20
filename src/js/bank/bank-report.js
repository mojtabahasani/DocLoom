// Shared pieces of the bank report: which rows go in, which bank it is, and the monthly
// roll-up. The printed table itself is built in statement-html.js — Markdown cannot express
// a stacked date and clock, a 6.5px description column or per-cell colour.
// Pure: no DOM, no state.
import { toFaDigits } from './normalize.js';

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
 * Monthly deposit/withdraw totals as a table DocLoom's chart button can turn into a bar chart
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
    ...[...months.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, m]) => `| ${digits === 'fa' ? toFaDigits(k) : k} | ${fmt(m.deposit)} | ${fmt(m.withdraw)} |`),
  ];
  return lines.join('\n');
}
