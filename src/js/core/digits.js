// Active digit script for everything the app writes: 'fa' (Persian, the default) or 'en' (Latin).
// Embed mode can ask for Latin (`DATASAVE_EMBED.digits = 'en'`); generators read digitMode() at call time.
import { embedConfig } from './embed-config.js';

export const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

let mode = embedConfig().digits;

export const digitMode = () => mode;
/** For tests and the embed bootstrap. Anything but 'en' means Persian. */
export function setDigitMode(m) {
  mode = m === 'en' ? 'en' : 'fa';
  return mode;
}

export const HAS_LOCAL_DIGIT = /[۰-۹٠-٩]/;
/** Persian and Arabic-Indic digits -> Latin. Parsing helpers use this in every mode. */
export const toLatinDigits = (v) =>
  String(v).replace(/[۰-۹]/g, (c) => String(FA_DIGITS.indexOf(c))).replace(/[٠-٩]/g, (c) => String(AR_DIGITS.indexOf(c)));
/** Latin digits -> the active script. */
export const localDigits = (v) => (mode === 'en' ? String(v) : String(v).replace(/\d/g, (d) => FA_DIGITS[d]));
/** Number separators in the active script: Persian «٬ ٫» or Latin «, .». */
export const localSeparators = (s) => (mode === 'en' ? s : s.replace(/,/g, '٬').replace(/\./g, '٫'));
/** The percent sign of the active script. */
export const percentSign = () => (mode === 'en' ? '%' : '٪');
