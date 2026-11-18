// Persian helpers. Pure apart from the active digit script (core/digits.js; Persian unless embed mode asks for Latin).
import { localDigits, percentSign } from '../core/digits.js';

export const toFaDigits = (v) => localDigits(v);
export const faPercent = (n) => toFaDigits(Math.round(n)) + percentSign();
