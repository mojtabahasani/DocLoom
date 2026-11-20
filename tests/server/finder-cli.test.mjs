import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { WORKFLOWS, FILE_TYPES, OPEN_SCRIPT, PDF_SCRIPT, build } from '../../server/finder/build-workflows.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

for (const w of WORKFLOWS) {
  test(`${w.dir}: Info.plist declares a Finder service for text/html/markdown files; document.wflow runs the script`, () => {
    const info = fs.readFileSync(path.join(root, 'server/finder', w.dir, 'Contents/Info.plist'), 'utf8');
    assert.ok(info.includes(`<key>default</key>\n\t\t\t\t<string>${w.menu}</string>`), 'menu title');
    assert.match(info, /<key>NSMessage<\/key>\s*<string>runWorkflowAsService<\/string>/);
    assert.match(info, /<key>NSApplicationIdentifier<\/key>\s*<string>com\.apple\.finder<\/string>/);
    for (const t of FILE_TYPES) assert.ok(info.includes(`<string>${t}</string>`), t);
    for (const t of ['public.text', 'public.html', 'net.daringfireball.markdown']) assert.ok(info.includes(t));
    const wf = fs.readFileSync(path.join(root, 'server/finder', w.dir, 'Contents/document.wflow'), 'utf8');
    assert.match(wf, /<key>com\.apple\.Automator\.servicesMenu|<string>com\.apple\.Automator\.servicesMenu<\/string>/);
    assert.match(wf, /<key>inputMethod<\/key>\s*<integer>1<\/integer>/, 'files arrive as arguments');
    assert.match(wf, /com\.apple\.Automator\.fileSystemObject/);
    const m = /<key>COMMAND_STRING<\/key>\s*<string>([\s\S]*?)<\/string>/.exec(wf.slice(wf.indexOf('ActionParameters')));
    assert.equal(unesc(m[1]), w.script, 'embedded script equals the generator source');
    const sh = spawnSync('bash', ['-n'], { input: w.script });
    assert.equal(sh.status, 0, sh.stderr.toString());
    if (process.platform === 'darwin') for (const f of ['Info.plist', 'document.wflow']) assert.equal(spawnSync('plutil', ['-lint', path.join(root, 'server/finder', w.dir, 'Contents', f)]).status, 0, 'plutil ' + f);
  });
}

test('the committed bundles are exactly what the generator produces', () => {
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'md2h-wf-'));
  build(tmp);
  for (const w of WORKFLOWS) for (const f of ['Info.plist', 'document.wflow']) assert.equal(fs.readFileSync(path.join(tmp, w.dir, 'Contents', f), 'utf8'), fs.readFileSync(path.join(root, 'server/finder', w.dir, 'Contents', f), 'utf8'), `${w.dir}/${f} is stale: run node server/finder/build-workflows.mjs`);
  fs.rmSync(tmp, { recursive: true });
});

test('actions: the open script percent-encodes Persian paths; the PDF script posts a beside-batch', () => {
  const run = (script, args, extra = {}) => execFileSync('bash', ['-c', script, 'x', ...args], { encoding: 'utf8', ...extra });
  const fakeBin = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'md2h-bin-'));
  const sed = OPEN_SCRIPT.replace('/usr/bin/open', 'echo');
  assert.equal(run(sed, ['/a b/سند.md']).trim(), 'http://localhost:7123/?open=/a%20b/%D8%B3%D9%86%D8%AF.md');
  assert.match(PDF_SCRIPT, /"formats\\":\[\\"pdf\\"\]|\\"formats\\":\[\\"pdf\\"\]/);
  assert.match(PDF_SCRIPT, /dest\\":\{\\"mode\\":\\"beside/);
  assert.match(PDF_SCRIPT, /osascript/);
  fs.rmSync(fakeBin, { recursive: true });
});

test('install/uninstall dry-runs list the Quick Actions without touching HOME', () => {
  const home = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'md2h-home-'));
  const out = execFileSync('bash', [path.join(root, 'server/install.sh'), '--dry-run', path.join(home, 'x.plist')], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  assert.match(out, /would copy:.*DocLoom Open\.workflow -> .*Library\/Services\/DocLoom Open\.workflow/);
  assert.match(out, /would copy:.*DocLoom PDF\.workflow/);
  const un = execFileSync('bash', [path.join(root, 'server/uninstall.sh'), '--dry-run'], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  assert.match(un, /would remove: .*Library\/Services\/DocLoom PDF\.workflow/);
  assert.deepEqual(fs.readdirSync(home), ['x.plist']);
  fs.rmSync(home, { recursive: true });
});

const tmpDir = fs.realpathSync(os.tmpdir());
const cli = (args, env = {}) => spawnSync('bash', [path.join(root, 'server/cli/docloom'), ...args], { encoding: 'utf8', env: { ...process.env, DOCLOOM_DRY: '1', ...env }, cwd: tmpDir });

test('CLI: pdf / html argument parsing builds the batch request', () => {
  const r = cli(['pdf', 'a b.md', '/abs/dir', '--brand', 'برند "۱"', '--out', 'outdir', '--pages']);
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.deepEqual(body.paths, [path.join(tmpDir, 'a b.md'), '/abs/dir']);
  assert.deepEqual(body.formats, ['pdf']);
  assert.equal(body.brand, 'برند "۱"');
  assert.equal(body.pageNumbers, true);
  assert.deepEqual(body.dest, { mode: 'folder', dir: path.join(tmpDir, 'outdir') });
  const h = JSON.parse(cli(['html', '/x/y.md', '--cleanup']).stdout);
  assert.deepEqual(h.formats, ['html']);
  assert.deepEqual(h.dest, { mode: 'beside' });
  assert.equal(h.cleanup, true);
  assert.equal(h.brand, undefined);
});

test('CLI: bad arguments exit 2 with a message; help lists the new commands', () => {
  assert.equal(cli(['pdf']).status, 2);
  assert.equal(cli(['pdf', 'x.md', '--bogus']).status, 2);
  assert.equal(cli(['pdf', 'x.md', '--brand']).status, 2);
  const help = cli(['help']).stdout;
  assert.match(help, /docloom pdf/);
  assert.match(help, /docloom html/);
});
