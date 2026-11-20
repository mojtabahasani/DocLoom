// The request handler: guards (private IP, Host, CSRF, auth) → API routes → static files.
import fs from 'node:fs';
import os from 'node:os';
import { normalizeIp, isPrivateIp, onLocalSubnet, isLoopback, hostAllowed, lanAddresses, localHostname } from './net.js';
import { csrfOk, securityHeaders, LoginLimiter } from './security.js';
import { HttpError, readBody, readJson, sendJson, parseCookies, deviceLabel } from './http.js';
import { UPLOAD_LIMIT, uploadTarget, relayUpload } from './upload-proxy.js';
import { COOKIE, SESSION_MS } from './auth.js';
import { createStatic } from './static.js';
import { loginPage } from './loginpage.js';
import { StoreError, STORES } from './store.js';
import { handleFiles } from './file-routes.js';
import { FileError } from './files.js';
import { RenderError } from './pdf.js';
import { BatchError } from './batch.js';
import { SHARE_ID_RE, SHARE_CSP, gonePage } from './shares.js';
import { envVar } from './env.js';

// One source of truth for the version: package.json, the same file the client build reads.
export const VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

/** The client address. A test-only override header is honoured ONLY when DATASAVE_TEST=1. */
export function clientIp(req, env = process.env) {
  if (envVar('TEST', env) === '1' && req.headers['x-test-remote-addr']) return normalizeIp(req.headers['x-test-remote-addr']);
  return normalizeIp(req.socket.remoteAddress);
}

export function createApp({ auth, store, backups, log, files, render, batch, shares, webRoot, dataDir, port, lanIps = lanAddresses, netIfaces = () => os.networkInterfaces(), limiter = new LoginLimiter(), lan = { enabled: () => true, canChange: () => false, set() {} } }) {
  // The repo root copy, not dist/: it is the tracked deliverable, so it exists in a fresh clone before any build.
  const serve = createStatic(webRoot, { '/DataSave.html': new URL('../../DataSave.html', import.meta.url).pathname });
  const sse = new Set(); // {res, sid}
  const H = securityHeaders();
  store.on('change', (e) => {
    const msg = `event: change\ndata: ${JSON.stringify(e)}\n\n`;
    for (const c of sse) c.res.write(msg);
  });
  const heartbeat = setInterval(() => sse.forEach((c) => c.res.write(': ping\n\n')), 25000);
  heartbeat.unref();

  const fail = (res, status, text) => {
    res.writeHead(status, { ...H, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(text);
  };

  async function api(req, res, url, ctx) {
    const { method } = req;
    const p = url.pathname;
    const parts = p.split('/').slice(2); // after /api
    const client = String(req.headers['x-datasave-client'] || '').slice(0, 40);
    if (p === '/api/health') return sendJson(res, 200, { ok: true, app: 'datasave', version: VERSION, time: Date.now() }, H);

    if (p === '/api/login' && method === 'POST') {
      const wait = limiter.lockedFor(ctx.ip);
      if (wait) return sendJson(res, 429, { error: 'locked', retryAfter: Math.ceil(wait / 1000) }, H);
      const body = await readJson(req, 4096);
      if (!(await auth.verify(body.pin))) {
        const r = limiter.fail(ctx.ip);
        log.warn(`wrong PIN from ${ctx.ip} (${r.fails})${r.locked ? ' - locked' : ''}`);
        return sendJson(res, r.locked ? 429 : 401, { error: r.locked ? 'locked' : 'wrong-pin', left: r.left, retryAfter: r.locked ? Math.ceil(limiter.lockedFor(ctx.ip) / 1000) : 0 }, H);
      }
      limiter.success(ctx.ip);
      const ua = String(req.headers['user-agent'] || '');
      const token = auth.createSession({ ua, label: deviceLabel(ua), ip: ctx.ip });
      log.info(`login from ${ctx.ip} (${deviceLabel(ua)})`);
      return sendJson(res, 200, { ok: true }, { ...H, 'Set-Cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}` });
    }
    if (!ctx.authed) return sendJson(res, 401, { error: 'auth-required' }, H);
    if (p === '/api/logout' && method === 'POST') {
      if (ctx.session) auth.revoke(ctx.session.id);
      return sendJson(res, 200, { ok: true }, { ...H, 'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
    }
    if (p === '/api/session') return sendJson(res, 200, { local: ctx.local, device: ctx.session?.id || null }, H);

    if (p === '/api/events' && method === 'GET') {
      res.writeHead(200, { ...H, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n\n');
      const c = { res, sid: ctx.session?.id || null };
      sse.add(c);
      req.on('close', () => sse.delete(c));
      return;
    }

    if (files && (p === '/api/watch' || p.startsWith('/api/files/'))) {
      if (await handleFiles({ req, res, url, files, H, log })) return;
    }

    if (p === '/api/upload' && method === 'POST') {
      const target = uploadTarget(req.headers['x-upload-target']);
      const out = await relayUpload(target, req.headers['content-type'], await readBody(req, UPLOAD_LIMIT));
      log.info(`upload relay → ${target.host} ${out.status}`);
      res.writeHead(out.status, { ...H, 'Content-Type': out.type, 'Cache-Control': 'no-store' });
      return res.end(out.body);
    }
    if (p === '/api/pdf/status' && method === 'GET') return sendJson(res, 200, { available: !!render?.available() }, H);
    if (p === '/api/pdf' && method === 'POST') {
      if (!render?.available()) throw new HttpError(503, 'chrome-unavailable');
      const b = await readJson(req);
      const spec = { want: { pdf: true }, pageNumbers: b.pageNumbers === true };
      if (typeof b.html === 'string' && b.html) spec.html = b.html;
      else if (typeof b.doc === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(b.doc)) spec.doc = b.doc;
      else if (typeof b.path === 'string' && files) spec.path = files.resolve(b.path).real;
      else throw new HttpError(400, 'bad request');
      if (b.brand) {
        spec.brand = batch ? batch.resolveBrand(String(b.brand)) : null;
        if (!spec.brand) throw new HttpError(400, 'brand-not-found');
      }
      try {
        const out = await render.render(spec);
        res.writeHead(200, { ...H, 'Content-Type': 'application/pdf', 'Content-Length': out.pdf.length, 'Cache-Control': 'no-store' });
        return res.end(out.pdf);
      } catch (e) {
        if (e instanceof RenderError) throw new HttpError(e.code === 'chrome-unavailable' ? 503 : 500, e.code === 'render-failed' ? e.message : e.code);
        throw e;
      }
    }
    if (p === '/api/batch' && method === 'POST') {
      if (!batch || !render?.available()) throw new HttpError(503, 'chrome-unavailable');
      return sendJson(res, 202, batch.create(await readJson(req)), H);
    }
    if (parts[0] === 'batch' && parts[1] && batch) {
      if (method === 'GET') {
        if (url.searchParams.get('text') === '1') {
          const t = batch.text(parts[1]);
          if (!t) return sendJson(res, 404, { error: 'not-found' }, H);
          res.writeHead(200, { ...H, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
          return res.end(t);
        }
        const v = batch.get(parts[1]);
        return v ? sendJson(res, 200, v, H) : sendJson(res, 404, { error: 'not-found' }, H);
      }
      if (method === 'DELETE') {
        const v = batch.cancel(parts[1]);
        return v ? sendJson(res, 200, v, H) : sendJson(res, 404, { error: 'not-found' }, H);
      }
    }
    if (p === '/api/shares' && shares) {
      if (method === 'GET') return sendJson(res, 200, { shares: shares.list() }, H);
      if (method === 'POST') {
        const b = await readJson(req);
        try {
          const m = shares.create({ html: b.html, title: b.title, expires: b.expires || '7d' });
          return sendJson(res, 201, { ...m, path: `/s/${m.id}` }, H);
        } catch (e) {
          throw e.status ? new HttpError(e.status, e.message) : e;
        }
      }
    }
    if (parts[0] === 'shares' && parts[1] && method === 'DELETE' && shares) {
      const ok = SHARE_ID_RE.test(parts[1]) && shares.revoke(parts[1]);
      return sendJson(res, ok ? 200 : 404, { ok }, H);
    }

    if (p === '/api/server/info' && method === 'GET') {
      const ips = lanIps();
      const last = backups.list()[0] || null;
      return sendJson(res, 200, {
        version: VERSION, port, dataDir, local: ctx.local, hostname: localHostname(),
        lan: lan.enabled(), lanCanChange: lan.canChange(),
        urls: lan.enabled() ? ips.map((ip) => `http://${ip}:${port}`) : [], localUrl: `http://localhost:${port}`,
        lastBackup: last, documents: store.list('documents').filter((e) => !e.deleted).length,
      }, H);
    }
    if (p === '/api/server/lan' && method === 'POST') {
      // Opening the server to the network is the Mac owner's decision: never a signed-in phone's.
      if (!ctx.local) throw new HttpError(403, 'network access can be changed from the Mac only');
      if (!lan.canChange()) throw new HttpError(409, 'fixed-by-env');
      const b = await readJson(req, 4096);
      if (typeof b.on !== 'boolean') throw new HttpError(400, 'bad request');
      if (b.on !== lan.enabled()) lan.set(b.on);
      return sendJson(res, 200, { lan: b.on }, H);
    }
    if (p === '/api/pin/reset' && method === 'POST') {
      if (!ctx.local) throw new HttpError(403, 'PIN can be reset from the Mac only');
      const pin = await auth.resetPin();
      for (const c of [...sse]) if (c.sid) { c.res.end(); sse.delete(c); }
      log.info('PIN reset (all devices signed out)');
      return sendJson(res, 200, { pin }, H);
    }
    if (p === '/api/devices' && method === 'GET') return sendJson(res, 200, { devices: auth.devices().map((d) => ({ ...d, current: d.id === ctx.session?.id })) }, H);
    if (parts[0] === 'devices' && parts[1] && method === 'DELETE') {
      const ok = auth.revoke(parts[1]);
      for (const c of [...sse]) if (c.sid === parts[1]) { c.res.end(); sse.delete(c); }
      return sendJson(res, ok ? 200 : 404, { ok }, H);
    }

    if (p === '/api/backups' && method === 'GET') return sendJson(res, 200, { backups: backups.list() }, H);
    if (p === '/api/backups' && method === 'POST') {
      backups.daily();
      return sendJson(res, 200, { backups: backups.list() }, H);
    }
    if (parts[0] === 'backups' && parts[2] === 'restore' && method === 'POST') {
      try {
        return sendJson(res, 200, backups.restore(decodeURIComponent(parts[1])), H);
      } catch (e) {
        if (e.status) throw new HttpError(e.status, e.message);
        throw e;
      }
    }

    // Read-only window onto what deletes left behind. There is no route that removes anything from it.
    if (parts[0] === 'retired' && method === 'GET') {
      try {
        if (parts.length === 1) return sendJson(res, 200, store.retiredOf(url.searchParams.get('doc') || ''), H);
        const [, s, a, b] = parts;
        const e = parts.length === 4 ? store.getRetired(s, b, a) : parts.length === 3 ? store.getRetired(s, a) : null;
        return e ? sendJson(res, 200, e, H) : sendJson(res, 404, { error: 'not-found' }, H);
      } catch (e) {
        if (e.status) throw new HttpError(e.status, e.message);
        throw e;
      }
    }

    if (p === '/api/sync/index' && method === 'GET') return sendJson(res, 200, { items: store.all() }, H);
    if (p === '/api/lib/fetch' && method === 'POST') {
      const { keys } = await readJson(req);
      if (!Array.isArray(keys) || keys.length > 50) throw new HttpError(400, 'bad keys');
      const items = keys.map((k) => store.get(String(k.store), String(k.id))).filter(Boolean);
      return sendJson(res, 200, { items }, H);
    }
    if (parts[0] === 'lib' && STORES.includes(parts[1])) {
      const [, s, id] = parts;
      if (!id && method === 'GET') return sendJson(res, 200, { items: store.list(s) }, H);
      if (id && method === 'GET') {
        const e = store.get(s, id);
        return e ? sendJson(res, 200, e, H) : sendJson(res, 404, { error: 'not-found' }, H);
      }
      if (id && method === 'PUT') {
        const b = await readJson(req);
        return sendJson(res, 200, store.put(s, id, { ts: b.ts, data: b.data, ifTs: 'ifTs' in b ? b.ifTs : undefined, by: client }), H);
      }
      if (id && method === 'DELETE') {
        const ts = Number(url.searchParams.get('ts')) || Date.now();
        return sendJson(res, 200, store.del(s, id, { ts, by: client }), H);
      }
    }
    return sendJson(res, 404, { error: 'not-found' }, H);
  }

  return async function handler(req, res) {
    try {
      const ip = clientIp(req);
      if (!isPrivateIp(ip) && !onLocalSubnet(ip, netIfaces())) return fail(res, 403, 'Forbidden');
      if (!hostAllowed(req.headers.host, lanIps())) return fail(res, 421, 'Misdirected request');
      const url = new URL(req.url, 'http://x');
      if (!csrfOk(req.method, url.pathname, req.headers)) return fail(res, 403, 'CSRF check failed');
      const local = isLoopback(ip);
      if (url.pathname.startsWith('/s/') && (req.method === 'GET' || req.method === 'HEAD') && shares) {
        const id = url.pathname.slice(3);
        const r = SHARE_ID_RE.test(id) ? shares.open(id, { count: req.method === 'GET' }) : { status: 'missing' };
        const base = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': SHARE_CSP };
        if (r.status === 'ok') {
          res.writeHead(200, base);
          return res.end(req.method === 'HEAD' ? undefined : r.html);
        }
        const gone = r.status === 'gone';
        res.writeHead(gone ? 410 : 404, base);
        return res.end(gone ? gonePage() : '<!doctype html><meta charset="utf-8"><title>پیدا نشد</title><p dir="rtl">پیدا نشد.</p>');
      }
      if (url.pathname === '/render') {
        // Only Chrome started by this server may load the render page: loopback, or a LAN client holding the job's secret token.
        const tokenOk = !!render?.validToken(url.searchParams.get('t'));
        if (!render || !(local || tokenOk)) return fail(res, 403, 'Forbidden');
        const sid = url.searchParams.get('staged');
        if (sid) {
          const html = tokenOk ? render.stagedHtml(sid) : null;
          if (html == null) return fail(res, tokenOk ? 404 : 403, tokenOk ? 'Not found' : 'Forbidden');
          res.writeHead(200, { ...H, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
          return res.end(html);
        }
        if (!serve(req, res, '/index.html', H)) fail(res, 404, 'Not found');
        return;
      }
      const session = local ? null : auth.find(parseCookies(req.headers.cookie)[COOKIE]);
      const ctx = { ip, local, session, authed: local || !!session };
      if (url.pathname.startsWith('/api/')) return await api(req, res, url, ctx);
      if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed');
      if (!ctx.authed) {
        res.writeHead(200, { ...H, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(loginPage());
      }
      if (url.pathname === '/') url.pathname = '/index.html';
      if (!serve(req, res, url.pathname, H)) fail(res, 404, 'Not found');
    } catch (e) {
      if (e instanceof HttpError || e instanceof StoreError || e instanceof FileError || e instanceof BatchError) {
        if (!res.headersSent) sendJson(res, e.status, { error: e.message, ...(e.current !== undefined ? { current: e.current } : {}) }, securityHeaders());
        return;
      }
      log.error(`${req.method} ${req.url}: ${e.stack || e}`);
      if (!res.headersSent) fail(res, 500, 'Internal error');
      else res.end();
    }
  };
}
