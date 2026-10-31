// zi2.ir upload API details (pure). The live API is /api/v1/upload.php: multipart field `image`,
// reply {success, file: {id, path}} where `path` is relative to the site root. The older handler
// (/api/upload/upload.php, field `file`, reply data.upload.fileUrl) no longer exists on the host.
export const ZI2_ENDPOINT = 'https://zi2.ir/api/v1/upload.php';
const RETIRED = /^https:\/\/(www\.)?zi2\.ir\/api\/upload\/upload\.php$/i;
const V1 = /\/api\/v1\/upload\.php$/i;

/** Settings saved with the retired default point at a 404: move them to the live endpoint. */
export const migrateEndpoint = (endpoint) => (RETIRED.test(String(endpoint || '').trim()) ? ZI2_ENDPOINT : endpoint);

export function fieldFor(endpoint, configured) {
  try {
    if (V1.test(new URL(endpoint).pathname)) return 'image';
  } catch {
    /* invalid URL: the caller rejects it before uploading */
  }
  return configured || 'file';
}

/** The direct image URL from either reply shape, or '' when the reply has none. */
export function imageUrlFrom(result, endpoint) {
  if (result?.file?.path) {
    try {
      return new URL(String(result.file.path).replace(/^\/+/, ''), new URL('/', endpoint)).href;
    } catch {
      return '';
    }
  }
  const item = result?.data?.upload || result?.data || {};
  let url = String(item.fileUrl || item.url || '');
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (/\/api\/upload\/upload\.php\/storage\/uploads\//.test(parsed.pathname)) {
      parsed.pathname = '/storage/uploads/' + parsed.pathname.split('/storage/uploads/').pop();
      url = parsed.href;
    }
  } catch {
    return '';
  }
  return url;
}
