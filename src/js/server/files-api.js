// Thin client for the server's /api/files/* endpoints.
import { bytesToBase64 } from './files-core.js';

async function call(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { 'X-DataSave': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'http ' + r.status), { status: r.status, current: j.current });
  return j;
}
const qs = (o) => new URLSearchParams(o).toString();

export const fapi = {
  roots: () => call('GET', '/api/files/roots'),
  list: (path) => call('GET', '/api/files/list?' + qs({ path: path || '' })),
  search: (q, type = '', limit = 80) => call('GET', '/api/files/search?' + qs({ q, type, limit })),
  read: (path) => call('GET', '/api/files/read?' + qs({ path })),
  /** content: string (UTF-8 text) or Uint8Array (binary). */
  write: (path, content, { etag, overwrite } = {}) =>
    call('POST', '/api/files/write', {
      path,
      ...(typeof content === 'string' ? { content } : { content: bytesToBase64(content), encoding: 'base64' }),
      ...(etag ? { etag } : {}),
      ...(overwrite ? { overwrite: true } : {}),
    }),
  mkdir: (path) => call('POST', '/api/files/mkdir', { path }),
  meta: () => call('GET', '/api/files/meta'),
  recent: (path) => call('POST', '/api/files/recent', { path }),
  pin: (path, pinned) => call('POST', '/api/files/pin', { path, pinned }),
};

export const errorText = (e) =>
  ({
    'outside-roots': 'این مسیر بیرون از پوشه‌های مجاز سرور است.',
    'ignored-dir': 'این پوشه جزو پوشه‌های نادیده‌گرفته‌شده است.',
    'extension-not-allowed': 'این نوع فایل مجاز نیست.',
    'file-too-large': 'فایل از ۵ مگابایت بزرگ‌تر است.',
    'not-found': 'فایل پیدا نشد.',
    'bad-name': 'نام فایل معتبر نیست.',
    'protected-file': 'این فایل دستورالعمل عامل‌های هوش مصنوعی است و از این برنامه نوشته نمی‌شود.',
    'read-only-root': 'این پوشه در سرور فقط‌خواندنی است.',
  })[e?.message] || 'انجام نشد: ' + (e?.message || 'خطای نامشخص');
