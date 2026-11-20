// Shared helpers for the S3 tests: a temp server with an injectable fake renderer, and a tiny HTTP caller.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../../server/index.js';

export const LAN = { 'x-test-remote-addr': '192.168.1.50' };

export async function startServer({ chrome = '/fake/chrome', roots = [], renderTimeoutMs } = {}) {
  process.env.DOCLOOM_TEST = '1';
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'md2h-s3-'));
  const data = path.join(base, 'data');
  const rootDir = path.join(base, 'root');
  fs.mkdirSync(rootDir, { recursive: true });
  const srv = await createServer({ dataDir: data, echo: false, chrome, roots: [rootDir, ...roots], renderTimeoutMs });
  await new Promise((r) => srv.server.listen(0, '127.0.0.1', r));
  const port = srv.server.address().port;
  const call = (method, p, { headers = {}, body, raw } = {}) =>
    new Promise((resolve, reject) => {
      const payload = raw ?? (body === undefined ? null : JSON.stringify(body));
      const h = { Host: `127.0.0.1:${port}`, ...headers };
      if (method !== 'GET' && method !== 'HEAD' && p.startsWith('/api/') && h['X-DocLoom'] === undefined) {
        h['X-DocLoom'] = '1';
        h.Origin ??= `http://127.0.0.1:${port}`;
      }
      if (payload) h['Content-Length'] = Buffer.byteLength(payload);
      const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: h }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch { /* not json */ }
          resolve({ status: res.statusCode, headers: res.headers, text, json, buf });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  const stop = () => {
    delete process.env.DOCLOOM_TEST;
    srv.server.closeAllConnections?.();
    srv.server.close();
    fs.rmSync(base, { recursive: true, force: true });
  };
  return { srv, port, call, stop, root: fs.realpathSync(rootDir), data };
}

export const waitFor = async (fn, ms = 5000) => {
  const t = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t > ms) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
};
