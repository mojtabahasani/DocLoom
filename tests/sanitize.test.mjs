import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { sanitizeHTML, cleanStyle } from '../src/js/content/sanitize.js';
import { safeURL, isHttps } from '../src/js/content/url.js';

const { document } = parseHTML('<!doctype html><html><body></body></html>');
// linkedom's DOMParser does not wrap fragments in <body>; inject a thin adapter (this is what env injection is for).
class DOMParser {
  parseFromString(html) {
    return parseHTML(/<html|<!doctype/i.test(html) ? html : `<!doctype html><html><head></head><body>${html}</body></html>`).document;
  }
}
const env = { DOMParser, document };
const clean = (h) => sanitizeHTML(h, env);

test('script, style, iframe and friends are removed with content', () => {
  assert.equal(clean('<p>a</p><script>alert(1)</script>'), '<p>a</p>');
  assert.equal(clean('<style>p{}</style><p>b</p>'), '<p>b</p>');
  assert.equal(clean('<iframe src="https://x.com"></iframe>ok'), 'ok');
  assert.equal(clean('<form><input name=a><button>x</button></form>t'), 't');
  assert.equal(clean('<svg onload="x()"><circle/></svg>t'), 't');
  assert.equal(clean('<object data="x"></object><embed src="x">t'), 't');
});

test('event handler and unknown attributes are dropped', () => {
  assert.equal(clean('<p onclick="x()" id="a" data-x="1">t</p>'), '<p>t</p>');
  assert.ok(!clean('<img src="https://a.com/i.png" onerror="alert(1)">').includes('onerror'));
  assert.ok(!clean('<a href="https://a.com" onmouseover="x()">t</a>').includes('onmouseover'));
});

test('javascript:, vbscript: and data:text hrefs are stripped', () => {
  assert.ok(!clean('<a href="javascript:alert(1)">t</a>').includes('href'));
  assert.ok(!clean('<a href=" JaVaScRiPt:alert(1)">t</a>').includes('href'));
  assert.ok(!clean('<a href="vbscript:x">t</a>').includes('href'));
  assert.ok(!clean('<a href="data:text/html,<script>1</script>">t</a>').includes('href'));
  assert.ok(!clean('<a href="/relative">t</a>').includes('href'));
  assert.equal(clean('<a href="javascript:alert(1)">t</a>'), '<a>t</a>');
});

test('allowed URL schemes survive on links', () => {
  assert.match(clean('<a href="https://a.com/x">t</a>'), /href="https:\/\/a\.com\/x"/);
  assert.match(clean('<a href="http://a.com/x">t</a>'), /href="http:\/\/a\.com\/x"/);
  assert.match(clean('<a href="mailto:a@b.co">t</a>'), /href="mailto:a@b\.co"/);
  assert.match(clean('<a href="tel:+98911">t</a>'), /href="tel:\+98911"/);
  assert.match(clean('<a href="https://a.com" target="_blank">t</a>'), /rel="noopener noreferrer"/);
  assert.match(clean('<a href="https://a.com" target="_blank">t</a>'), /target="_blank"/);
});

test('images: data:image and https allowed, others dropped', () => {
  assert.match(clean('<img src="data:image/png;base64,iVBORw0KGgo=">'), /src="data:image\/png;base64,iVBORw0KGgo="/);
  assert.match(clean('<img src="https://a.com/i.jpg" alt="x">'), /src="https:\/\/a\.com\/i\.jpg"/);
  assert.equal(clean('<img src="javascript:alert(1)">'), '');
  assert.equal(clean('<img src="data:image/svg+xml;base64,PHN2Zy8+">'), '');
  assert.equal(clean('<img src="data:text/html;base64,AAAA">'), '');
  assert.equal(clean('<img src="file:///etc/passwd">'), '');
  assert.equal(clean('<img src="ftp://a.com/i.png">'), '');
});

test('data:image is not allowed for links', () => {
  assert.ok(!clean('<a href="data:image/png;base64,AAAA">t</a>').includes('href'));
});

test('styles: allow-list, no url() / expression', () => {
  assert.equal(cleanStyle('color:red;background-image:url(x);position:fixed'), 'color:red');
  assert.equal(cleanStyle('color:expression(alert(1))'), '');
  assert.equal(cleanStyle('text-align:justify;font-size:14px'), 'text-align:justify;font-size:14px');
  assert.equal(cleanStyle('font-size:calc(1px)'), '');
  assert.match(clean('<p style="color:#123;behavior:url(x)">t</p>'), /style="color:#123"/);
});

test('font tag becomes span with color/size', () => {
  assert.equal(clean('<font color="#ff0000" size="5">t</font>'), '<span style="color:#ff0000;font-size:24px">t</span>');
  assert.equal(clean('<font color="red;x:url(1)">t</font>'), '<span>t</span>');
});

test('unknown tags unwrap, classes are filtered', () => {
  assert.equal(clean('<custom-el><b>x</b></custom-el>'), '<b>x</b>');
  assert.equal(clean('<div class="card evil"><p>t</p></div>'), '<div class="card"><p>t</p></div>');
});

test('furniture marker kept only for known values', () => {
  assert.match(clean('<div data-md2-furniture="header">t</div>'), /data-md2-furniture="header"/);
  assert.ok(!clean('<div data-md2-furniture="x">t</div>').includes('data-md2'));
});

test('table cell spans are numeric only', () => {
  assert.match(clean('<table><tr><td colspan="2">a</td></tr></table>'), /colspan="2"/);
  assert.ok(!clean('<table><tr><td colspan="x">a</td></tr></table>').includes('colspan'));
});

test('safeURL / isHttps', () => {
  assert.equal(safeURL('https://a.com'), 'https://a.com/');
  assert.equal(safeURL('javascript:1'), null);
  assert.equal(safeURL('//a.com'), null);
  assert.equal(safeURL('https://'), null);
  assert.equal(safeURL('data:image/gif;base64,R0lG', { image: true }), 'data:image/gif;base64,R0lG');
  assert.equal(safeURL('data:image/gif;base64,R0lG'), null);
  assert.equal(safeURL('data:image/png;base64,AA"onerror=x', { image: true }), null);
  assert.equal(safeURL('https://a.com/\u0000x'), null);
  assert.equal(isHttps('https://a.com'), true);
  assert.equal(isHttps('http://a.com'), false);
});
