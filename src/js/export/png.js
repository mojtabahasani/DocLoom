// PNG export for Telegram & co: renders the document offscreen at 1240 px (A4 at 150 dpi) with modern-screenshot,
// then either one tall image or A4 pages split at block boundaries (see paginate.js); several pages are zipped.
import { domToCanvas } from 'modern-screenshot';
import { zipSync } from 'fflate';
import { store } from '../core/store.js';
import { el } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { toFaDigits } from '../content/persian.js';
import { sanitizeChildren } from '../content/sanitize.js';
import { preview } from '../editor/preview.js';
import { openModal } from '../ui/modal.js';
import { watermarkText } from '../brand/watermark.js';
import { embeddedFontCSS } from './html.js';
import { saveAs, safeFilename } from './files.js';
import { paginate, PAGE_W, PAGE_H, PAGE_MARGIN_Y } from './paginate.js';

const MAX_LONG = 15000; // browsers cap canvas height around 16k px
const CONTENT_H = PAGE_H - 2 * PAGE_MARGIN_Y;

function buildStage() {
  const s = store.snapshot();
  const host = el('div', { class: 'png-host', 'aria-hidden': 'true', style: `position:fixed;left:-30000px;top:0;width:${PAGE_W}px;pointer-events:none` });
  const art = el('article', { class: 'paper png-doc' });
  art.dataset.docTheme = preview.dataset.docTheme || 'navy';
  for (const v of ['--accent-doc', '--tint']) {
    const val = preview.style.getPropertyValue(v);
    if (val) art.style.setProperty(v, val);
  }
  art.style.cssText += `;width:${PAGE_W}px;max-width:none;min-height:0;margin:0;border:0;border-radius:0;box-shadow:none;box-sizing:border-box;padding:96px 110px 90px;font-size:${(s.font * 1.65).toFixed(1)}px;overflow:visible`;
  art.append(sanitizeChildren(preview));
  host.append(art);
  document.body.append(host);
  const bg = getComputedStyle(preview).backgroundColor || '#fffefa';
  const accent = (getComputedStyle(preview).getPropertyValue('--accent-doc') || '#1c5263').trim();
  return { host, art, bg, accent, wm: watermarkText(s.watermark) };
}

/** Smallest unsplittable blocks of the laid-out document (px from its top). */
function collectAtoms(art, maxH) {
  const base = art.getBoundingClientRect().top;
  const atoms = [];
  const add = (top, bottom, keepNext) => bottom - top > 1 && atoms.push({ top, bottom, keepNext });
  const lines = (n, r) => {
    const cs = getComputedStyle(n);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.9;
    const pad = parseFloat(cs.paddingTop) || 0;
    const top = r.top - base;
    const count = Math.max(1, Math.round((r.height - pad) / lh));
    for (let i = 0; i < count; i++) add(top + (i ? pad : 0) + i * lh, Math.min(r.bottom - base, top + pad + (i + 1) * lh));
  };
  const visit = (n) => {
    const r = n.getBoundingClientRect();
    if (r.height <= 0) return;
    const tag = n.tagName;
    if (r.height <= maxH) return void add(r.top - base, r.bottom - base, /^H[1-6]$/.test(tag));
    const kids = Array.from(n.children);
    if (tag === 'TABLE') return void Array.from(n.querySelectorAll('tr')).forEach(visit);
    if (!kids.length || tag === 'PRE' || tag === 'P') return lines(n, r);
    kids.forEach(visit);
  };
  Array.from(art.children).forEach(visit);
  return atoms.sort((a, b) => a.top - b.top);
}

async function renderSlice(st, y0, h, fontCss) {
  const wrap = el('div', { style: `position:fixed;left:-30000px;top:0;width:${PAGE_W}px;height:${h}px;overflow:hidden;background:${st.bg}` });
  const clone = st.art.cloneNode(true);
  clone.style.marginTop = -y0 + 'px';
  wrap.append(clone);
  document.body.append(wrap);
  try {
    return await domToCanvas(wrap, { width: PAGE_W, height: h, scale: 1, backgroundColor: st.bg, font: fontCss ? { cssText: fontCss } : undefined });
  } finally {
    wrap.remove();
  }
}

function paintWatermark(g, st, cx, cy) {
  if (!st.wm) return;
  g.save();
  g.translate(cx, cy);
  g.rotate((-32 * Math.PI) / 180);
  g.globalAlpha = 0.1;
  g.fillStyle = st.accent;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.direction = 'rtl';
  let size = 230;
  g.font = `700 ${size}px Vazirmatn, Tahoma, sans-serif`;
  const w = g.measureText(st.wm).width;
  if (w > 1000) {
    size = Math.floor((size * 1000) / w);
    g.font = `700 ${size}px Vazirmatn, Tahoma, sans-serif`;
  }
  g.fillText(st.wm, 0, 0);
  g.restore();
}

const toBlob = (cv) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/png'));

/** -> Blob[] (one per page, or a single tall image). onProgress(done, total). */
async function renderAll(st, mode, pages, onProgress) {
  const fontCss = embeddedFontCSS();
  if (document.fonts?.ready) await document.fonts.ready;
  const totalH = Math.ceil(st.art.getBoundingClientRect().height);
  if (mode === 'long') {
    if (totalH > MAX_LONG) throw new Error('سند برای یک تصویر بلند خیلی طولانی است؛ حالت «صفحه‌ای» را انتخاب کنید.');
    const cv = await renderSlice(st, 0, totalH, fontCss);
    const g = cv.getContext('2d');
    if (totalH < PAGE_H) paintWatermark(g, st, PAGE_W / 2, totalH / 2);
    else for (let y = PAGE_H / 2; y < totalH; y += PAGE_H) paintWatermark(g, st, PAGE_W / 2, Math.min(y, totalH - 400));
    onProgress(1, 1);
    return [await toBlob(cv)];
  }
  const blobs = [];
  for (let i = 0; i < pages.length; i++) {
    const { start, end } = pages[i];
    const slice = await renderSlice(st, start, Math.max(1, Math.ceil(end - start)), fontCss);
    const cv = document.createElement('canvas');
    cv.width = PAGE_W;
    cv.height = PAGE_H;
    const g = cv.getContext('2d');
    g.fillStyle = st.bg;
    g.fillRect(0, 0, PAGE_W, PAGE_H);
    g.drawImage(slice, 0, PAGE_MARGIN_Y);
    paintWatermark(g, st, PAGE_W / 2, PAGE_H / 2);
    if (pages.length > 1) {
      g.save();
      g.fillStyle = '#7a8a84';
      g.font = '400 24px Vazirmatn, Tahoma, sans-serif';
      g.textAlign = 'center';
      g.direction = 'rtl';
      g.fillText(`${toFaDigits(i + 1)} / ${toFaDigits(pages.length)}`, PAGE_W / 2, PAGE_H - 26);
      g.restore();
    }
    blobs.push(await toBlob(cv));
    onProgress(i + 1, pages.length);
    await new Promise((r) => setTimeout(r, 0)); // let the progress bar paint
  }
  return blobs;
}

export const pageRanges = (st) => paginate(collectAtoms(st.art, CONTENT_H), CONTENT_H, Math.ceil(st.art.getBoundingClientRect().height));

export async function exportPNG() {
  let st;
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    st = buildStage();
  } catch {
    return notify('ساخت تصویر ممکن نشد؛ سند دست‌نخورده است.');
  }
  let mode = 'paged';
  let pages = [];
  let busy = false;
  let latest = [];
  const info = el('p', { class: 'modal-note', role: 'status' });
  const bar = el('i');
  const track = el('div', { class: 'xprog', hidden: true }, bar);
  const radios = [['paged', 'صفحه‌ای (A4، برش در مرز بلوک‌ها)'], ['long', 'تصویر بلند (یک تصویر)']].map(([v, label]) =>
    el('label', { class: 'xopt' }, el('input', { type: 'radio', name: 'pngmode', value: v, ...(v === mode ? { checked: true } : {}) }), el('span', { text: label })),
  );
  const update = () => {
    try {
      pages = pageRanges(st);
    } catch {
      pages = [{ start: 0, end: 1 }];
    }
    const n = mode === 'long' ? 1 : pages.length;
    info.textContent = mode === 'long' ? 'یک تصویر بلند ساخته می‌شود.' : `تعداد صفحه: ${toFaDigits(n)}` + (n > 1 ? ' — خروجی به‌صورت فایل ZIP ذخیره می‌شود.' : '');
    copyBtn.disabled = n > 1;
  };
  const body = el('div', { class: 'xdlg' }, el('p', { class: 'modal-note', text: 'سند با فونت وزیرمتن و عرض ۱۲۴۰ پیکسل تصویر می‌شود؛ مناسب تلگرام و شبکه‌های اجتماعی. واترمارک روی تصویر می‌آید.' }), ...radios, info, track);
  const run = async (copy) => {
    if (busy) return false;
    busy = true;
    track.hidden = false;
    bar.style.width = '0%';
    setDisabled(true);
    try {
      latest = await renderAll(st, mode, pages, (d, t) => (bar.style.width = Math.round((d / t) * 100) + '%'));
      const name = safeFilename(store.get('title'), 'png');
      if (copy) {
        if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) notify('کپی تصویر در این مرورگر پشتیبانی نمی‌شود؛ به‌جای آن فایل را ذخیره کنید.');
        else {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': latest[0] })]);
            notify('تصویر در کلیپ‌بورد کپی شد.');
          } catch {
            notify('کپی تصویر در کلیپ‌بورد انجام نشد؛ اجازهٔ مرورگر را بررسی کنید یا فایل را ذخیره کنید.');
          }
        }
      } else if (latest.length === 1) {
        await saveAs(name, latest[0], 'image/png', 'تصویر PNG');
      } else {
        const base = name.replace(/\.png$/, '');
        const files = {};
        for (let i = 0; i < latest.length; i++) files[`${base}-${String(i + 1).padStart(2, '0')}.png`] = new Uint8Array(await latest[i].arrayBuffer());
        await saveAs(base + '.zip', zipSync(files, { level: 0 }), 'application/zip', 'پوشهٔ فشرده (ZIP)');
      }
      return true;
    } catch (e) {
      notify(e?.message && /[آ-ی]/.test(e.message) ? e.message : 'ساخت تصویر ناموفق بود؛ سند دست‌نخورده است. فایل بسیار بزرگ یا کمبود حافظه ممکن است علت باشد.');
      track.hidden = true;
      return false;
    } finally {
      busy = false;
      setDisabled(false);
    }
  };
  let copyBtn;
  let saveBtn;
  const setDisabled = (d) => {
    saveBtn && (saveBtn.disabled = d);
    if (copyBtn) copyBtn.disabled = d || (mode === 'long' ? false : pages.length > 1);
  };
  const m = openModal({
    title: 'تصویر PNG برای تلگرام',
    body,
    onClose: () => st.host.remove(),
    actions: [
      { label: 'انصراف', kind: '' },
      { label: 'کپی در کلیپ‌بورد', kind: 'soft', keepOpen: true, onClick: () => run(true) },
      { label: 'ساخت و ذخیره', kind: 'primary', keepOpen: true, onClick: async () => { if (await run(false)) m.close(); } },
    ],
  });
  const btns = m.el.querySelectorAll('.modalfoot .btn');
  copyBtn = btns[1];
  saveBtn = btns[2];
  body.addEventListener('change', (e) => {
    if (e.target.name === 'pngmode') {
      mode = e.target.value;
      update();
    }
  });
  update();
}
