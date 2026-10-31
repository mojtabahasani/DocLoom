// The request handler: guards (private IP, Host, CSRF, auth) → API routes → static files.
import fs from 'node:fs';
import { normalizeIp, isPrivateIp, isLoopback, hostAllowed, lanAddresses, localHostname } from './net.js';
import { csrfOk, securityHeaders, LoginLimiter } from './security.js';
import { HttpError, readJson, sendJson, parseCookies, deviceLabel } from './http.js';
import { COOKIE, SESSION_MS } from './auth.js';
import { createStatic } from './static.js';
import { loginPage } from './loginpage.js';
import { StoreError, STORES } from './store.js';

export const VERSION = '1.0.0';

/** The client address. A test-only override header is honoured ONLY when MD2HTML_TEST=1. */
export function clientIp(req, env = process.env) {
  if (env.MD2HTML_TEST === '1' && req.headers['x-test-remote-addr']) return normalizeIp(req.headers['x-test-remote-addr']);
  return normalizeIp(req.socket.remoteAddress);
}

export function createApp({ auth, store, backups, log, webRoot, dataDir, port, lanIps = lanAddresses, limiter = new LoginLimiter() }) {
  const serve = createStatic(webRoot, { '/MD2Html.html': new URL('../../dist/MD2Html.html', import.meta.url).pathname });
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
    const client = String(req.headers['x-md2html-client'] || '').slice(0, 40);
    if (p === '/api/health') return sendJson(res, 200, { ok: true, app: 'md2html', version: VERSION, time: Date.now() }, H);

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

    if (p === '/api/server/info' && method === 'GET') {
      const ips = lanIps();
      const last = backups.list()[0] || null;
      return sendJson(res, 200, {
        version: VERSION, port, dataDir, local: ctx.local, hostname: localHostname(),
        urls: ips.map((ip) => `http://${ip}:${port}`), localUrl: `http://localhost:${port}`,
        lastBackup: last, documents: store.list('documents').filter((e) => !e.deleted).length,
      }, H);
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
      if (!isPrivateIp(ip)) return fail(res, 403, 'Forbidden');
      if (!hostAllowed(req.headers.host, lanIps())) return fail(res, 421, 'Misdirected request');
      const url = new URL(req.url, 'http://x');
      if (!csrfOk(req.method, url.pathname, req.headers)) return fail(res, 403, 'CSRF check failed');
      const local = isLoopback(ip);
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
      if (e instanceof HttpError || e instanceof StoreError) {
        if (!res.headersSent) sendJson(res, e.status, { error: e.message, ...(e.current !== undefined ? { current: e.current } : {}) }, securityHeaders());
        return;
      }
      log.error(`${req.method} ${req.url}: ${e.stack || e}`);
      if (!res.headersSent) fail(res, 500, 'Internal error');
      else res.end();
    }
  };
}
