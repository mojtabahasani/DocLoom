// Turn a raw sheet into a canonical statement. Pure: no DOM, no state.
//
// Banks disagree about everything: which row the header sits on (0, 2 or 9 in the files measured),
// what the columns are called, and what order they come in — Refah's "DynamicReport" lists them
// backwards. So nothing is addressed by position; the header is found by scoring, and columns are
// matched by name. A bank nobody has seen before therefore still works.
import { cleanText, parseAmount, parseBankDate, parseTime, isBlankRow } from './normalize.js';

/** Canonical fields, most specific pattern first — «شناسه واریز» must not match «واریز». */
const FIELDS = [
  ['payId', /^شناسه/],
  ['track', /پیگیری/],
  ['doc', /شماره\s*(سند|سریال)|^سند$/],
  ['sheba', /شبا/],
  ['srcAccount', /(مبدا|مبدأ)/],
  ['dstAccount', /مقصد/],
  ['account', /شماره\s*(حساب|کارت)|^حساب$/],
  ['cheque', /چک|فیش/],
  ['branch', /شعبه/],
  ['kind', /نوع\s*تراکنش/],
  ['channel', /کانال/],
  ['note', /یادداشت/],
  ['desc2', /^شرح\s*[۲2]$/],
  ['deposit', /^واریز$|بستانکار|^وار$/],
  ['withdraw', /^برداشت$|بدهکار|^بر$/],
  ['balance', /مانده|موجودی/],
  ['date', /تاریخ/],
  ['time', /^زمان$|^ساعت$/],
  ['desc', /^شرح$|^توضیحات$|^شرح\s*تراکنش$|^بابت$/],
  ['n', /^ردیف$|^#$|^شماره$/],
];

/** Columns that make a sheet look like a bank statement at all. */
const SIGNALS = ['تاریخ', 'واریز', 'برداشت', 'مانده', 'موجودی', 'شرح', 'توضیحات', 'بدهکار', 'بستانکار'];

const key = (v) => cleanText(v).replace(/‌/g, ' ').replace(/\s+/g, ' ').trim();

export function matchField(header) {
  const h = key(header);
  if (!h) return null;
  for (const [field, re] of FIELDS) if (re.test(h)) return field;
  return null;
}

/**
 * Find the header row by counting how many statement-ish column names it holds.
 * Returns { index, score } with index -1 when the sheet is not a statement.
 */
// Refah's longest preamble puts the header on row 15, so the scan has to reach well past it.
export function findHeaderRow(rows, { scan = 30 } = {}) {
  let best = { index: -1, score: 0 };
  const limit = Math.min(rows.length, scan);
  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] || []).map(key).filter(Boolean);
    if (cells.length < 3) continue;
    const score = SIGNALS.filter((s) => cells.some((c) => c.includes(s))).length;
    // A later row only wins on a strictly better score, so the topmost real header is kept.
    if (score > best.score) best = { index: i, score };
  }
  return best.score >= 3 ? best : { index: -1, score: best.score };
}

/** header row -> { field: columnIndex } plus the unmapped columns, kept for the "extra columns" list. */
export function mapColumns(headerRow) {
  const map = {};
  const extras = [];
  (headerRow || []).forEach((cell, i) => {
    const label = key(cell);
    if (!label) return;
    const field = matchField(label);
    if (field && map[field] === undefined) map[field] = i;
    else extras.push({ index: i, label });
  });
  return { map, extras };
}

const META = [
  ['holder', /نام\s*مشتر[یي]|^نام$/],
  ['account', /شماره\s*حساب/],
  ['accountType', /نوع\s*حساب/],
  ['branch', /شعبه/],
  ['currency', /نوع\s*ارز/],
  ['from', /از\s*تار[یي]خ/],
  ['to', /تا\s*تار[یي]خ/],
  ['alias', /نام\s*مستعار/],
];

/**
 * Account details printed above the table. Saderat spreads them over two merged rows and omits
 * the colons ("شماره حساب 0107863686001"); Refah writes "نام مشتري : مجتبی حسنی شماره حساب : …"
 * all in one cell. Both shapes are read here.
 */
export function readMeta(rows, headerIndex) {
  const out = {};
  const seen = new Set();
  const take = (label, value) => {
    const v = cleanText(value).replace(/^[:：\s-]+/, '').trim();
    if (!v || v === '-') return;
    for (const [field, re] of META) {
      if (re.test(label) && !out[field]) { out[field] = v; return; }
    }
  };
  for (let i = 0; i < Math.max(0, headerIndex); i++) {
    for (const cell of rows[i] || []) {
      const text = cleanText(cell);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      // One cell can carry several "label : value" pairs in a row.
      const re = /(نام\s*مشتر[یي]|نام\s*مستعار|شماره\s*حساب|نوع\s*حساب|نوع\s*ارز|از\s*تار[یي]خ|تا\s*تار[یي]خ|شعبه|نام)\s*:?\s*/g;
      const hits = [...text.matchAll(re)];
      if (!hits.length) continue;
      hits.forEach((h, k) => {
        const start = h.index + h[0].length;
        const end = k + 1 < hits.length ? hits[k + 1].index : text.length;
        take(h[1], text.slice(start, end));
      });
    }
  }
  return out;
}

const TOTAL_RE = /جمع|مجموع|total/i;

/**
 * parseStatement(rows) -> { ok, reason?, headerIndex, columns, extras, meta, records, dropped }
 * `records` keep their source row index so the UI can point at the original line.
 */
export function parseStatement(rows, { sort = 'asc' } = {}) {
  const header = findHeaderRow(rows);
  if (header.index < 0) {
    return { ok: false, reason: 'no-header', headerIndex: -1, columns: {}, extras: [], meta: {}, records: [], dropped: { blank: 0, total: 0 } };
  }
  const headerRow = rows[header.index] || [];
  const { map, extras } = mapColumns(headerRow);
  const meta = readMeta(rows, header.index);

  const records = [];
  const dropped = { blank: 0, total: 0 };
  for (let i = header.index + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (isBlankRow(row)) { dropped.blank++; continue; }
    const at = (field) => (map[field] === undefined ? null : row[map[field]]);
    // A «جمع کل» line is a summary, not a transaction: drop it and recompute instead.
    const looksTotal = TOTAL_RE.test(cleanText(at('desc')) + ' ' + cleanText(row[0]) + ' ' + cleanText(row[1]));
    const date = parseBankDate(at('date'));
    if (looksTotal && !date) { dropped.total++; continue; }

    const rec = {
      source: i,
      date,
      time: parseTime(at('time')),
      deposit: parseAmount(at('deposit')) || 0,
      withdraw: parseAmount(at('withdraw')) || 0,
      balance: parseAmount(at('balance')),
      desc: cleanText(at('desc')),
      desc2: cleanText(at('desc2')),
      doc: cleanText(at('doc')),
      track: cleanText(at('track')),
      branch: cleanText(at('branch')),
      kind: cleanText(at('kind')),
      channel: cleanText(at('channel')),
      note: cleanText(at('note')),
      payId: cleanText(at('payId')),
      cheque: cleanText(at('cheque')),
      sheba: cleanText(at('sheba')),
      account: cleanText(at('account')),
      extra: Object.fromEntries(extras.map((e) => [e.label, cleanText(row[e.index])])),
    };
    // A row with no date and no money in it is noise, not a transaction.
    if (!rec.date && !rec.deposit && !rec.withdraw && rec.balance === null) { dropped.blank++; continue; }
    records.push(rec);
  }

  // An account number repeated on every single row belongs in the header, not in a column.
  if (map.account !== undefined && records.length > 1) {
    const first = records[0].account;
    if (first && records.every((r) => r.account === first)) {
      if (!meta.account) meta.account = first;
      delete map.account;
      for (const r of records) r.account = '';
    }
  }

  const sourceDir = sourceDirection(records);
  if (sort !== 'none') orderRecords(records, sort, sourceDir);
  return { ok: true, headerIndex: header.index, columns: map, extras, meta, records, dropped, sourceDir };
}

/** Was the file written newest-first? Compared on the first and last row that carry a date. */
export function sourceDirection(records) {
  const dated = records.filter((r) => r.date);
  if (dated.length < 2) return 'asc';
  return dated[0].date.key > dated[dated.length - 1].date.key ? 'desc' : 'asc';
}

/**
 * Order by date then time. Ties matter: a transaction and its fee share a timestamp to the second,
 * so in a newest-first file the fee is listed *before* the transaction it belongs to. Flipping the
 * tiebreaker for such files is what keeps the running balance consistent.
 * Rows without a date keep their original position relative to each other.
 */
export function orderRecords(records, dir = 'asc', sourceDir = null) {
  const sign = dir === 'desc' ? -1 : 1;
  const tie = (sourceDir || sourceDirection(records)) === 'desc' ? -1 : 1;
  const stamp = (r) => (r.date ? r.date.key * 1000000 + timeNum(r.time) : null);
  records.sort((a, b) => {
    const x = stamp(a);
    const y = stamp(b);
    if (x === null || y === null) return a.source - b.source;
    return x === y ? tie * (a.source - b.source) : sign * (x - y);
  });
  return records;
}

const timeNum = (t) => {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t || '');
  return m ? +m[1] * 3600 + +m[2] * 60 + (+m[3] || 0) : 0;
};

/** Totals recomputed from the rows we kept — never trusted from the bank's own «جمع کل». */
export function summarize(records) {
  const withDate = records.filter((r) => r.date);
  const deposit = records.reduce((s, r) => s + (r.deposit || 0), 0);
  const withdraw = records.reduce((s, r) => s + (r.withdraw || 0), 0);
  const balances = records.filter((r) => r.balance !== null);
  const first = balances[0];
  const last = balances[balances.length - 1];
  return {
    count: records.length,
    deposit,
    withdraw,
    net: deposit - withdraw,
    opening: first ? first.balance - (first.deposit || 0) + (first.withdraw || 0) : null,
    closing: last ? last.balance : null,
    from: withDate.length ? withDate.reduce((a, r) => (r.date.key < a.date.key ? r : a)).date : null,
    to: withDate.length ? withDate.reduce((a, r) => (r.date.key > a.date.key ? r : a)).date : null,
  };
}

/**
 * Fee lines (کارمزد) are separate transactions in every bank here, which roughly doubles the row
 * count. Merging folds a fee into the transaction it belongs to: same date, same tracking number
 * (or adjacent), and the fee is the smaller of the two.
 */
export function mergeFees(records) {
  const out = [];
  const isFee = (r) => /کارمزد/.test(r.desc) || /کارمزد/.test(r.kind);
  for (const r of records) {
    const prev = out[out.length - 1];
    // Pair on the tracking number when the bank gives one, otherwise on an identical timestamp.
    const sameTxn =
      prev &&
      isFee(r) &&
      !isFee(prev) &&
      r.date && prev.date && r.date.key === prev.date.key &&
      (r.track || prev.track ? r.track === prev.track : !!r.time && r.time === prev.time);
    if (sameTxn) {
      prev.fee = (prev.fee || 0) + r.withdraw + r.deposit;
      prev.withdraw += r.withdraw;
      prev.deposit += r.deposit;
      if (r.balance !== null) prev.balance = r.balance;
      continue;
    }
    out.push({ ...r });
  }
  return out;
}
