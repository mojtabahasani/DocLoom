// Sanitized document DOM -> docx block model (see docx.js). Works with any DOM (browser or linkedom); no globals.
// Images are emitted as {k:'img', src|svg} placeholders; the browser layer turns them into PNG/JPEG bytes.
import { safeURL } from '../content/url.js';

const BLOCK_TAGS = new Set('P DIV UL OL TABLE PRE BLOCKQUOTE H1 H2 H3 H4 H5 H6 HR SECTION ARTICLE HEADER FOOTER FIGURE ASIDE NAV MAIN SVG'.split(' '));
const has = (n, cls) => n.classList?.contains(cls);
const text = (n) => (n.textContent || '').replace(/\s+/g, ' ').trim();

function inline(node, base, out, blocks, flush) {
  for (const c of Array.from(node.childNodes)) {
    if (c.nodeType === 3) {
      const t = c.nodeValue.replace(/[\r\n\t ]+/g, ' ');
      if (t) out.push({ ...base, t });
      continue;
    }
    if (c.nodeType !== 1) continue;
    const tag = c.tagName.toUpperCase();
    if (tag === 'BR') out.push({ br: true });
    else if (tag === 'IMG') {
      flush();
      blocks.push({ k: 'img', src: c.getAttribute('src') || '', alt: c.getAttribute('alt') || '' });
    } else if (tag === 'SVG') {
      flush();
      blocks.push({ k: 'img', svg: c.outerHTML, ...svgBox(c) });
    } else if (tag === 'STRONG' || tag === 'B') inline(c, { ...base, b: true }, out, blocks, flush);
    else if (tag === 'EM' || tag === 'I') inline(c, { ...base, i: true }, out, blocks, flush);
    else if (tag === 'S' || tag === 'DEL') inline(c, { ...base, s: true }, out, blocks, flush);
    else if (tag === 'CODE') inline(c, { ...base, code: true }, out, blocks, flush);
    else if (tag === 'A') {
      const href = c.getAttribute('href') || '';
      const ok = /^(https?:|mailto:|tel:)/i.test(href) && safeURL(href);
      inline(c, ok ? { ...base, href } : base, out, blocks, flush);
    } else if (tag === 'UL' || tag === 'OL') {
      flush();
      blocks.push(listBlock(c));
    } else inline(c, base, out, blocks, flush);
  }
}

const trimRuns = (runs) => {
  const r = runs.filter((x) => x.br || x.t !== '');
  while (r.length && !r[0].br && !r[0].t.trim()) r.shift();
  while (r.length && !r[r.length - 1].br && !r[r.length - 1].t.trim()) r.pop();
  if (r[0] && !r[0].br) r[0] = { ...r[0], t: r[0].t.replace(/^ +/, '') };
  const l = r.length - 1;
  if (r[l] && !r[l].br) r[l] = { ...r[l], t: r[l].t.replace(/ +$/, '') };
  return r;
};

function svgBox(svg) {
  const w = parseFloat(svg.getAttribute('width'));
  const h = parseFloat(svg.getAttribute('height'));
  if (w > 0 && h > 0 && !/%/.test(svg.getAttribute('width'))) return { w, h };
  const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
  return vb.length === 4 && vb[2] > 0 ? { w: vb[2], h: vb[3] } : {};
}

function listBlock(list, level = 0, acc = null) {
  const block = acc || { k: 'list', ordered: list.tagName.toUpperCase() === 'OL', items: [] };
  for (const li of Array.from(list.children)) {
    if (li.tagName.toUpperCase() !== 'LI') continue;
    const runs = [];
    const extra = [];
    const task = has(li, 'task');
    if (task) runs.push({ t: has(li, 'task-done') ? '☑ ' : '☐ ' });
    const nested = [];
    const clone = { childNodes: Array.from(li.childNodes).filter((n) => !(n.nodeType === 1 && /^(UL|OL)$/i.test(n.tagName) && nested.push(n))) };
    inline(clone, {}, runs, extra, () => {});
    block.items.push({ runs: trimRuns(runs), level });
    for (const n of nested) listBlock(n, Math.min(level + 1, 8), block);
  }
  return block;
}

function tableBlock(table) {
  const rows = Array.from(table.querySelectorAll('tr'));
  const cells = (tr) => Array.from(tr.children).filter((c) => /^(TH|TD)$/i.test(c.tagName)).map((c) => {
    const runs = [];
    inline(c, {}, runs, [], () => {});
    return trimRuns(runs);
  });
  const headRow = rows.find((r) => r.closest('thead')) || (rows[0] && Array.from(rows[0].children).every((c) => /^TH$/i.test(c.tagName)) ? rows[0] : null);
  return { k: 'table', header: headRow ? cells(headRow) : [], rows: rows.filter((r) => r !== headRow).map(cells) };
}

function letterBlocks(head) {
  const out = [];
  const lines = (sel) => Array.from(head.querySelectorAll(sel)).map((p) => ({ label: text(p.querySelector('b') || { textContent: '' }), value: text(p.querySelector('span') || { textContent: '' }) }));
  const meta = lines('.letter-meta .letter-line');
  const qr = head.querySelector('.qr-inline svg');
  out.push({ k: 'letterMeta', lines: meta, ...(qr ? { qrSvg: qr.outerHTML, qrBox: svgBox(qr) } : {}) });
  for (const p of Array.from(head.querySelectorAll('.letter-to > p'))) {
    if (has(p, 'letter-greeting')) out.push({ k: 'p', runs: [{ t: text(p) }], align: 'center' });
    else {
      const label = text(p.querySelector('b') || { textContent: '' });
      const value = text(p.querySelector('span') || { textContent: '' });
      out.push({ k: 'p', runs: [{ t: label + ' ', b: true }, { t: value, b: has(p, 'letter-subject') }] });
    }
  }
  return out;
}

function convert(node, out, ctx = {}) {
  if (node.nodeType !== 1) return;
  const tag = node.tagName.toUpperCase();
  const fur = node.getAttribute?.('data-md2-furniture');
  if (fur === 'header' || fur === 'footer') return; // become the Word header / footer
  if (has(node, 'letter-head')) return void out.push(...letterBlocks(node));
  if (has(node, 'letter-sign')) {
    const imgs = Array.from(node.querySelectorAll('.sign-area img')).map((i) => ({ src: i.getAttribute('src') || '', alt: i.getAttribute('alt') || '' }));
    out.push({ k: 'sign', imgSrcs: imgs, name: text(node.querySelector('.signer strong') || { textContent: '' }), role: text(node.querySelector('.signer span') || { textContent: '' }) });
    return;
  }
  if (has(node, 'qr-box')) {
    const svg = node.querySelector('svg');
    if (svg) out.push({ k: 'img', svg: svg.outerHTML, ...svgBox(svg), align: 'left' });
    return;
  }
  if (tag === 'NAV' && has(node, 'toc')) {
    out.push({ k: 'p', runs: [{ t: text(node.querySelector('.toc-title') || { textContent: 'فهرست مطالب' }), b: true, color: ctx.accent }], keepNext: true });
    for (const a of Array.from(node.querySelectorAll('a'))) out.push({ k: 'list', ordered: false, items: [{ runs: [{ t: text(a) }], level: Math.max(0, (a.closest('ul')?.parentElement?.closest('ul') ? 1 : 0)) }] });
    return;
  }
  if (/^H[1-6]$/.test(tag)) {
    const runs = [];
    inline(node, {}, runs, [], () => {});
    const level = Number(tag[1]);
    out.push(level <= 3 ? { k: 'h', level, runs: trimRuns(runs) } : { k: 'p', runs: trimRuns(runs).map((r) => ({ ...r, b: true })), keepNext: true });
    return;
  }
  if (tag === 'HR') return void out.push({ k: 'hr' });
  if (tag === 'UL' || tag === 'OL') return void out.push(listBlock(node));
  if (tag === 'TABLE') return void out.push(tableBlock(node));
  if (tag === 'PRE') {
    const lines = (node.textContent || '').replace(/\n$/, '').split('\n');
    return void out.push({ k: 'code', lines });
  }
  if (tag === 'SVG') return void out.push({ k: 'img', svg: node.outerHTML, ...svgBox(node) });
  if (tag === 'IMG') return void out.push({ k: 'img', src: node.getAttribute('src') || '', alt: node.getAttribute('alt') || '' });
  if (tag === 'BLOCKQUOTE' || has(node, 'callout') || has(node, 'card')) {
    const inner = [];
    const sub = { ...ctx };
    for (const c of Array.from(node.childNodes)) convert(c.nodeType === 3 ? wrapText(c) : c, inner, sub);
    const color = has(node, 'callout-tip') ? '2F8F5B' : has(node, 'callout-important') ? '7B57C7' : has(node, 'callout-warning') ? 'C27A12' : has(node, 'callout-caution') ? 'C0392B' : ctx.accent;
    for (const b of inner) {
      if (b.k === 'p') out.push({ ...b, quote: { color, fill: 'F1F5F4' } });
      else if (b.k === 'h') out.push({ k: 'p', runs: b.runs.map((r) => ({ ...r, b: true })), quote: { color, fill: 'F1F5F4' } });
      else out.push(b);
    }
    return;
  }
  if (tag === 'FIGURE') {
    for (const c of Array.from(node.children)) {
      if (c.tagName.toUpperCase() === 'FIGCAPTION') {
        const runs = [];
        inline(c, {}, runs, [], () => {});
        out.push({ k: 'p', runs: trimRuns(runs), align: 'center', base: { sz: 20, color: '64736D' } });
      } else convert(c, out, ctx);
    }
    return;
  }
  // Container or paragraph-like element: mixed inline/block children are split into paragraphs.
  const hasBlock = Array.from(node.children).some((c) => BLOCK_TAGS.has(c.tagName.toUpperCase()));
  if (tag === 'P' || (!hasBlock && tag !== 'DIV' && tag !== 'SECTION' && tag !== 'ARTICLE' && tag !== 'MAIN' && tag !== 'HEADER' && tag !== 'FOOTER' && tag !== 'ASIDE')) return void paragraph(node, out, ctx);
  let runs = [];
  const flush = () => {
    const r = trimRuns(runs);
    if (r.length) out.push(paragraphBlock(r, node, ctx));
    runs = [];
  };
  for (const c of Array.from(node.childNodes)) {
    if (c.nodeType === 3 || (c.nodeType === 1 && !BLOCK_TAGS.has(c.tagName.toUpperCase()) && !has(c, 'letter-head') && !has(c, 'qr-box'))) {
      if (c.nodeType === 3) {
        const t = c.nodeValue.replace(/\s+/g, ' ');
        if (t.trim()) runs.push({ t });
      } else inline({ childNodes: [c] }, {}, runs, out, flush);
    } else {
      flush();
      convert(c, out, ctx);
    }
  }
  flush();
}

const wrapText = (t) => ({ nodeType: 1, tagName: 'P', childNodes: [t], children: [], getAttribute: () => null, classList: { contains: () => false }, textContent: t.nodeValue });

function paragraphBlock(runs, node, ctx) {
  const align = node.getAttribute?.('style')?.match(/text-align:\s*(center)/)?.[1];
  const sub = has(node, 'subtitle');
  return { k: 'p', runs: sub ? runs.map((r) => ({ ...r, color: '718087' })) : runs, ...(align ? { align } : {}) };
}

function paragraph(node, out, ctx) {
  const runs = [];
  const extra = [];
  let before = true;
  inline(node, {}, runs, extra, () => {});
  const r = trimRuns(runs);
  if (r.length) out.push(paragraphBlock(r, node, ctx));
  out.push(...extra);
  void before;
}

/** root: the (already sanitized) document element. accent: hex for headings. Returns the block list. */
export function domToBlocks(root, { accent = '1C5263' } = {}) {
  const out = [];
  for (const c of Array.from(root.childNodes)) {
    if (c.nodeType === 3) {
      if (c.nodeValue.trim()) out.push({ k: 'p', runs: [{ t: c.nodeValue.trim() }] });
    } else convert(c, out, { accent });
  }
  return out;
}
