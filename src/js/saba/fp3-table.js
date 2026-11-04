// Rebuilding a table from a FastReport layout. Pure: no DOM, no state.
//
// FastReport has no notion of a table — it paints boxes at coordinates. So the columns are
// recovered from the geometry: the data band's memos, right-to-left, are the columns, and a
// header-band memo becomes a column's title when it sits above that column and is about the
// same width (which is what keeps a page-wide title from being mistaken for a column heading).
// Labels ending in «:» are paired with the box immediately to their left, which is how the
// invoices carry «کدمشتري:» and its value.
import { cleanText, parseAmount } from '../bank/normalize.js';
import { readFp3, dataBand, bandColumns, cellMap, allInstances } from './fp3.js';

const span = (m) => [m.left, m.left + m.width];
const overlap = (a, b) => {
  const [a0, a1] = span(a);
  const [b0, b1] = span(b);
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
};
const sameRow = (a, b) => Math.abs(a.top - b.top) < Math.max(a.height, b.height, 10) * 0.8;
const isLabel = (s) => /[:：]\s*$/.test(s);
const stripLabel = (s) => s.replace(/\s*[:：]\s*$/, '').trim();
/** «کاربر: مجتبی حسنی» already carries its own label, so it is nobody else's value. */
const selfLabelled = (s) => /\S[:：]\s+\S/.test(s);

/**
 * Header memos sit in rows; only one of those rows is the column heading — the others are the
 * report title, the page number and the like. Pick the row that titles the most columns.
 */
function headerRow(memos, cols) {
  if (!memos.length) return memos;
  const groups = new Map();
  for (const m of memos) {
    const near = [...groups.keys()].find(([b, t]) => b === m.band && Math.abs(t - m.top) < Math.max(m.height, 10) * 0.8);
    const key = near || [m.band, m.top];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  let best = null;
  for (const group of groups.values()) {
    const candidates = group.filter((m) => !isLabel(m.text));
    const taken = new Set();
    let hits = 0;
    for (const c of cols) {
      const h = matchHeader(c, candidates.filter((m) => !taken.has(m.i)));
      if (h) {
        taken.add(h.i);
        hits++;
      }
    }
    if (!best || hits > best.hits) best = { hits, group: candidates };
  }
  return best && best.hits >= 2 ? best.group : memos;
}

/** The first printed instance of each band, by band index. */
function firstInstances(doc) {
  const out = new Map();
  for (const inst of allInstances(doc)) if (!out.has(inst.band)) out.set(inst.band, inst);
  return out;
}

/**
 * A header memo belongs to a column when it sits over it and is not far wider — a report title
 * stretched across the page overlaps several columns completely, so width is the discriminator.
 */
export function matchHeader(column, candidates) {
  let best = null;
  for (const h of candidates) {
    if (h.width > column.width * 2.5 + 20) continue;
    const ov = overlap(column, h);
    if (ov <= 0) continue;
    const ratio = ov / Math.min(column.width, h.width || 1);
    if (ratio < 0.5) continue;
    // Prefer the better overlap, then the narrower (more specific) box.
    if (!best || ratio > best.ratio + 0.01 || (Math.abs(ratio - best.ratio) <= 0.01 && h.width < best.h.width)) {
      best = { h, ratio };
    }
  }
  return best ? best.h : null;
}

/** «برچسب:» paired with the box immediately to its left on the same line. */
export function labelPairs(memos, values) {
  const pairs = [];
  const used = new Set();
  for (const m of memos) {
    const text = cleanText(values.get(m.i) ?? '');
    if (!text || !isLabel(text)) continue;
    let best = null;
    for (const c of memos) {
      if (c === m || used.has(c.i)) continue;
      const v = cleanText(values.get(c.i) ?? '');
      if (!v || isLabel(v) || selfLabelled(v)) continue;
      if (!sameRow(m, c)) continue;
      const gap = m.left - (c.left + c.width);
      if (gap < -2 || gap > 60) continue;
      if (!best || gap < best.gap) best = { c, v, gap };
    }
    if (best) {
      used.add(best.c.i);
      pairs.push({ label: stripLabel(text), value: best.v });
    }
  }
  return pairs;
}

const MOSTLY = 0.6;
const numericColumn = (values) => {
  const filled = values.filter((v) => v !== '');
  if (!filled.length) return false;
  return filled.filter((v) => parseAmount(v) !== null).length / filled.length >= MOSTLY;
};
/**
 * Money or a bare number? FastReport already decided: it prints money with a thousands separator
 * (DisplayFormat "#,") and leaves codes and counts alone. Honouring that keeps a product code
 * like 27227 from being re-rendered as «۲۷٬۲۲۷».
 */
const moneyColumn = (values) => {
  const filled = values.filter((v) => v !== '');
  if (!filled.length) return false;
  return filled.filter((v) => /[,٬،]/.test(v)).length / filled.length >= MOSTLY;
};

/**
 * buildTable(xmlOrDoc) ->
 *   { ok, title, columns:[{label, numeric, align, width}], rows:[[text]], meta:[{label,value}],
 *     notes:[string], totals:[{label,value}], bandName, dropped }
 */
export function buildTable(input) {
  const doc = typeof input === 'string' ? readFp3(input) : input;
  const dataIndex = dataBand(doc);
  const firsts = firstInstances(doc);

  // ---- rows ----
  const cols = dataIndex ? bandColumns(doc, dataIndex) : [];
  const rows = [];
  if (dataIndex) {
    for (const inst of allInstances(doc)) {
      if (inst.band !== dataIndex) continue;
      const v = cellMap(inst);
      rows.push(cols.map((c) => cleanText(v.get(c.i) ?? '')));
    }
  }

  // ---- column titles, from any band printed above the rows ----
  const headerBands = doc.bands.filter((b) => b.i !== dataIndex && (b.kind === 'header' || b.kind === 'title' || b.kind === 'group'));
  const headerMemos = [];
  for (const b of headerBands) {
    const inst = firsts.get(b.i);
    if (!inst) continue;
    const v = cellMap(inst);
    for (const m of doc.memos.filter((x) => x.band === b.i)) {
      const text = cleanText(v.get(m.i) ?? '');
      if (text) headerMemos.push({ ...m, text });
    }
  }
  const titles = headerRow(headerMemos, cols);
  const takenHeaders = new Set();
  const columns = cols.map((c, i) => {
    const h = matchHeader(c, titles.filter((m) => !takenHeaders.has(m.i) && !isLabel(m.text)));
    if (h) takenHeaders.add(h.i);
    const values = rows.map((r) => r[i]);
    const numeric = numericColumn(values);
    return {
      label: h ? h.text : '',
      numeric,
      money: numeric && moneyColumn(values),
      align: numeric ? 'left' : c.align === 'haCenter' ? 'center' : '',
      width: c.width,
      memo: c.i,
    };
  });

  // ---- everything else on the page: label/value pairs, then loose notes ----
  const meta = [];
  const notes = [];
  const seen = new Set();
  const collect = (kinds, into) => {
    for (const b of doc.bands.filter((x) => x.i !== dataIndex && kinds.includes(x.kind))) {
      const inst = firsts.get(b.i);
      if (!inst) continue;
      const v = cellMap(inst);
      const memos = doc.memos.filter((x) => x.band === b.i);
      const pairs = labelPairs(memos, v);
      for (const p of pairs) {
        const key = p.label + '\u0000' + p.value;
        if (seen.has(key)) continue;
        seen.add(key);
        into.push(p);
      }
      const paired = new Set(pairs.flatMap((p) => [p.label, p.value]));
      for (const m of memos) {
        const text = cleanText(v.get(m.i) ?? '');
        if (!text || takenHeaders.has(m.i) || isLabel(text) || paired.has(text) || seen.has(text)) continue;
        if (m.width < 120) continue; // a stray short box is furniture, not a sentence
        seen.add(text);
        notes.push(text);
      }
    }
  };
  collect(['header', 'title', 'group'], meta);
  const totals = [];
  collect(['summary', 'footer'], totals);

  const title = notes.shift() || '';
  return {
    ok: rows.length > 0,
    title,
    columns,
    rows,
    meta,
    notes,
    totals,
    bandName: dataIndex ? doc.bands[dataIndex - 1].name : '',
    dropped: 0,
  };
}

/**
 * Drop columns that are empty in every row. A heading is not enough to keep one: a Saba invoice
 * prints «تخفیف», «کاهنده», «افزاینده» and «ارزش افزوده» whether or not they are used, and four
 * empty columns squeeze the real ones until their headings read one letter per line.
 */
export function pruneEmpty(table) {
  const keep = table.columns.map((c, i) => table.rows.some((r) => r[i] !== ''));
  return {
    ...table,
    columns: table.columns.filter((_, i) => keep[i]),
    rows: table.rows.map((r) => r.filter((_, i) => keep[i])),
    dropped: keep.filter((k) => !k).length,
  };
}

/**
 * A column whose every value is zero. Saba prints «بسته», «جزء» and «٪» on every invoice even
 * when they are unused; they are real columns, so they stay available, but the importer leaves
 * them switched off so the description column gets the width instead.
 */
export function isZeroColumn(table, i) {
  const values = table.rows.map((r) => r[i]).filter((v) => v !== '');
  if (!values.length) return true;
  return values.every((v) => parseAmount(v) === 0);
}
