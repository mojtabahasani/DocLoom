// Interactive HTML export (pure string building). The inline runtime is a real function serialised with toString(),
// so it stays lintable. No editor code, no network: floating TOC, dark mode, font size, progress, tasks, code copy, back-to-top.
import { escapeHTML } from '../content/markdown.js';
import { ruleCSS } from './theme.js';

/* eslint-disable */
function runtime() {
  var d = document, root = d.documentElement, main = d.querySelector('main'), store = null;
  try { store = window.localStorage; } catch (e) {}
  var get = function (k) { try { return store && store.getItem('md2i:' + k); } catch (e) { return null; } };
  var put = function (k, v) { try { store && store.setItem('md2i:' + k, v); } catch (e) {} };
  var mk = function (tag, cls, text, attrs) {
    var n = d.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    return n;
  };
  var bar = mk('div', 'xi-bar');
  var group = mk('div', 'xi-group', null, { role: 'group', 'aria-label': 'اندازهٔ متن' });
  var minus = mk('button', '', 'A−', { type: 'button', 'aria-label': 'کوچک‌تر کردن متن', title: 'کوچک‌تر' });
  var plus = mk('button', '', 'A+', { type: 'button', 'aria-label': 'بزرگ‌تر کردن متن', title: 'بزرگ‌تر' });
  group.append(minus, plus);
  var dark = mk('button', 'xi-btn', 'حالت تیره', { type: 'button', 'aria-pressed': 'false' });
  bar.append(group, dark);
  var prog = mk('div', 'xi-progress', null, { 'aria-hidden': 'true' });
  var fill = mk('i');
  prog.append(fill);
  var top = mk('button', 'xi-top', '↑', { type: 'button', 'aria-label': 'بازگشت به بالای صفحه', title: 'بالای صفحه' });
  top.hidden = true;
  var fab = mk('button', 'xi-fab', 'فهرست', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'xi-toc' });
  var toc = mk('nav', 'xi-toc', null, { id: 'xi-toc', 'aria-label': 'فهرست مطالب' });
  var heads = Array.prototype.slice.call(main.querySelectorAll('h1,h2,h3')).filter(function (h) { return !h.closest('nav.toc,[data-md2-furniture]'); });
  var links = [];
  if (heads.length) {
    toc.append(mk('strong', 'xi-toc-title', 'فهرست مطالب'));
    heads.forEach(function (h, i) {
      if (!h.id) h.id = 'xi-h' + i;
      var a = mk('a', 'l' + h.tagName.charAt(1), (h.textContent || '').trim(), { href: '#' + h.id });
      a.addEventListener('click', function () { toc.classList.remove('open'); fab.setAttribute('aria-expanded', 'false'); });
      toc.append(a);
      links.push(a);
    });
  } else { fab.hidden = true; toc.hidden = true; }
  d.body.append(prog, bar, toc, fab, top);

  // dark mode
  var setDark = function (on) { root.setAttribute('data-theme', on ? 'dark' : 'light'); dark.setAttribute('aria-pressed', String(on)); dark.textContent = on ? 'حالت روشن' : 'حالت تیره'; };
  var saved = get('theme');
  setDark(saved ? saved === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches));
  dark.addEventListener('click', function () { var on = root.getAttribute('data-theme') !== 'dark'; setDark(on); put('theme', on ? 'dark' : 'light'); });

  // font size
  var size = parseFloat(main.style.fontSize) || 15;
  var s0 = parseFloat(get('font'));
  if (s0 >= 11 && s0 <= 34) { size = s0; main.style.fontSize = size + 'px'; }
  var step = function (dlt) { size = Math.max(11, Math.min(34, size + dlt)); main.style.fontSize = size + 'px'; put('font', String(size)); };
  minus.addEventListener('click', function () { step(-1); });
  plus.addEventListener('click', function () { step(1); });

  // progress, back to top, active TOC entry
  var onScroll = function () {
    var max = root.scrollHeight - root.clientHeight, y = window.pageYOffset || root.scrollTop;
    fill.style.width = (max > 0 ? Math.min(100, (y / max) * 100) : 0) + '%';
    top.hidden = y < 500;
    var cur = -1;
    for (var i = 0; i < heads.length; i++) if (heads[i].getBoundingClientRect().top < 120) cur = i;
    links.forEach(function (a, i) { a.classList.toggle('on', i === cur); });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  fab.addEventListener('click', function () { var o = toc.classList.toggle('open'); fab.setAttribute('aria-expanded', String(o)); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape') { toc.classList.remove('open'); fab.setAttribute('aria-expanded', 'false'); } });
  onScroll();

  // clickable checklists (state kept per browser)
  var tasks = Array.prototype.slice.call(main.querySelectorAll('li.task'));
  var key = 'tasks:' + d.title;
  var done = {};
  try { done = JSON.parse(get(key) || '{}') || {}; } catch (e) {}
  tasks.forEach(function (li, i) {
    if (done[i] === 1) li.classList.add('task-done'); else if (done[i] === 0) li.classList.remove('task-done');
    li.setAttribute('role', 'checkbox'); li.setAttribute('tabindex', '0');
    var sync = function () { li.setAttribute('aria-checked', String(li.classList.contains('task-done'))); };
    var flip = function () { li.classList.toggle('task-done'); done[i] = li.classList.contains('task-done') ? 1 : 0; put(key, JSON.stringify(done)); sync(); };
    sync();
    li.addEventListener('click', function (e) { if (!e.target.closest('a')) flip(); });
    li.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
  });

  // copy buttons on code blocks
  Array.prototype.forEach.call(main.querySelectorAll('pre'), function (pre) {
    var b = mk('button', 'xi-copy', 'کپی', { type: 'button', 'aria-label': 'کپی کد' });
    var wrap = mk('div', 'xi-code');
    pre.parentNode.insertBefore(wrap, pre);
    wrap.append(pre, b);
    b.addEventListener('click', function () {
      var text = pre.innerText || pre.textContent, ok = function () { b.textContent = 'کپی شد'; setTimeout(function () { b.textContent = 'کپی'; }, 1400); };
      var fallback = function () {
        var ta = mk('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; d.body.append(ta); ta.select();
        try { d.execCommand('copy'); ok(); } catch (e) { b.textContent = 'ناموفق'; }
        ta.remove();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
    });
  });
}
/* eslint-enable */

export const INTERACTIVE_JS = `(${runtime.toString()})()`;

export const INTERACTIVE_CSS =
  'html{scroll-behavior:smooth;scroll-padding-top:20px}' +
  '.xi-progress{position:fixed;top:0;left:0;right:0;height:4px;direction:ltr;z-index:60;background:transparent}' +
  '.xi-progress i{display:block;height:100%;width:0;background:var(--accent);border-radius:0 3px 3px 0}' +
  '.xi-bar{position:fixed;top:12px;left:12px;z-index:55;display:flex;gap:8px;align-items:center;font-family:inherit}' +
  '.xi-group{display:inline-flex;direction:ltr;border:1px solid var(--xi-line);border-radius:10px;background:var(--xi-chrome);overflow:hidden}' +
  '.xi-group button,.xi-btn,.xi-fab,.xi-top,.xi-copy{font:inherit;font-size:13px;color:var(--xi-fg);cursor:pointer}' +
  '.xi-group button{border:0;background:transparent;padding:6px 12px;min-width:42px}.xi-group button+button{border-left:1px solid var(--xi-line)}' +
  '.xi-group button:hover,.xi-btn:hover,.xi-top:hover{background:var(--tint)}' +
  '.xi-btn{border:1px solid var(--xi-line);border-radius:10px;background:var(--xi-chrome);padding:6px 12px}' +
  '.xi-fab{position:fixed;bottom:18px;right:16px;z-index:55;border:0;border-radius:24px;background:var(--accent);color:#fff;padding:10px 18px;box-shadow:0 4px 14px rgba(0,0,0,.25)}' +
  '.xi-top{position:fixed;bottom:18px;left:16px;z-index:55;width:42px;height:42px;border-radius:50%;border:1px solid var(--xi-line);background:var(--xi-chrome);font-size:18px}' +
  '.xi-top[hidden]{display:none}' +
  '.xi-toc{position:fixed;top:0;bottom:0;right:0;width:min(300px,86vw);z-index:58;overflow:auto;padding:58px 14px 24px;background:var(--xi-chrome);border-left:1px solid var(--xi-line);transform:translateX(100%);transition:transform .22s;box-shadow:-6px 0 24px rgba(0,0,0,.18);line-height:1.7;font-size:14px}' +
  '.xi-toc.open{transform:none}.xi-toc[hidden]{display:none}' +
  '.xi-toc-title{display:block;margin-bottom:8px;color:var(--accent)}' +
  '.xi-toc a{display:block;padding:4px 8px;border-radius:6px;color:var(--xi-fg);text-decoration:none}.xi-toc a.l2{padding-right:20px}.xi-toc a.l3{padding-right:32px;font-size:.93em}' +
  '.xi-toc a:hover{background:var(--tint)}.xi-toc a.on{background:var(--tint);color:var(--accent);font-weight:700}' +
  '.xi-code{position:relative}.xi-copy{position:absolute;top:8px;left:8px;border:1px solid var(--xi-line);border-radius:7px;background:var(--xi-chrome);padding:2px 10px;font-size:12px;opacity:.85}' +
  'li.task{cursor:pointer}li.task:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}' +
  '@media (min-width:1260px){.xi-toc{top:70px;bottom:auto;right:max(14px,calc((100vw - 780px)/2 - 330px));width:290px;max-height:76vh;padding:14px;transform:none;border:1px solid var(--xi-line);border-radius:12px;box-shadow:none}.xi-fab{display:none}}' +
  ':root{--xi-fg:#24383b;--xi-chrome:#fffefa;--xi-line:#d5dbd7}' +
  'html[data-theme=dark]{color-scheme:dark;--accent:#7fd8b8;--tint:#1f2b28;--xi-fg:#d9dedc;--xi-chrome:#1a1f21;--xi-line:#33393c}' +
  'html[data-theme=dark] body{background:#101314;color:#d9dedc}html[data-theme=dark] main{background:#171b1d}' +
  'html[data-theme=dark] th{color:#101314}html[data-theme=dark] td,html[data-theme=dark] th{border-color:#363d40}' +
  'html[data-theme=dark] pre,html[data-theme=dark] code,html[data-theme=dark] pre.code{background:#1f2527;border-color:#363d40}' +
  'html[data-theme=dark] .callout,html[data-theme=dark] .card,html[data-theme=dark] blockquote{background:#1c2422}' +
  'html[data-theme=dark] .xi-fab{color:#101314}' +
  'html[data-theme=dark] .tok-k{color:#c4a6ff}html[data-theme=dark] .tok-s{color:#6fd6a3}html[data-theme=dark] .tok-n{color:#ffb36b}html[data-theme=dark] .tok-f{color:#7cc1ff}html[data-theme=dark] .tok-a{color:#ff9a85}' +
  'html[data-theme=dark] li.task::before{background-color:#171b1d}html[data-theme=dark] .masthead,html[data-theme=dark] .page-footer{border-color:#33393c}' +
  'html[data-theme=dark] .md-wm span{opacity:.07}' +
  '@media (max-width:700px){main{padding:26px 18px!important}.xi-bar{top:10px;left:8px}.xi-btn{padding:6px 9px}}' +
  '@media print{.xi-bar,.xi-fab,.xi-top,.xi-toc,.xi-progress,.xi-copy{display:none!important}}';

/**
 * parts: { title, mainHTML, accent, tint, fontCss, css, watermarkHTML }. `css` = shared export styles (base + blocks + letter + watermark).
 */
export function renderInteractive({ title, mainHTML, accent, tint, paper = '#fffefa', rule = '', fontCss = '', css = '', watermarkHTML = '' }) {
  return (
    '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${escapeHTML(title || 'سند فارسی')}</title>` +
    `<style>${fontCss}:root{--accent:${accent};--tint:${tint};--paper:${paper}}${css}${INTERACTIVE_CSS}${ruleCSS(rule) ? `main{${ruleCSS(rule)}}` : ''}</style>` +
    `</head><body>${watermarkHTML}${mainHTML}<script>${INTERACTIVE_JS}</script></body></html>`
  );
}
