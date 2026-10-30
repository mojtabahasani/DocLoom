// Official-letter blocks as markup strings (pure; callers run them through the sanitizer) and number issuing.
import { escapeHTML as e } from '../content/markdown.js';
import { toFaDigits } from '../content/persian.js';
import { qrContent, qrSVG } from './qr.js';

export const DEFAULT_LETTER = {
  number: '', date: '', attachments: '', recipient: '', subject: '', greeting: true,
  signer: { name: '', role: '' }, sig: { x: 30, y: 6 }, stamp: { x: 100, y: 16 },
};

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const pos = (p, d) => ({
  x: Number.isFinite(Number(p?.x)) ? Math.max(0, Math.min(400, Math.round(Number(p.x)))) : d.x,
  y: Number.isFinite(Number(p?.y)) ? Math.max(0, Math.min(300, Math.round(Number(p.y)))) : d.y,
});

export function normalizeLetter(l) {
  const o = l && typeof l === 'object' ? l : {};
  return {
    number: str(o.number, 60), date: str(o.date, 20), attachments: str(o.attachments, 200),
    recipient: str(o.recipient, 300), subject: str(o.subject, 300), greeting: o.greeting !== false,
    signer: { name: str(o.signer?.name, 120), role: str(o.signer?.role, 160) },
    sig: pos(o.sig, DEFAULT_LETTER.sig), stamp: pos(o.stamp, DEFAULT_LETTER.stamp),
  };
}

/** "۱۲۳/۱۷": prefix + "/" + counter (Persian digits unless the prefix uses Latin letters or digits). */
export function formatLetterNumber(prefix, counter) {
  const p = String(prefix || '').trim();
  const c = /[A-Za-z0-9]/.test(p) ? String(counter) : toFaDigits(counter);
  return p ? `${p}/${c}` : c;
}

/** Take the brand's next number. Returns the number and the brand with its counter advanced. */
export function issueNumber(brand) {
  const n = Math.max(1, Math.floor(Number(brand?.letterCounter)) || 1);
  return { number: formatLetterNumber(brand?.letterPrefix, n), brand: { ...brand, letterCounter: n + 1 } };
}

const qrHTML = (s, inline) => {
  const q = s.qr;
  if (!q?.enabled) return '';
  const svg = qrSVG(qrContent(q), { size: q.size || 84 });
  return svg ? `<div class="qr-box${inline ? ' qr-inline' : ''}"${inline ? '' : ' data-md2-furniture="qr"'}>${svg}</div>` : '';
};

/** Top of the letter: date/number/attachment block (left side in RTL), recipient, subject, greeting. */
export function letterHTML(s) {
  if (s.mode !== 'letter') return '';
  const L = normalizeLetter(s.letter);
  const line = (label, v) => `<p class="letter-line"><b>${label}</b> <span>${e(v)}</span></p>`;
  const meta = line('تاریخ:', L.date) + line('شماره:', L.number) + (L.attachments ? line('پیوست:', L.attachments) : '');
  const inlineQr = s.qr?.position === 'letter' ? qrHTML(s, true) : '';
  return (
    '<section class="letter-head" data-md2-furniture="letter">' +
    `<div class="letter-top">${inlineQr}<div class="letter-meta">${meta}</div></div>` +
    '<div class="letter-to">' +
    (L.recipient ? line('به:', L.recipient) : '') +
    (L.subject ? `<p class="letter-line letter-subject"><b>موضوع:</b> <span>${e(L.subject)}</span></p>` : '') +
    (L.greeting ? '<p class="letter-greeting">با سلام و احترام</p>' : '') +
    '</div></section>'
  );
}

/** Signature block at the end of the letter: signature and stamp images overlap inside .sign-area. */
export function signatureHTML(s) {
  if (s.mode !== 'letter') return '';
  const L = normalizeLetter(s.letter);
  const { name, role } = L.signer;
  if (!name && !role && !s.signatureImage && !s.stampImage) return '';
  const img = (cls, src, p, alt) => (src ? `<img class="${cls}" src="${e(src)}" alt="${alt}" draggable="false" style="margin-left:${p.x}px;margin-top:${p.y}px">` : '');
  const area = s.signatureImage || s.stampImage ? `<div class="sign-area">${img('stamp-img', s.stampImage, L.stamp, 'مهر')}${img('sig-img', s.signatureImage, L.sig, 'امضا')}</div>` : '';
  return (
    '<section class="letter-sign" data-md2-furniture="signature"><div class="sign-box">' +
    area +
    `<p class="signer">${name ? `<strong>${e(name)}</strong>` : ''}${role ? `<span>${e(role)}</span>` : ''}</p>` +
    '</div></section>'
  );
}

/** QR in the footer corner (also used in documents that are not letters, or when the QR sits beside the letter block). */
export function footerQrHTML(s) {
  if (s.mode === 'letter' && s.qr?.position === 'letter') return '';
  return qrHTML(s, false);
}
