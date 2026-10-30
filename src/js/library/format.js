// Display helpers for the library UI.
import { toFaDigits } from '../content/persian.js';

let fmt;
export function fmtDate(ts) {
  try {
    fmt ??= new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });
    return fmt.format(new Date(ts));
  } catch {
    return toFaDigits(new Date(ts).toLocaleString());
  }
}

export function snippet(doc, max = 90) {
  const t = String(doc.text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}
