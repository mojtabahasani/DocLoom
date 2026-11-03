// «اشتراک»: publish the interactive HTML at /s/<id> on the shop LAN (no PIN, read-only), show link + QR; list/revoke live in the server panel.
import { store } from '../core/store.js';
import { el } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { toFaDigits as fa } from '../content/persian.js';
import { digitMode } from '../core/digits.js';
import { qrSVG } from '../brand/qr.js';
import { openModal } from '../ui/modal.js';
import { palette } from '../ui/palette.js';
import { isEmpty } from '../editor/preview.js';
import { buildInteractiveHTML } from '../export/interactive.js';
import { copyPlain } from '../export/files.js';
import { syncActive } from './sync.js';

const EXPIRIES = [['1d', 'یک روز'], ['7d', 'هفت روز'], ['none', 'بدون انقضا']];

async function sapi(method, url, body) {
  const r = await fetch(url, { method, headers: { 'X-MD2Html': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'http ' + r.status);
  return j;
}

/** Link base other devices can reach: the Mac's LAN address (a localhost page would give a link only this Mac can open). */
export async function lanBase() {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return location.origin;
  try {
    const info = await sapi('GET', '/api/server/info');
    return info.urls[0] || location.origin;
  } catch {
    return location.origin;
  }
}

export const expiryText = (s) => (s.expiresAt ? 'تا ' + new Date(s.expiresAt).toLocaleString(digitMode() === 'en' ? 'fa-IR-u-nu-latn' : 'fa-IR', { dateStyle: 'medium', timeStyle: 'short' }) : 'بدون انقضا');

export async function shareLinkView(path) {
  const url = (await lanBase()) + path;
  const qr = el('div', { class: 'srv-qr', role: 'img', 'aria-label': 'کد QR لینک اشتراک' });
  qr.innerHTML = qrSVG(url, { size: 148, label: 'کد QR لینک اشتراک' });
  return el('div', { class: 'srv-phone' }, qr, el('div', {},
    el('p', { class: 'modal-note', text: 'هر کس در شبکهٔ Wi-Fi مغازه این لینک را باز کند می‌تواند سند را ببیند؛ رمز لازم نیست و فقط خواندنی است.' }),
    el('div', {}, el('code', { class: 'srv-url', dir: 'ltr', text: url })),
    el('button', { type: 'button', class: 'btn soft', text: 'کپی لینک', onclick: async () => { await copyPlain(url); } })));
}

export function openShare() {
  if (isEmpty()) return void notify('ابتدا متن یا فایل خود را وارد کنید.');
  if (!syncActive()) return void notify('اشتراک لینک به سرور MD2Html نیاز دارد؛ برنامه را از http://localhost:7123 باز کنید.');
  let expires = '7d';
  const body = el('div', { class: 'bt' });
  const err = el('p', { class: 'form-error', role: 'alert', hidden: true });
  const radios = EXPIRIES.map(([v, label]) => {
    const r = el('input', { type: 'radio', name: 'shexp', value: v });
    r.checked = v === expires;
    r.addEventListener('change', () => (expires = v));
    return el('label', { class: 'bt-check' }, r, ' ' + label);
  });
  const go = el('button', { type: 'button', class: 'btn primary', text: 'ساخت لینک اشتراک' });
  go.addEventListener('click', async () => {
    go.disabled = true;
    err.hidden = true;
    try {
      const s = await sapi('POST', '/api/shares', { html: buildInteractiveHTML(), title: store.get('title') || 'سند', expires });
      body.replaceChildren(el('h3', { text: 'لینک آماده است' }), await shareLinkView(s.path), el('p', { class: 'modal-note', text: 'اعتبار: ' + expiryText(s) + ' · لغو یا دیدن تعداد بازدید از «سرور ← لینک‌های اشتراک».' }));
    } catch (e) {
      err.textContent = 'ساخت لینک انجام نشد: ' + e.message;
      err.hidden = false;
      go.disabled = false;
    }
  });
  body.append(
    el('p', { class: 'modal-note', text: 'نسخهٔ تعاملی سند (فهرست، حالت تیره) همین الان روی سرور منتشر می‌شود. بعداً با تغییر سند، لینک تغییر نمی‌کند؛ لینک تازه بسازید.' }),
    el('section', { class: 'srv-sec' }, el('h3', { text: 'مدت اعتبار' }), el('div', { class: 'bt-checks' }, ...radios)), err, el('div', { class: 'bt-actions' }, go));
  openModal({ title: 'اشتراک در شبکهٔ مغازه', body, wide: true });
}

export function initShareUI() {
  palette.register({ id: 'share-link', title: 'اشتراک سند با لینک در شبکهٔ مغازه', group: 'سرور', keywords: 'share link lan qr اشتراک لینک', run: openShare });
}
