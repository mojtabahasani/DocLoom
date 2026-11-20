#!/usr/bin/env node
// DataSave server: static app + library sync + backups + PIN login. Pure Node, no npm dependencies.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from './lib/log.js';
import { Auth } from './lib/auth.js';
import { LibraryStore } from './lib/store.js';
import { Backups } from './lib/backup.js';
import { createApp } from './lib/app.js';
import { FileService, rootsFromEnv } from './lib/files.js';
import { RenderService, findChrome } from './lib/pdf.js';
import { BatchManager } from './lib/batch.js';
import { Shares } from './lib/shares.js';
// Imported, not just re-exported: `export { x } from …` does not bind the name in this module's
// own scope, and createServer()'s default parameter calls it.
import { envVar, defaultDataDir } from './lib/env.js';

export const PORT = 7123;
const here = path.dirname(fileURLToPath(import.meta.url));

export { defaultDataDir };

/**
 * Is the server reachable from the network, or from this Mac only?
 * `DATASAVE_LAN=1|0` (or the old `DATASAVE_LAN`) wins; otherwise the saved choice (`lan` in config.json, set from the server panel
 * or `datasave lan on|off`). A data folder from before the setting existed keeps the network open only
 * if a device is already signed in — an upgrade must not cut a phone off without a word — and a fresh
 * one starts closed.
 */
export function lanEnabled(auth, env = process.env) {
  if (envVar('LAN', env) === '1') return true;
  if (envVar('LAN', env) === '0') return false;
  const saved = auth.get('lan');
  if (typeof saved === 'boolean') return saved;
  return (auth.get('sessions') || []).length > 0;
}
export const listenHost = (lan) => (lan ? '0.0.0.0' : '127.0.0.1');

/** Build (but do not listen on) a server. Returns {server, auth, store, backups, log, firstPin}. */
export async function createServer({ dataDir = defaultDataDir(), port = PORT, roots = rootsFromEnv(), webRoot = path.join(here, '..', 'dist', 'pwa'), echo, chrome = findChrome(), renderTimeoutMs, onLanChange } = {}) {
  for (const d of ['library', 'backups', 'shares', 'logs']) fs.mkdirSync(path.join(dataDir, d), { recursive: true });
  const log = createLogger(path.join(dataDir, 'logs'), echo === undefined ? {} : { echo });
  const auth = new Auth(dataDir);
  const firstPin = await auth.ensurePin();
  const store = new LibraryStore(path.join(dataDir, 'library'));
  const backups = new Backups(path.join(dataDir, 'backups'), store, log);
  const files = new FileService({ roots, dataDir, log });
  let server;
  const render = new RenderService({ chrome, log, timeoutMs: renderTimeoutMs, getBase: () => `http://127.0.0.1:${server.address()?.port || port}` });
  const resolveBrand = (x) => {
    const live = store.list('brands').filter((e) => !e.deleted);
    if (live.some((e) => e.id === x)) return x;
    return live.find((e) => store.get('brands', e.id)?.data?.name === x)?.id || null;
  };
  const batch = new BatchManager({ files, render: (spec) => render.render(spec), resolveBrand, log });
  const shares = new Shares(path.join(dataDir, 'shares'), log);
  const lan = {
    enabled: () => lanEnabled(auth),
    /** False when the environment pins the choice: the panel must not pretend it changed anything. */
    canChange: () => envVar('LAN') !== '1' && envVar('LAN') !== '0',
    set(on) {
      auth.set('lan', !!on);
      log.info(`network access turned ${on ? 'ON' : 'OFF'}`);
      onLanChange?.(!!on);
    },
  };
  const handler = createApp({ auth, store, backups, log, files, render, batch, shares, webRoot, dataDir, port, lan });
  server = http.createServer(handler);
  server.requestTimeout = 0; // SSE streams are long-lived
  server.on('close', () => {
    files.close();
    render.close();
    shares.stop();
  });
  return { server, auth, store, backups, log, firstPin, dataDir, files, render, batch, shares, lan };
}

async function main() {
  const port = Number(envVar('PORT')) || PORT;
  let s;
  const listen = (then) => {
    const host = listenHost(lanEnabled(s.auth));
    s.server.listen(port, host, () => {
      s.log.info(`DataSave server listening on ${host}:${port} (data: ${s.dataDir})${host === '127.0.0.1' ? ' - this Mac only; open the network with: datasave lan on' : ''}`);
      then?.();
    });
  };
  // The listening address cannot change on a live socket: stop accepting, drop what is open
  // (clients reconnect by themselves: SSE retries, sync polls) and listen again on the other address.
  const rebind = () => {
    s.server.close(() => listen());
    s.server.closeAllConnections?.();
  };
  s = await createServer({ port, onLanChange: () => setTimeout(rebind, 150) }); // after the reply to the request that asked for it
  if (typeof s.auth.get('lan') !== 'boolean') s.auth.set('lan', lanEnabled(s.auth, {})); // write the upgrade decision down once
  s.server.on('error', (e) => {
    s.log.error('server error: ' + e.message);
    process.exit(1);
  });
  listen(() => {
    if (s.firstPin) s.log.info(`FIRST-RUN PIN: ${s.firstPin}  (shown once; change it with: datasave pin)`);
    s.backups.start();
    s.shares.start();
    s.log.info(s.render.available() ? `PDF: Chrome found (${s.render.chrome})` : 'PDF: Chrome not found - direct PDF is off (set DATASAVE_CHROME)');
  });
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => s.server.close(() => process.exit(0)) && setTimeout(() => process.exit(0), 500).unref());
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
