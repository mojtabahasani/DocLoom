// Persian helpers. Pure.
const FA = '۰۱۲۳۴۵۶۷۸۹';
export const toFaDigits = (v) => String(v).replace(/\d/g, (d) => FA[d]);
export const faPercent = (n) => toFaDigits(Math.round(n)) + '٪';
