// "سرور" panel (header button + palette command) and the small sync indicator.
import { store } from '../core/store.js';
import { $, el } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { toFaDigits as fa } from '../content/persian.js';
import { qrSVG } from '../brand/qr.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { fmtDate } from '../library/format.js';
import { palette } from '../ui/palette.js';
import { expiryText, shareLinkView } from './share-ui.js';
import { syncStatus, syncActive, syncNow } from './sync.js';

const LABELS = {
  off: 'همگام‌سازی غیرفعال',
  synced: 'همگام‌سازی شد',
  syncing: 'در حال همگام‌سازی…',
  offline: 'سرور در دسترس نیست (آفلاین)',
  conflict: 'تعارض: هر دو نسخه نگه داشته شد',
  auth: 'نیاز به ورود دوباره',
};

async function api(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: { 'X-MD2Html': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'http ' + r.status);
  return j;
}

const fmtSize = (n) => (n > 1048576 ? fa((n / 1048576).toFixed(1)) + ' مگابایت' : fa(Math.max(1, Math.round(n / 1024))) + ' کیلوبایت');
const section = (title, ...kids) => el('section', { class: 'srv-sec' }, el('h3', { text: title }), ...kids);
const mono = (text) => el('code', { class: 'srv-url', dir: 'ltr', text });

export function updateIndicator() {
  const btn = $('#serverBtn');
  if (!btn) return;
  const st = syncStatus();
  btn.hidden = !syncActive();
  btn.dataset.sync = st;
  btn.title = 'سرور · ' + (LABELS[st] || '');
  $('#syncDot').setAttribute('aria-label', LABELS[st] || '');
}

async function render(body) {
  const [info, dev, bk, sh] = await Promise.all([api('GET', '/api/server/info'), api('GET', '/api/devices'), api('GET', '/api/backups'), api('GET', '/api/shares')]);
  const st = syncStatus();
  const phone = [`http://${info.hostname}:${info.port}`, ...info.urls];
  const first = info.urls[0] || phone[0];

  const status = section('وضعیت',
    el('p', {}, el('span', { class: 'srv-dot', 'data-sync': st }), ' ' + (LABELS[st] || ''), ' · ', fa(info.documents) + ' سند در سرور'),
    el('button', { type: 'button', class: 'btn soft', text: 'همگام‌سازی اکنون', onclick: async () => { await syncNow(); render(body); } }));

  const qr = el('div', { class: 'srv-qr', role: 'img', 'aria-label': 'کد QR نشانی برنامه برای گوشی' });
  qr.innerHTML = qrSVG(first, { size: 148, label: 'کد QR نشانی برنامه' });
  const phoneSec = section('باز کردن در گوشی',
    el('div', { class: 'srv-phone' }, qr, el('div', {},
      el('p', { class: 'modal-note', text: 'گوشی و مک باید به یک شبکهٔ Wi-Fi وصل باشند. بار اول رمز ۶ رقمی را بپرسد.' }),
      ...phone.map((u) => el('div', {}, mono(u))),
      el('p', { class: 'modal-note', text: 'روی http در گوشی، نصب برنامه و کپی تصویر در کلیپ‌بورد کار نمی‌کند؛ بقیهٔ امکانات کامل است.' }))));

  const pinBox = el('div', { class: 'srv-pin', hidden: true });
  const pinSec = section('رمز ورود (PIN)',
    info.local
      ? el('div', {},
          el('p', { class: 'modal-note', text: 'فقط هش رمز ذخیره می‌شود، پس رمز فعلی قابل نمایش نیست. تعویض رمز، همهٔ دستگاه‌های واردشده را خارج می‌کند.' }),
          el('button', { type: 'button', class: 'btn', text: 'تعویض رمز', onclick: async () => {
            if (!(await confirmDialog({ title: 'تعویض رمز', message: 'رمز جدید ساخته می‌شود و همهٔ دستگاه‌ها باید دوباره وارد شوند. ادامه می‌دهید؟', confirmLabel: 'تعویض رمز' }))) return void openServerPanel();
            try {
              const { pin } = await api('POST', '/api/pin/reset');
              await openServerPanel({ newPin: pin });
            } catch {
              notify('تعویض رمز انجام نشد.');
              openServerPanel();
            }
          } }),
          pinBox)
      : el('p', { class: 'modal-note', text: 'تعویض رمز فقط از روی خود مک ممکن است.' }));

  const devSec = section('دستگاه‌های واردشده',
    dev.devices.length
      ? el('ul', { class: 'srv-list' }, ...dev.devices.map((d) => el('li', {},
          el('span', {}, el('b', { text: d.label || 'دستگاه' }), d.current ? ' (همین دستگاه)' : '', el('small', { text: ` ${d.ip} · آخرین بازدید ${fmtDate(d.lastSeen)}` })),
          el('button', { type: 'button', class: 'btn', text: 'خارج کردن', onclick: async () => { await api('DELETE', '/api/devices/' + d.id); if (d.current) location.reload(); else render(body); } }))))
      : el('p', { class: 'modal-note', text: 'دستگاهی وارد نشده است. (دسترسی از خود مک بدون رمز است.)' }));

  const shareBox = el('div', { class: 'srv-share' });
  const shareSec = section('لینک‌های اشتراک',
    sh.shares.length
      ? el('ul', { class: 'srv-list' }, ...sh.shares.map((x) => el('li', {},
          el('span', {}, el('b', { text: x.title || 'سند' }), el('small', { text: ` ${expiryText(x)} · ${fa(x.views)} بازدید` })),
          el('span', { class: 'srv-btns' },
            el('button', { type: 'button', class: 'btn', text: 'لینک و QR', onclick: async () => shareBox.replaceChildren(await shareLinkView('/s/' + x.id)) }),
            el('button', { type: 'button', class: 'btn', text: 'لغو', onclick: async () => { await api('DELETE', '/api/shares/' + x.id); render(body); } }))))
        )
      : el('p', { class: 'modal-note', text: 'لینک فعالی نیست. از منوی «خروجی ← اشتراک در شبکهٔ مغازه» بسازید.' }),
    shareBox);

  const last = bk.backups[0];
  const bkSec = section('داده‌ها و پشتیبان',
    el('p', {}, 'پوشهٔ داده: ', mono(info.dataDir)),
    el('p', { class: 'modal-note', text: last ? `آخرین پشتیبان: ${fmtDate(last.mtime)}` : 'هنوز پشتیبانی گرفته نشده است. پشتیبان خودکار هر روز ساعت ۳ بامداد (یا اولین اجرای بعد از آن) گرفته می‌شود و ۳۰ نسخهٔ آخر می‌ماند.' }),
    el('button', { type: 'button', class: 'btn soft', text: 'پشتیبان‌گیری اکنون', onclick: async () => { await api('POST', '/api/backups'); notify('پشتیبان ساخته شد.'); render(body); } }),
    bk.backups.length
      ? el('ul', { class: 'srv-list' }, ...bk.backups.slice(0, 8).map((b) => el('li', {},
          el('span', {}, el('b', { dir: 'ltr', text: b.name.replace(/^md2html-|\.json\.gz$/g, '') }), el('small', { text: ` ${fmtDate(b.mtime)} · ${fmtSize(b.size)}${b.kind === 'pre-restore' ? ' · پیش از بازگردانی' : ''}` })),
          el('button', { type: 'button', class: 'btn', text: 'بازگردانی', onclick: () => restore(b) }))))
      : null);

  body.replaceChildren(status, phoneSec, shareSec, pinSec, devSec, bkSec);
  return pinBox;
}

async function restore(b) {
  const ok = await confirmDialog({
    title: 'بازگردانی پشتیبان',
    message: `کل کتابخانه با پشتیبان «${b.name.replace(/^md2html-|\.json\.gz$/g, '')}» جایگزین می‌شود و همهٔ دستگاه‌ها آن را دریافت می‌کنند. پیش از آن یک پشتیبان از وضعیت فعلی گرفته می‌شود. ادامه می‌دهید؟`,
    confirmLabel: 'بازگردانی', danger: true,
  });
  if (ok) {
    try {
      await api('POST', `/api/backups/${encodeURIComponent(b.name)}/restore`);
      notify('پشتیبان بازگردانده شد.');
      await syncNow();
    } catch {
      notify('بازگردانی انجام نشد.');
    }
  }
  openServerPanel();
}

export async function openServerPanel({ newPin } = {}) {
  if (!syncActive()) return void notify('سرور MD2Html در دسترس نیست؛ برنامه را از نشانی http://localhost:7123 باز کنید.');
  const body = el('div', { class: 'srv' }, el('p', { class: 'modal-note', text: 'در حال خواندن وضعیت سرور…' }));
  openModal({ title: 'سرور', body, wide: true });
  try {
    const pinBox = await render(body);
    if (newPin) {
      pinBox.hidden = false;
      pinBox.replaceChildren(el('span', { text: 'رمز جدید (فقط همین یک بار نمایش داده می‌شود): ' }), el('b', { dir: 'ltr', text: newPin }));
    }
  } catch {
    body.replaceChildren(el('p', { class: 'form-error', text: 'خواندن وضعیت سرور انجام نشد.' }));
  }
}

export function initServerUI() {
  $('#serverBtn')?.addEventListener('click', () => openServerPanel());
  palette.register({ id: 'server-panel', title: 'پنل سرور (وضعیت، گوشی، دستگاه‌ها، پشتیبان)', group: 'سرور', keywords: 'server phone qr pin devices backup sync سرور گوشی', run: () => openServerPanel() });
  palette.register({ id: 'server-sync', title: 'همگام‌سازی اکنون', group: 'سرور', keywords: 'sync now همگام', run: () => (syncActive() ? syncNow() : notify('سرور در دسترس نیست.')) });
  store.on('sync:status', updateIndicator);
  store.on('sync:active', updateIndicator);
}
