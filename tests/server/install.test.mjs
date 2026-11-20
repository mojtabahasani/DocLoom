import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'md2h-inst-'));

for (const f of ['server/install.sh', 'server/uninstall.sh', 'server/cli/datasave']) {
  test(`${f} passes bash -n`, () => {
    assert.equal(spawnSync('bash', ['-n', path.join(root, f)]).status, 0);
  });
}

test('install.sh --dry-run writes a valid plist and performs nothing else', () => {
  const plist = path.join(tmp, 'x.plist');
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home);
  const out = execFileSync('bash', [path.join(root, 'server/install.sh'), '--dry-run', plist], { env: { ...process.env, HOME: home, DATASAVE_DATA: path.join(tmp, 'data & <x>') }, encoding: 'utf8' });
  assert.match(out, /\[dry-run\] plist written to/);
  assert.match(out, /launchctl bootstrap gui\/\d+/);
  assert.match(out, /ln -sf .*cli\/datasave .*\.local\/bin\/datasave/);
  const xml = fs.readFileSync(plist, 'utf8');
  assert.match(xml, /<key>Label<\/key><string>ir\.computer123\.datasave<\/string>/);
  assert.match(xml, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(xml, /<key>KeepAlive<\/key><true\/>/);
  assert.ok(xml.includes(`<string>${root}/server/index.js</string>`));
  assert.ok(xml.includes(`<key>WorkingDirectory</key><string>${root}</string>`));
  assert.match(xml, /<string>\/[^<]*node<\/string>/, 'absolute node path');
  assert.ok(xml.includes('data &amp; &lt;x&gt;'), 'XML-escaped data dir');
  assert.deepEqual(fs.readdirSync(home), [], 'dry-run must not touch HOME');
  if (process.platform === 'darwin') assert.equal(spawnSync('plutil', ['-lint', plist]).status, 0, 'plutil -lint');
});

test('uninstall.sh --dry-run and the CLI help only print', () => {
  const out = execFileSync('bash', [path.join(root, 'server/uninstall.sh'), '--dry-run'], { encoding: 'utf8' });
  assert.match(out, /would run: launchctl bootout/);
  assert.match(out, /would keep:/);
  const help = execFileSync('bash', [path.join(root, 'server/cli/datasave'), 'help'], { encoding: 'utf8' });
  for (const w of ['status', 'open', 'pin', 'RESET', 'logs', 'restart', 'start', 'stop']) assert.ok(help.includes(w), w);
});
