// MD2Html build: bundles src/ into one self-contained HTML file.
//   dist/MD2Html.html  -> copied to ./MD2Html.html
// dist/pwa/ is added by package 1B: register another entry in `targets` below.
import { build, transform } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile, readdir, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const p = (...a) => path.join(root, ...a);
const MAX_BYTES = 900 * 1024;

// CSS concat order matters (tokens first).
const CSS_ORDER = ['tokens', 'layout', 'components', 'document', 'print'];
const FONTS = [
  { file: 'Vazirmatn-Regular.subset.woff2', weight: 400 },
  { file: 'Vazirmatn-Bold.subset.woff2', weight: 700 },
];

async function bundleJS() {
  const out = await build({
    entryPoints: [p('src/js/app.js')],
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2022',
    legalComments: 'none',
    write: false,
  });
  // A literal "</script" inside inline JS would end the script block early.
  return out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}

async function bundleCSS() {
  const files = (await readdir(p('src/styles'))).filter((f) => f.endsWith('.css'));
  const ordered = [
    ...CSS_ORDER.filter((n) => files.includes(n + '.css')).map((n) => n + '.css'),
    ...files.filter((f) => !CSS_ORDER.includes(f.replace(/\.css$/, ''))).sort(),
  ];
  const parts = await Promise.all(ordered.map((f) => readFile(p('src/styles', f), 'utf8')));
  const { code } = await transform(parts.join('\n'), { loader: 'css', minify: true });
  return code;
}

async function fontCSS() {
  const faces = [];
  for (const f of FONTS) {
    const b64 = (await readFile(p('src/fonts', f.file))).toString('base64');
    faces.push(
      `@font-face{font-family:Vazirmatn;font-style:normal;font-weight:${f.weight};font-display:block;` +
        `src:url(data:font/woff2;base64,${b64}) format("woff2")}`,
    );
  }
  return faces.join('');
}

const inject = (html, marker, value) => {
  if (!html.includes(marker)) throw new Error('Missing placeholder ' + marker);
  return html.replace(marker, () => value); // function form: no $-pattern surprises
};

async function buildSingle() {
  const [tpl, js, css, font] = await Promise.all([
    readFile(p('src/index.html'), 'utf8'),
    bundleJS(),
    bundleCSS(),
    fontCSS(),
  ]);
  let html = inject(tpl, '<!--FONT-->', `<style id="md2html-font">${font}</style>`);
  html = inject(html, '<!--CSS-->', `<style>${css}</style>`);
  html = inject(html, '<!--JS-->', `<script>${js}</script>`);
  await mkdir(p('dist'), { recursive: true });
  await writeFile(p('dist/MD2Html.html'), html);
  await copyFile(p('dist/MD2Html.html'), p('MD2Html.html'));
  const size = (await stat(p('dist/MD2Html.html'))).size;
  console.log(`dist/MD2Html.html ${(size / 1024).toFixed(1)} KB`);
  if (size > MAX_BYTES) throw new Error(`Build exceeds ${MAX_BYTES} bytes`);
}

// Add { name: 'pwa', run: buildPwa } here in package 1B.
const targets = [{ name: 'single', run: buildSingle }];

async function runAll() {
  for (const t of targets) await t.run();
}

await runAll();
if (process.argv.includes('--watch')) {
  let timer;
  watch(p('src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => runAll().catch((e) => console.error(e.message)), 150);
  });
  console.log('watching src/ ...');
}
