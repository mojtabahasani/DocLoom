// MD2Html build: bundles src/ into one self-contained HTML file.
//   dist/MD2Html.html  -> copied to ./MD2Html.html
//   dist/pwa/          -> installable build: index.html (same app + manifest link), sw.js, manifest, icons
import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile, readdir, stat, cp } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const p = (...a) => path.join(root, ...a);
const MAX_BYTES = 900 * 1024;

// Build identity, read once: the version comes from package.json, the stamp is the day only
// so an unchanged source does not churn dist/ on every rebuild.
const pkg = JSON.parse(await readFile(p('package.json'), 'utf8'));
const VERSION = pkg.version;
const BUILT_AT = new Date().toISOString().slice(0, 10);

/**
 * A short fingerprint of the sources. The version alone cannot answer "am I running the build
 * with that fix in it?" — it stays 1.0.0 all day — so «دربارهٔ برنامه» shows this too, and an
 * open tab or a cached service worker gives itself away at a glance.
 */
async function sourceId() {
  const h = createHash('sha256');
  const walk = async (dir) => {
    for (const name of (await readdir(dir)).sort()) {
      const full = path.join(dir, name);
      if ((await stat(full)).isDirectory()) await walk(full);
      else {
        h.update(name);
        h.update(await readFile(full));
      }
    }
  };
  await walk(p('src'));
  for (const f of ['build.mjs', 'package.json']) h.update(await readFile(p(f)));
  return h.digest('hex').slice(0, 8);
}
const BUILD_ID = await sourceId();

// CSS concat order matters (tokens first).
const CSS_ORDER = ['tokens', 'layout', 'components', 'library', 'palette', 'document', 'print'];
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
    define: {
      __APP_VERSION__: JSON.stringify(VERSION),
      __APP_BUILT__: JSON.stringify(BUILT_AT),
      __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
    },
    loader: { '.css': 'text' }, // export/html.js embeds styles/blocks.css into exported pages
    write: false,
  });
  // A literal "</script" inside inline JS would end the script block early.
  // `<script` / `<!--` inside inline JS can also derail the HTML parser (double-escaped state), so escape them as well.
  return out.outputFiles[0].text
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<script/g, '<\\u0073cript')
    .replace(/<!--/g, '<\\!--');
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
  console.log(`dist/MD2Html.html ${(size / 1024).toFixed(1)} KB  (v${VERSION}, ${BUILT_AT}, build ${BUILD_ID})`);
  if (size > MAX_BYTES) throw new Error(`Build exceeds ${MAX_BYTES} bytes`);
}

const MANIFEST_TAGS =
  '<link rel="manifest" href="manifest.webmanifest" crossorigin="use-credentials">\n<link rel="apple-touch-icon" href="icons/icon-192.png">\n<meta name="theme-color" content="#1f6f5f">\n';

async function buildPwa() {
  const single = await readFile(p('dist/MD2Html.html'), 'utf8');
  const html = inject(single, '</head>', MANIFEST_TAGS + '</head>');
  const version = createHash('sha256').update(html).digest('hex').slice(0, 10);
  const out = p('dist/pwa');
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, 'index.html'), html);
  await writeFile(path.join(out, 'sw.js'), (await readFile(p('pwa/sw.js'), 'utf8')).replaceAll('__VERSION__', version));
  await copyFile(p('pwa/manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));
  await cp(p('pwa/icons'), path.join(out, 'icons'), { recursive: true });
  console.log(`dist/pwa/ ready (sw version ${version})`);
}

const targets = [
  { name: 'single', run: buildSingle },
  { name: 'pwa', run: buildPwa },
];

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
