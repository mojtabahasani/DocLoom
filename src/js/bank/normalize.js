// Cleaning the junk that bank exports ship. Pure: no DOM, no state.
//
// Measured on real statements from Keshavarzi, Refah and Saderat:
//   up to 374 Arabic ي/ك per file, 856 bidi marks wrapped around times, amounts as text
//   with ASCII commas, and two-digit Jalali years ("05/05/11" for 1405/05/11).
import { isValidJalali, toJalali } from '../brand/jalali.js';

// LRM/RLM, the LRE…RLO embedding set, PDF, and the isolates — banks sprinkle these around times.
const BIDI = /[‎‏‪-‮⁦-⁩]/g;
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Persian/Arabic-Indic digits -> ASCII. */
export const toLatinDigits = (s) =>
  String(s).replace(/[۰-۹٠-٩]/g, (d) => {
    const i = FA_DIGITS.indexOf(d);
    return String(i < 0 ? AR_DIGITS.indexOf(d) : i);
  });

export const toFaDigits = (s) => String(s).replace(/\d/g, (d) => FA_DIGITS[+d]);

/** Strip bidi marks, fix Arabic ي/ك, collapse whitespace. Keeps ZWNJ: it is real Persian. */
export function cleanText(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(BIDI, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * "1,234" | "۱٬۲۳۴" | 1234 | "(1,234)" | "1.234,5" -> number, else null.
 * Bank amounts are integers in rials; a lone "." or "٫" is treated as a decimal point.
 */
export function parseAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  let s = cleanText(v);
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
  s = toLatinDigits(s).replace(/[٬٬،,\s]/g, '').replace(/٫/g, '.');
  if (/^[-−–]/.test(s)) { sign = -sign; s = s.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? sign * n : null;
}

/** Excel's serial day number -> {y,m,d} Jalali. Day 1 is 1900-01-01, with the 1900 leap-year bug. */
export function excelSerialToJalali(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null; // outside ~1954..2119: not a date
  const ms = Math.round((n - 25569) * 86400000); // 25569 = 1970-01-01
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Jalali date out of whatever the bank wrote: "1405/07/13", "05/05/11", "1405-07-13",
 * Persian digits, or an Excel serial. Returns { y, m, d, key, text } or null.
 * A two-digit year is read as 14xx — every Iranian bank export in circulation is 14xx.
 */
export function parseBankDate(v) {
  if (typeof v === 'number') {
    const j = excelSerialToJalali(v);
    return j ? withKey(j) : null;
  }
  const s = toLatinDigits(cleanText(v));
  if (!s) return null;
  const m = /^(\d{2,4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/.exec(s);
  if (!m) return null;
  let y = +m[1];
  if (m[1].length <= 2) y += 1400;
  const j = { y, m: +m[2], d: +m[3] };
  return isValidJalali(j) ? withKey(j) : null;
}

const withKey = (j) => ({ ...j, key: j.y * 10000 + j.m * 100 + j.d, text: `${j.y}/${String(j.m).padStart(2, '0')}/${String(j.d).padStart(2, '0')}` });

/** "14:54", "18:11:17", "‭14:54‬" -> "14:54:17"-ish normalised text, or ''. */
export function parseTime(v) {
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const total = Math.round(v * 86400);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(Math.floor(total / 3600))}:${p(Math.floor(total / 60) % 60)}:${p(total % 60)}`;
  }
  const s = toLatinDigits(cleanText(v));
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return '';
  const p = (n) => String(n).padStart(2, '0');
  return m[3] ? `${p(+m[1])}:${m[2]}:${m[3]}` : `${p(+m[1])}:${m[2]}`;
}

/** Group thousands with «٬» and use Persian digits: 12450 -> «۱۲٬۴۵۰». */
export function faAmount(n, { digits = 'fa' } = {}) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '';
  const neg = Number(n) < 0;
  const [int, frac] = Math.abs(Number(n)).toString().split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const s = (neg ? '-' : '') + grouped + (frac ? '.' + frac : '');
  return digits === 'fa' ? toFaDigits(s).replace(/,/g, '٬').replace(/\./g, '٫') : s;
}

/** A row is blank when every cell cleans down to ''. */
export const isBlankRow = (row) => !(row || []).some((c) => cleanText(c) !== '');
