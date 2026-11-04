// A reconstructed FastReport table -> MD2Html Markdown. Pure: no DOM, no state.
// Same reasoning as the bank importer: emit Markdown, and the brand letterhead, print layout,
// PDF, Word and the chart button all work on the result.
import { cleanText, parseAmount, faAmount, toFaDigits } from '../bank/normalize.js';
import { isPersian } from '../content/cleanup.js';
import { buildTable, pruneEmpty } from './fp3-table.js';

/** «بد» / «بس» is the debit-or-credit marker; FastReport leaves its column unlabelled. */
const BALANCE_SIDE = /^(بد|بس)$/;
function inferLabel(column, values) {
  if (column.label) return column.label;
  const filled = values.filter(Boolean);
  if (filled.length && filled.every((v) => BALANCE_SIDE.test(v))) return 'تشخیص';
  return '';
}

// A pipe would open a new cell and a newline would end the row.
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();

/**
 * buildSabaReport({ xml | table, options }) -> { title, markdown, table }
 * options: { digits:'fa'|'latin', heading, columns (indexes to keep), meta, notes, totals, title }
 */
export function buildSabaReport({ xml, table, options = {} }) {
  const o = { digits: 'fa', heading: true, meta: true, notes: true, totals: true, title: '', columns: null, ...options };
  const t = table || pruneEmpty(buildTable(xml));
  const keep = o.columns ? t.columns.map((_, i) => o.columns.includes(i)) : t.columns.map(() => true);
  const cols = t.columns.filter((_, i) => keep[i]);
  const rows = t.rows.map((r) => r.filter((_, i) => keep[i]));
  // Persian digits and separators, but only where they belong: a Latin product name keeps its
  // own digits, so «CPU AMD RYZEN 7800 X3D» does not come back as «RYZEN ۷۸۰۰ X۳D».
  const fa = (v) => {
    const s = String(v);
    if (o.digits !== 'fa') return s;
    if (/[A-Za-z]/.test(s) && !isPersian(s)) return s;
    return toFaDigits(s).replace(/,/g, '٬');
  };

  const labels = cols.map((c, i) => inferLabel(c, rows.map((r) => r[i])));
  const title = o.title || t.title || 'گزارش';

  const out = [];
  if (o.heading) {
    out.push(`# ${title}`);
    out.push('');
  }
  if (o.meta && t.meta.length) {
    out.push(t.meta.map((p) => `**${p.label}:** ${fa(p.value)}`).join(' · '));
    out.push('');
  }
  if (o.notes && t.notes.length) {
    for (const n of t.notes) {
      out.push(fa(n));
      out.push('');
    }
  }

  if (cols.length && rows.length) {
    out.push('| ' + labels.map(cell).join(' | ') + ' |');
    out.push('|' + cols.map((c) => (c.numeric ? '---:' : c.align === 'center' ? ':---:' : '---')).join('|') + '|');
    for (const r of rows) {
      out.push(
        '| ' +
          r
            .map((v, i) => {
              if (!cols[i].money) return cell(fa(v)); // codes and counts keep their plain form
              const n = parseAmount(v);
              return cell(n === null ? fa(v) : faAmount(n, { digits: o.digits }));
            })
            .join(' | ') +
          ' |',
      );
    }
    out.push('');
  } else {
    out.push('ردیفی برای نمایش نیست.');
    out.push('');
  }

  if (o.totals && t.totals.length) {
    out.push(`> [!نکته] ${t.totals.map((p) => `${p.label}: **${fa(p.value)}**`).join(' · ')}`);
    out.push('');
  }

  return { title, markdown: out.join('\n'), table: { ...t, columns: cols, rows }, labels };
}

/**
 * Totals for the money columns, recomputed from the rows.
 * Only money columns: adding up document numbers or row counts produces nonsense, and the
 * source itself tells us which is which (see `moneyColumn` in fp3-table.js).
 */
export function columnTotals(table) {
  return table.columns
    .map((c, i) => {
      if (!c.money) return null;
      const nums = table.rows.map((r) => parseAmount(r[i])).filter((n) => n !== null);
      if (!nums.length) return null;
      return { index: i, label: cleanText(c.label), sum: nums.reduce((a, b) => a + b, 0) };
    })
    .filter(Boolean);
}
