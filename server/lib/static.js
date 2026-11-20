// Static file serving from one directory (dist/pwa). Path is resolved and must stay inside the root.
import fs from 'node:fs';
import path from 'node:path';
import { MIME } from './http.js';

export function createStatic(root, extra = {}) {
  const base = fs.realpathSync(root);
  const alias = new Map(Object.entries(extra)); // url path -> absolute file (e.g. /DocLoom.html)
  return function serve(req, res, urlPath, headers) {
    let file;
    if (alias.has(urlPath)) file = alias.get(urlPath);
    else {
      let rel;
      try {
        rel = decodeURIComponent(urlPath);
      } catch {
        res.writeHead(400, headers).end('bad request');
        return true;
      }
      if (rel.includes('\0')) {
        res.writeHead(400, headers).end('bad request');
        return true;
      }
      if (rel.endsWith('/')) rel += 'index.html';
      file = path.join(base, path.normalize(rel));
    }
    let real;
    try {
      real = fs.realpathSync(file);
    } catch {
      return false;
    }
    if (!alias.has(urlPath) && real !== base && !real.startsWith(base + path.sep)) return false;
    let st;
    try {
      st = fs.statSync(real);
    } catch {
      return false;
    }
    if (!st.isFile()) return false;
    const ext = path.extname(real).toLowerCase();
    // sw.js and the HTML shell must always revalidate so `npm run build` is picked up without a restart.
    const h = { ...headers, 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': ext === '.png' || ext === '.woff2' ? 'public, max-age=86400' : 'no-cache' };
    res.writeHead(200, h);
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(real).pipe(res);
    return true;
  };
}
