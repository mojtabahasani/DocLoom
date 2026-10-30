import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { qrSVG, qrContent, normalizeQr, MAX_QR_CHARS } from '../src/js/brand/qr.js';
import { sanitizeHTML } from '../src/js/content/sanitize.js';

const { document } = parseHTML('<!doctype html><html><body></body></html>');
class DOMParser {
  parseFromString(html) {
    return parseHTML(/<html|<!doctype/i.test(html) ? html : `<!doctype html><html><head></head><body>${html}</body></html>`).document;
  }
}
const env = { DOMParser, document };

const ALLOWED_TAGS = new Set(['svg', 'rect', 'path']);

test('qrSVG: well-formed, whitelisted elements only, square viewBox', () => {
  const svg = qrSVG('https://www.computer123.ir');
  assert.match(svg, /^<svg class="qr-svg" viewBox="0 0 (\d+) \1" width="84" height="84"/);
  const tags = [...svg.matchAll(/<([a-z]+)[\s>]/g)].map((m) => m[1]);
  assert.ok(tags.length >= 3);
  assert.ok(tags.every((t) => ALLOWED_TAGS.has(t)), tags.join());
  assert.equal((svg.match(/<svg/g) || []).length, 1);
  assert.ok(svg.endsWith('</svg>'));
  assert.doesNotMatch(svg, /href|script|on\w+=|style=|url\(/i);
  const d = svg.match(/ d="([^"]+)"/)[1];
  assert.match(d, /^(M\d+ \d+h\d+v1h-\d+z)+$/);
});

test('qrSVG: deterministic, size option, light background and dark modules', () => {
  assert.equal(qrSVG('abc'), qrSVG('abc'));
  assert.notEqual(qrSVG('abc'), qrSVG('abd'));
  assert.match(qrSVG('abc', { size: 120 }), /width="120" height="120"/);
  assert.match(qrSVG('abc'), /fill="#ffffff"/);
  assert.match(qrSVG('abc'), /fill="#000000"/);
});

test('qrSVG: finder patterns sit in three corners (module grid sanity check)', () => {
  const svg = qrSVG('x', { margin: 0 });
  const n = Number(svg.match(/viewBox="0 0 (\d+)/)[1]);
  const d = svg.match(/ d="([^"]+)"/)[1];
  const dark = new Set();
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)/g)) for (let i = 0; i < +m[3]; i++) dark.add(`${+m[1] + i},${m[2]}`);
  for (const [cx, cy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let i = 0; i < 7; i++) {
      assert.ok(dark.has(`${cx + i},${cy}`) && dark.has(`${cx + i},${cy + 6}`) && dark.has(`${cx},${cy + i}`) && dark.has(`${cx + 6},${cy + i}`), `finder at ${cx},${cy}`);
    }
    assert.ok(!dark.has(`${cx + 1},${cy + 1}`) && dark.has(`${cx + 3},${cy + 3}`));
  }
});

test('qrSVG: empty or oversized text gives nothing; Persian text encodes (UTF-8)', () => {
  assert.equal(qrSVG(''), '');
  assert.equal(qrSVG('x'.repeat(MAX_QR_CHARS + 1)), '');
  assert.match(qrSVG('مجتمع کامپیوتر یک دو سه'), /^<svg/);
});

test('qrContent by kind', () => {
  assert.equal(qrContent({ kind: 'url', value: 'computer123.ir' }), 'https://computer123.ir');
  assert.equal(qrContent({ kind: 'url', value: 'http://a.ir/x' }), 'http://a.ir/x');
  assert.equal(qrContent({ kind: 'tel', value: '۰۳۴ ۳۲۱-۰۰۹۸' }), 'tel:0343210098');
  assert.equal(qrContent({ kind: 'text', value: ' سلام ' }), 'سلام');
  assert.equal(qrContent({ kind: 'url', value: '' }), '');
});

test('normalizeQr clamps size and kinds', () => {
  assert.deepEqual(normalizeQr({ enabled: 1, kind: 'x', position: 'letter', size: 10 }), { enabled: false, kind: 'url', value: '', position: 'letter', size: 56 });
});

test('sanitize keeps the QR (rebuilt, class-scoped) inside its box', () => {
  const svg = qrSVG('https://www.computer123.ir');
  const out = sanitizeHTML(`<div class="qr-box" data-md2-furniture="qr">${svg}</div>`, env);
  assert.match(out, /class="qr-box"/);
  assert.match(out, /data-md2-furniture="qr"/);
  assert.match(out, /<svg class="qr-svg"/);
  assert.equal(out.match(/ d="([^"]+)"/)[1], svg.match(/ d="([^"]+)"/)[1]);
  assert.match(out, /shape-rendering="crispEdges"/);
});

test('sanitize strips anything foreign from a QR-looking svg', () => {
  const evil =
    '<svg class="qr-svg" viewBox="0 0 10 10" onload="x()" style="background:url(http://e.com/x)"><a href="https://evil.example"><rect width="5" height="5"/></a>' +
    '<image href="https://evil.example/x.png"/><foreignObject><p>x</p></foreignObject><script>alert(1)</script><use href="#a"/>' +
    '<path d="M0 0h1v1h-1z" fill="javascript:alert(1)" onclick="x()"/></svg>';
  const out = sanitizeHTML(evil, env);
  assert.doesNotMatch(out, /href|onload|onclick|script|foreignObject|image|<use|evil|url\(|javascript/i);
  assert.match(out, /<path d="M0 0h1v1h-1z"/);
});

test('sanitize: an svg without our class is still dropped; other classes never become qr-svg', () => {
  assert.equal(sanitizeHTML('<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>t', env), 't');
  assert.equal(sanitizeHTML('<svg class="evil" viewBox="0 0 1 1"><rect/></svg>t', env), 't');
});

test('sanitize: letter and signature furniture, drag margins and classes survive; unknown furniture values do not', () => {
  const html = '<section class="letter-sign" data-md2-furniture="signature"><div class="sign-box"><div class="sign-area"><img class="sig-img" src="data:image/png;base64,AAAA" style="margin-left:12px;margin-top:5px;position:fixed;top:0"></div></div></section><div data-md2-furniture="evil">x</div>';
  const out = sanitizeHTML(html, env);
  assert.match(out, /data-md2-furniture="signature"/);
  assert.match(out, /class="sig-img"/);
  assert.match(out, /margin-left:12px;margin-top:5px"/);
  assert.doesNotMatch(out, /position|top:0|evil/);
});
