// Jalali (Solar Hijri) calendar: pure arithmetic, no Date parsing quirks. 33-year cycle algorithm.
import { digitMode } from '../core/digits.js';
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
const div = (a, b) => Math.trunc(a / b);
const mod = (a, b) => a - Math.trunc(a / b) * b;

function jalCal(jy) {
  if (jy < BREAKS[0] || jy >= BREAKS[BREAKS.length - 1]) throw new RangeError('سال شمسی خارج از بازه است');
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

const g2d = (gy, gm, gd) =>
  div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408 -
  div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;

function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  return { y: div(j, 1461) - 100100 + div(8 - gm, 6), m: gm, d: gd };
}

const j2d = (jy, jm, jd) => {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
};

function d2j(jdn) {
  const gy = d2g(jdn).y;
  let jy = gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { y: jy, m: 1 + div(k, 31), d: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { y: jy, m: 7 + div(k, 30), d: mod(k, 30) + 1 };
}

export const isLeapJalali = (jy) => jalCal(jy).leap === 0;
export const jalaliMonthLength = (jy, jm) => (jm <= 6 ? 31 : jm <= 11 ? 30 : isLeapJalali(jy) ? 30 : 29);

export function isValidJalali({ y, m, d }) {
  return [y, m, d].every(Number.isInteger) && y >= 1 && y < 3000 && m >= 1 && m <= 12 && d >= 1 && d <= jalaliMonthLength(y, m);
}

/** Gregorian (y, m 1-12, d) -> Jalali {y,m,d} */
export const toJalali = (gy, gm, gd) => d2j(g2d(gy, gm, gd));
/** Jalali (y, m 1-12, d) -> Gregorian {y,m,d} */
export const toGregorian = (jy, jm, jd) => d2g(j2d(jy, jm, jd));

/** Today's Jalali date from the local calendar day of `date`. */
export const todayJalali = (date = new Date()) => toJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());

const FA = '۰۱۲۳۴۵۶۷۸۹';
const toFa = (s) => String(s).replace(/\d/g, (d) => FA[d]);
const toLatin = (s) =>
  String(s).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));

/** formatJalali({y,m,d}, {digits:'fa'|'en', sep:'/'}) -> "۱۴۰۵/۰۸/۰۸". `digits` defaults to the active script (core/digits.js). */
export function formatJalali({ y, m, d }, { digits = digitMode(), sep = '/' } = {}) {
  const s = [String(y).padStart(4, '0'), String(m).padStart(2, '0'), String(d).padStart(2, '0')].join(sep);
  return digits === 'fa' ? toFa(s) : s;
}

/** Parse "1405/8/8" in any digit script with / - . separators. Returns {y,m,d} or null. */
export function parseJalali(text) {
  const m = toLatin(text).trim().match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (!m) return null;
  const v = { y: +m[1], m: +m[2], d: +m[3] };
  return isValidJalali(v) ? v : null;
}

export const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
