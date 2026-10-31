// Image-upload relay: the browser cannot POST to zi2.ir directly (the API sends no CORS headers),
// so the app hands the multipart body to this server, which forwards it unchanged to an allowlisted HTTPS host.
import { HttpError } from './http.js';

export const UPLOAD_LIMIT = 9 * 1024 * 1024; // the app caps images at 8MB; leave room for multipart framing
export const UPLOAD_HOSTS = ['zi2.ir', 'www.zi2.ir'];

/** Validate the target URL: HTTPS, an allowlisted host, no credentials. Returns a URL or throws 400. */
export function uploadTarget(raw, hosts = UPLOAD_HOSTS) {
  let u;
  try {
    u = new URL(String(raw || ''));
  } catch {
    throw new HttpError(400, 'bad-upload-target');
  }
  if (u.protocol !== 'https:' || u.username || u.password || !hosts.includes(u.hostname.toLowerCase())) throw new HttpError(400, 'upload-host-not-allowed');
  return u;
}

/** Forward `body` (already read, ≤ UPLOAD_LIMIT) with its multipart content type; returns {status, type, body}. */
export async function relayUpload(target, contentType, body, { fetchImpl = fetch, timeoutMs = 60000 } = {}) {
  if (!/^multipart\/form-data;\s*boundary=/i.test(contentType || '')) throw new HttpError(400, 'multipart-required');
  let r;
  try {
    r = await fetchImpl(target.href, {
      method: 'POST',
      headers: { 'Content-Type': contentType, Accept: 'application/json' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new HttpError(502, e.name === 'TimeoutError' ? 'upload-timeout' : 'upload-unreachable');
  }
  const out = Buffer.from(await r.arrayBuffer());
  return { status: r.status, type: r.headers.get('content-type') || 'application/octet-stream', body: out };
}
