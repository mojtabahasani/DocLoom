// Rotating file logger: logs/server.log, rolled at `maxBytes`, keeping `keep` old files.
import fs from 'node:fs';
import path from 'node:path';
import { envVar } from './env.js';

export function createLogger(dir, { maxBytes = 1024 * 1024, keep = 5, echo = !!process.stdout.isTTY || envVar('STDOUT') === '1' } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'server.log');
  const rotate = () => {
    try {
      if (fs.statSync(file).size < maxBytes) return;
    } catch {
      return;
    }
    for (let i = keep - 1; i >= 1; i--) {
      try {
        fs.renameSync(`${file}.${i}`, `${file}.${i + 1}`);
      } catch {
        /* missing */
      }
    }
    fs.renameSync(file, `${file}.1`);
    try {
      fs.rmSync(`${file}.${keep + 1}`, { force: true });
    } catch {
      /* ignore */
    }
  };
  const write = (level, msg) => {
    const line = `${new Date().toISOString()} ${level} ${msg}\n`;
    try {
      rotate();
      fs.appendFileSync(file, line);
    } catch {
      /* logging must never crash the server */
    }
    if (echo) process.stdout.write(line);
  };
  return { file, info: (m) => write('INFO', m), warn: (m) => write('WARN', m), error: (m) => write('ERROR', m) };
}
