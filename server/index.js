#!/usr/bin/env node
// MD2Html server: static app + library sync + backups + PIN login. Pure Node, no npm dependencies.
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

export const PORT = 4123;
const here = path.dirname(fileURLToPath(import.meta.url));

export const defaultDataDir = () => process.env.MD2HTML_DATA || path.join(os.homedir(), 'Documents', 'MD2Html');

/** Build (but do not listen on) a server. Returns {server, auth, store, backups, log, firstPin}. */
export async function createServer({ dataDir = defaultDataDir(), port = PORT, roots = rootsFromEnv(), webRoot = path.join(here, '..', 'dist', 'pwa'), echo, chrome = findChrome(), renderTimeoutMs } = {}) {
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
  const handler = createApp({ auth, store, backups, log, files, render, batch, shares, webRoot, dataDir, port });
  server = http.createServer(handler);
  server.requestTimeout = 0; // SSE streams are long-lived
  server.on('close', () => {
    files.close();
    render.close();
    shares.stop();
  });
  return { server, auth, store, backups, log, firstPin, dataDir, files, render, batch, shares };
}

async function main() {
  const port = Number(process.env.MD2HTML_PORT) || PORT;
  const s = await createServer({ port });
  s.server.on('error', (e) => {
    s.log.error('server error: ' + e.message);
    process.exit(1);
  });
  s.server.listen(port, '0.0.0.0', () => {
    s.log.info(`MD2Html server listening on 0.0.0.0:${port} (data: ${s.dataDir})`);
    if (s.firstPin) s.log.info(`FIRST-RUN PIN: ${s.firstPin}  (shown once; change it with: md2html pin)`);
    s.backups.start();
    s.shares.start();
    s.log.info(s.render.available() ? `PDF: Chrome found (${s.render.chrome})` : 'PDF: Chrome not found - direct PDF is off (set MD2HTML_CHROME)');
  });
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => s.server.close(() => process.exit(0)) && setTimeout(() => process.exit(0), 500).unref());
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
