// Presentation mode (pure): slide splitting + the standalone slide-show document.
// Keys are NOT mirrored for RTL (hard rule): ArrowRight / Space = next, ArrowLeft = previous. The on-screen button group is
// direction:ltr, previous on the left and next on the right; the progress bar fills left -> right.
import { escapeHTML } from '../content/markdown.js';
import { toFaDigits } from '../content/persian.js';

const TAIL = new Set(['footer', 'signature', 'qr']);

/** root: sanitized document element. Returns [{ html, kind: 'title'|'content' }]. Splits at h1/h2 and <hr> (the rule is dropped). */
export function splitSlides(root) {
  const slides = [];
  let cur = [];
  let curKind = 'content';
  const push = () => {
    if (cur.length) slides.push({ html: cur.join(''), kind: curKind });
    cur = [];
    curKind = 'content';
  };
  const tail = [];
  for (const n of Array.from(root.childNodes)) {
    if (n.nodeType === 3) {
      if (n.nodeValue.trim()) cur.push(`<p>${escapeHTML(n.nodeValue.trim())}</p>`);
      continue;
    }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName.toUpperCase();
    const fur = n.getAttribute('data-md2-furniture');
    if (fur && TAIL.has(fur)) {
      tail.push(n.outerHTML);
      continue;
    }
    if (tag === 'HR') {
      push();
      continue;
    }
    if (tag === 'H1' || tag === 'H2') {
      push();
      curKind = tag === 'H1' ? 'title' : 'content';
    } else if (fur === 'title' && !cur.length) curKind = 'title';
    cur.push(n.outerHTML);
  }
  push();
  if (tail.length) {
    if (slides.length) slides[slides.length - 1].html += tail.join('');
    else slides.push({ html: tail.join(''), kind: 'content' });
  }
  return slides;
}

/* eslint-disable */
function runtime() {
  var d = document, slides = Array.prototype.slice.call(d.querySelectorAll('.slide')), n = slides.length, i = 0;
  var fill = d.querySelector('.pbar i'), count = d.querySelector('.count'), prev = d.getElementById('prev'), next = d.getElementById('next');
  var FA = '۰۱۲۳۴۵۶۷۸۹', fa = function (v) { return String(v).replace(/\d/g, function (c) { return FA[c]; }); };
  var embedded = window.parent !== window;
  function fit(s) {
    var inner = s.firstElementChild, avail = s.clientHeight - 120, w = s.clientWidth;
    var size = Math.max(18, Math.min(38, w / 34, s.clientHeight / 17));
    inner.style.fontSize = size + 'px';
    var guard = 0;
    while (inner.scrollHeight > avail && size > 11 && guard++ < 40) { size -= 1; inner.style.fontSize = size + 'px'; }
  }
  function show(k) {
    i = Math.max(0, Math.min(n - 1, k));
    slides.forEach(function (s, j) { s.classList.toggle('on', j === i); s.setAttribute('aria-hidden', String(j !== i)); });
    fit(slides[i]);
    d.body.setAttribute('data-kind', slides[i].getAttribute('data-kind'));
    fill.style.width = (n > 1 ? (i / (n - 1)) * 100 : 100) + '%';
    count.textContent = fa(i + 1) + ' / ' + fa(n);
    prev.disabled = i === 0; next.disabled = i === n - 1;
    if (!embedded) try { history.replaceState(null, '', '#' + (i + 1)); } catch (e) {}
  }
  function exit() {
    if (embedded) window.parent.postMessage({ md2: 'present-exit' }, '*');
    else if (d.fullscreenElement) d.exitFullscreen();
  }
  function full() {
    if (d.fullscreenElement) d.exitFullscreen();
    else if (d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(function () {});
  }
  d.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var k = e.key;
    if (k === 'ArrowRight' || k === ' ' || k === 'PageDown') { e.preventDefault(); show(i + 1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); show(i - 1); }
    else if (k === 'Home') { e.preventDefault(); show(0); }
    else if (k === 'End') { e.preventDefault(); show(n - 1); }
    else if (k === 'Escape') { e.preventDefault(); exit(); }
    else if (k === 'f' || k === 'F') full();
  });
  prev.addEventListener('click', function () { show(i - 1); });
  next.addEventListener('click', function () { show(i + 1); });
  d.getElementById('full').addEventListener('click', full);
  var ex = d.getElementById('exit');
  if (embedded) ex.hidden = false;
  ex.addEventListener('click', exit);
  window.addEventListener('resize', function () { fit(slides[i]); });
  var start = parseInt((location.hash || '').slice(1), 10);
  show(start > 0 ? start - 1 : 0);
  window.focus();
}
/* eslint-enable */
export const PRESENT_JS = `(${runtime.toString()})()`;

export const PRESENT_CSS =
  '*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:#fffefa;color:#24383b;font-family:' +
  "Vazirmatn,'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl}" +
  '.slide{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:44px 7vw 90px;background:#fffefa;border-top:8px solid var(--accent)}' +
  '.slide.on{display:flex}.slide[data-kind=title]{background:var(--accent);color:#fff;border-top:0;text-align:center}' +
  '.slide-in{width:100%;max-width:1180px;max-height:100%;line-height:1.95;overflow:hidden;overflow-wrap:anywhere}' +
  '.slide h1,.slide h2,.slide h3{margin:0 0 .5em;color:var(--accent);line-height:1.5}.slide h1{font-size:1.9em}.slide h2{font-size:1.55em}.slide h3{font-size:1.2em}' +
  '.slide[data-kind=title] h1,.slide[data-kind=title] h2,.slide[data-kind=title] .subtitle{color:#fff}.slide[data-kind=title] h1{font-size:2.3em}' +
  '.slide[data-kind=title] .cover,.slide[data-kind=title] blockquote{background:transparent;border:0}.slide[data-kind=title] a{color:#fff}' +
  '.slide p{margin:.5em 0}.slide ul,.slide ol{padding-inline-start:1.4em;margin:.5em 0}.slide li{margin:.25em 0}' +
  '.slide img,.slide svg{max-width:100%;max-height:52vh;height:auto}' +
  '.slide table{border-collapse:collapse;width:100%;font-size:.9em}.slide td,.slide th{border:1px solid #d5dbd7;padding:.35em .6em;text-align:right}.slide th{background:var(--accent);color:#fff}' +
  '.slide pre{direction:ltr;text-align:left;white-space:pre-wrap;background:#f1f3f2;color:#24383b;padding:.6em .9em;border-radius:10px;font-size:.82em;line-height:1.6}' +
  '.slide blockquote,.slide .card,.slide .callout{background:var(--tint);color:#24383b;border-right:5px solid var(--accent);padding:.4em 1em;margin:.7em 0}' +
  '.slide .masthead{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:1em}.slide .masthead img{max-height:70px}' +
  '.pbar{position:fixed;top:0;left:0;right:0;height:6px;direction:ltr;z-index:10;background:rgba(127,127,127,.25)}' +
  '.pbar i{display:block;height:100%;width:0;background:var(--accent);transition:width .25s}body[data-kind=title] .pbar i{background:#fff}' +
  '.ctl{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:10;display:flex;align-items:center;gap:10px;direction:ltr;font-size:15px;' +
  'background:rgba(255,255,255,.92);color:#24383b;border:1px solid rgba(0,0,0,.12);border-radius:30px;padding:6px 10px;box-shadow:0 4px 18px rgba(0,0,0,.18)}' +
  '.ctl button{font:inherit;display:inline-grid;place-items:center;min-width:44px;height:40px;border:0;border-radius:22px;background:var(--accent);color:#fff;cursor:pointer;font-size:20px}' +
  '.ctl button:disabled{opacity:.35;cursor:default}.ctl .count{min-width:64px;text-align:center;direction:ltr;font-size:14px}' +
  '.ctl button.sm{background:transparent;color:inherit;font-size:13px;padding:0 12px;border:1px solid rgba(0,0,0,.18)}' +
  '.slide :where(h1,h2,h3){break-after:avoid}' +
  '@media print{html,body{overflow:visible;height:auto}.slide{position:static;display:flex;min-height:100vh;break-after:page}.ctl,.pbar{display:none}}';

/** parts: { title, slides: [{html,kind}], accent, tint, fontCss }. */
export function renderPresentation({ title, slides, accent, tint, fontCss = '' }) {
  const list = slides.length ? slides : [{ html: '<p>سند خالی است.</p>', kind: 'content' }];
  return (
    '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${escapeHTML(title || 'ارائه')}</title>` +
    `<style>${fontCss}:root{--accent:${accent};--tint:${tint}}${PRESENT_CSS}</style></head><body data-kind="${list[0].kind}">` +
    '<div class="pbar" aria-hidden="true"><i></i></div>' +
    list.map((s, k) => `<section class="slide" data-kind="${s.kind}" aria-label="اسلاید ${toFaDigits(k + 1)}"><div class="slide-in">${s.html}</div></section>`).join('') +
    '<div class="ctl" dir="ltr" role="group" aria-label="پیمایش اسلاید">' +
    '<button id="prev" type="button" aria-label="اسلاید قبلی" title="قبلی (←)"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
    '<span class="count" aria-live="polite"></span>' +
    '<button id="next" type="button" aria-label="اسلاید بعدی" title="بعدی (→)"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
    '<button id="full" class="sm" type="button" title="تمام‌صفحه (F)">تمام‌صفحه</button>' +
    '<button id="exit" class="sm" type="button" hidden title="خروج (Esc)">خروج</button></div>' +
    `<script>${PRESENT_JS}</script></body></html>`
  );
}
