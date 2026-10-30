// Watermark and QR controls (side panel + palette) and the watermark overlay shown in the preview.
import { store } from '../core/store.js';
import { $, el, debounce } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { palette } from '../ui/palette.js';
import { preview, refreshFurniture } from '../editor/preview.js';
import { WATERMARK_PRESETS, WORD_NOTE, normalizeWatermark, watermarkText } from './watermark.js';
import { QR_KINDS, QR_POSITIONS, normalizeQr, qrContent, MAX_QR_CHARS } from './qr.js';
import { brands } from './brands.js';

const PAGE_PX = 1000; // preview watermark repeats about once per printed page
const KIND_LABEL = { url: 'نشانی وب (مثلاً computer123.ir)', tel: 'شمارهٔ تلفن', text: 'متن دلخواه' };

export function setWatermark(patch) {
  store.set('watermark', normalizeWatermark({ ...store.get('watermark'), ...patch }));
  store.set('dirty', true);
}

function paintLayer() {
  const layer = $('#wmLayer');
  const text = watermarkText(store.get('watermark'));
  layer.replaceChildren();
  layer.hidden = !text;
  if (!text) return;
  layer.style.color = getComputedStyle(preview).getPropertyValue('--accent-doc') || '#1c5263';
  const h = Math.max(preview.offsetHeight, 400);
  for (let top = 0; top < h; top += PAGE_PX) {
    const mid = top + Math.min(PAGE_PX, h - top) / 2;
    layer.append(el('span', { class: 'wm-item', style: `top:${Math.round(mid)}px`, text }));
  }
}

export function setQr(patch) {
  store.set('qr', normalizeQr({ ...store.get('qr'), ...patch }));
  store.set('dirty', true);
  refreshFurniture();
}

function syncPanel() {
  const w = normalizeWatermark(store.get('watermark'));
  $('#wmPreset').value = w.preset;
  $('#wmTextField').hidden = w.preset !== 'custom';
  if (document.activeElement !== $('#wmText')) $('#wmText').value = w.text;
  const q = normalizeQr(store.get('qr'));
  $('#qrOn').checked = q.enabled;
  $('#qrFields').hidden = !q.enabled;
  $('#qrKind').value = q.kind;
  $('#qrValueLabel').textContent = KIND_LABEL[q.kind];
  if (document.activeElement !== $('#qrValue')) $('#qrValue').value = q.value;
  $('#qrValue').placeholder = q.kind === 'url' ? 'خالی = وب‌سایت برند' : '';
  $('#qrPos').value = q.position;
  $('#qrSize').value = q.size;
  const content = qrContent({ kind: q.kind, value: q.value || (q.kind === 'url' ? brands.current()?.website : '') });
  $('#qrNote').textContent = !q.enabled ? '' : !content ? 'مقداری برای QR نیست؛ آن را بنویسید.' : content.length > MAX_QR_CHARS ? 'متن برای QR بیش از حد بلند است.' : 'محتوا: ' + content;
}

export function initLayers() {
  $('#wmPreset').replaceChildren(...WATERMARK_PRESETS.map(([v, label]) => el('option', { value: v, text: label })));
  $('#qrKind').replaceChildren(...QR_KINDS.map(([v, label]) => el('option', { value: v, text: label })));
  $('#qrPos').replaceChildren(...QR_POSITIONS.map(([v, label]) => el('option', { value: v, text: label })));
  $('#wmNote').textContent = WORD_NOTE;
  $('#wmPreset').addEventListener('change', (e) => setWatermark({ preset: e.target.value }));
  $('#wmText').addEventListener('input', (e) => setWatermark({ text: e.target.value }));
  $('#qrOn').addEventListener('change', (e) => setQr({ enabled: e.target.checked }));
  $('#qrKind').addEventListener('change', (e) => setQr({ kind: e.target.value }));
  $('#qrValue').addEventListener('input', (e) => setQr({ value: e.target.value }));
  $('#qrPos').addEventListener('change', (e) => setQr({ position: e.target.value }));
  $('#qrSize').addEventListener('input', (e) => setQr({ size: Number(e.target.value) }));

  const repaint = debounce(paintLayer, 120);
  for (const k of ['watermark', 'theme', 'brandColors', 'docId']) store.on(k, () => (paintLayer(), syncPanel()));
  for (const k of ['content', 'font', 'webLayout']) store.on(k, repaint);
  for (const k of ['qr', 'brandId']) store.on(k, syncPanel);
  store.on('brands:changed', syncPanel);
  window.addEventListener('resize', repaint);
  paintLayer();
  syncPanel();

  for (const [id, label, text] of WATERMARK_PRESETS) {
    palette.register({
      id: 'watermark-' + id, title: id === 'none' ? 'حذف واترمارک' : id === 'custom' ? 'واترمارک: متن دلخواه…' : `واترمارک: ${label}`, group: 'واترمارک',
      keywords: `watermark واترمارک ${text}`,
      run: () => {
        setWatermark({ preset: id });
        if (id === 'custom') {
          $('#layersAcc').open = true;
          $('#wmText').focus();
        } else notify(id === 'none' ? 'واترمارک حذف شد.' : `واترمارک «${text}» روی سند قرار گرفت.`);
      },
    });
  }
  palette.register({
    id: 'qr-toggle', title: 'QR کد: روشن/خاموش', group: 'برندها', keywords: 'qr code کیوآر بارکد',
    run: () => {
      setQr({ enabled: !store.get('qr').enabled });
      notify(`QR کد: ${store.get('qr').enabled ? 'روشن' : 'خاموش'}`);
    },
  });
}
