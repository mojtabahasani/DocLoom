// URL policy shared by markdown, sanitizer and link tools. Pure.
// Allowed: http, https, mailto, tel; data:image/* (images only).
const DATA_IMG = /^data:image\/(png|jpe?g|webp|gif);base64,/i;

export function safeURL(raw, { image = false } = {}) {
  const s = String(raw ?? '').trim();
  if (!s || /[\u0000-\u001f\u007f]/.test(s)) return null;
  if (image && DATA_IMG.test(s)) {
    const body = s.slice(s.indexOf(',') + 1);
    return /^[A-Za-z0-9+/=]*$/.test(body) ? s : null;
  }
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol === 'http:' || u.protocol === 'https:') return u.hostname ? u.href : null;
  if (u.protocol === 'mailto:' || u.protocol === 'tel:') return u.pathname ? u.href : null;
  return null;
}

export const isHttps = (raw) => {
  try {
    return new URL(String(raw)).protocol === 'https:';
  } catch {
    return false;
  }
};
