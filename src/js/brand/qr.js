// QR code -> SVG string (pure). Wraps `qrcode-generator` (MIT). Output uses only elements and attributes the
// sanitizer whitelists (svg, rect, path) so it survives sanitize + export.
import qrcode from 'qrcode-generator';

qrcode.stringToBytes = (s) => Array.from(new TextEncoder().encode(s)); // UTF-8 so Persian text scans correctly

export const QR_KINDS = [['url', 'نشانی وب'], ['tel', 'شمارهٔ تلفن'], ['text', 'متن دلخواه']];
export const QR_POSITIONS = [['footer', 'گوشهٔ پاورقی'], ['letter', 'کنار بلوک نامه']];
export const QR_DEFAULTS = { enabled: false, kind: 'url', value: '', position: 'footer', size: 84 };
export const MAX_QR_CHARS = 600;

const toLatin = (s) => String(s).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));

export function normalizeQr(q = {}) {
  const o = q && typeof q === 'object' ? q : {};
  const size = Number(o.size);
  return {
    enabled: o.enabled === true,
    kind: QR_KINDS.some((k) => k[0] === o.kind) ? o.kind : 'url',
    value: typeof o.value === 'string' ? o.value.trim().slice(0, MAX_QR_CHARS) : '',
    position: o.position === 'letter' ? 'letter' : 'footer',
    size: Number.isFinite(size) ? Math.max(56, Math.min(180, Math.round(size))) : 84,
  };
}

/** The string encoded in the QR for `{kind, value}`; '' when there is nothing to encode. */
export function qrContent({ kind, value } = {}) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (kind === 'tel') {
    const n = toLatin(v).replace(/[^\d+]/g, '');
    return n ? 'tel:' + n : '';
  }
  if (kind === 'url') return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v;
  return v;
}

/** Returns an `<svg class="qr-svg">` string, or '' when the text is empty or too long. */
export function qrSVG(text, { size = 84, margin = 4, dark = '#000000', light = '#ffffff', label = 'کد QR' } = {}) {
  if (!text || text.length > MAX_QR_CHARS) return '';
  let q;
  try {
    q = qrcode(0, 'M');
    q.addData(text);
    q.make();
  } catch {
    return '';
  }
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; ) {
      if (!q.isDark(r, c)) {
        c++;
        continue;
      }
      let run = 1;
      while (c + run < n && q.isDark(r, c + run)) run++;
      d += `M${c + margin} ${r + margin}h${run}v1h-${run}z`;
      c += run;
    }
  }
  const box = n + margin * 2;
  return (
    `<svg class="qr-svg" viewBox="0 0 ${box} ${box}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="${label}">` +
    `<rect x="0" y="0" width="${box}" height="${box}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`
  );
}
