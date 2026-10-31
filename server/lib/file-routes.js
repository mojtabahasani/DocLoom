// HTTP routes for the file service: /api/files/* and the SSE channel /api/watch?path=. Caller has already authenticated.
import { HttpError, readJson, sendJson } from './http.js';
import { FileError } from './files.js';

const asHttp = (e) => (e instanceof FileError ? Object.assign(new HttpError(e.status, e.message), e.current !== undefined ? { current: e.current } : {}) : e);

/** @returns {Promise<boolean>} true when the request was handled */
export async function handleFiles({ req, res, url, files, H, log }) {
  const p = url.pathname;
  const method = req.method;
  const q = (k) => url.searchParams.get(k) || '';
  try {
    if (p === '/api/watch' && method === 'GET') {
      // validate first so a bad path answers with a normal JSON error
      files.resolve(q('path'));
      res.writeHead(200, { ...H, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n\n');
      const off = files.watch(q('path'), (ev) => res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`));
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => {
        clearInterval(ping);
        off();
      });
      return true;
    }
    if (!p.startsWith('/api/files/')) return false;
    const op = p.slice('/api/files/'.length);

    if (op === 'roots' && method === 'GET') return sendJson(res, 200, { roots: files.roots }, H), true;
    if (op === 'list' && method === 'GET') return sendJson(res, 200, files.list(q('path')), H), true;
    if (op === 'search' && method === 'GET') return sendJson(res, 200, await files.search(q('q'), { type: q('type'), limit: q('limit') }), H), true;
    if (op === 'read' && method === 'GET') return sendJson(res, 200, files.read(q('path')), H), true;
    if (op === 'meta' && method === 'GET') return sendJson(res, 200, files.metaView(), H), true;
    if (op === 'backups' && method === 'GET') return sendJson(res, 200, { backups: files.backupsOf(q('path')) }, H), true;
    if (op === 'write' && method === 'POST') {
      const b = await readJson(req);
      if (typeof b.path !== 'string' || typeof b.content !== 'string') throw new HttpError(400, 'bad request');
      const content = b.encoding === 'base64' ? Buffer.from(b.content, 'base64') : b.content;
      const out = files.write(b.path, content, { etag: typeof b.etag === 'string' ? b.etag : undefined, overwrite: b.overwrite === true });
      log?.info(`file saved: ${out.path} (${out.size} bytes)`);
      return sendJson(res, 200, out, H), true;
    }
    if (op === 'mkdir' && method === 'POST') {
      const b = await readJson(req, 4096);
      return sendJson(res, 200, files.mkdir(b.path), H), true;
    }
    if (op === 'recent' && method === 'POST') {
      const b = await readJson(req, 4096);
      files.recent(b.path);
      return sendJson(res, 200, files.metaView(), H), true;
    }
    if (op === 'pin' && method === 'POST') {
      const b = await readJson(req, 4096);
      files.setPinned(b.path, b.pinned !== false);
      return sendJson(res, 200, files.metaView(), H), true;
    }
    sendJson(res, 404, { error: 'not-found' }, H);
    return true;
  } catch (e) {
    throw asHttp(e);
  }
}
