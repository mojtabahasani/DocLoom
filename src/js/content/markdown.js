// Markdown -> HTML string. Pure (no DOM). All text is escaped; links/images go through safeURL.
import { safeURL } from './url.js';

export const escapeHTML = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const INLINE_RE = new RegExp(
  [
    '!\\[([^\\]]*)\\]\\(([^)\\s]+)(?:\\s+"[^"]*")?\\)', // 1 alt, 2 src
    '\\[([^\\]]+)\\]\\(([^)\\s]+)(?:\\s+"[^"]*")?\\)', // 3 text, 4 href
    '`([^`]+)`', // 5 code
    '(\\*\\*|__)(?=\\S)(.+?)(?<=\\S)\\6', // 6 delim, 7 strong
    '~~(.+?)~~', // 8 del
    '\\*(?=\\S)([^*]+?)(?<=\\S)\\*', // 9 em (*)
    '(?<![\\p{L}\\p{N}_])_(?=\\S)([^_]+?)(?<=\\S)_(?![\\p{L}\\p{N}_])', // 10 em (_)
  ].join('|'),
  'gu',
);

export function renderInline(text) {
  let out = '';
  let at = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    out += escapeHTML(text.slice(at, m.index));
    at = m.index + m[0].length;
    if (m[2] !== undefined) {
      const src = safeURL(m[2], { image: true });
      out += src ? `<img src="${escapeHTML(src)}" alt="${escapeHTML(m[1])}" class="doc-image">` : escapeHTML(m[0]);
    } else if (m[4] !== undefined) {
      const href = safeURL(m[4]);
      out += href
        ? `<a href="${escapeHTML(href)}" rel="noopener noreferrer">${renderInline(m[3])}</a>`
        : escapeHTML(m[0]);
    } else if (m[5] !== undefined) out += `<code>${escapeHTML(m[5])}</code>`;
    else if (m[7] !== undefined) out += `<strong>${renderInline(m[7])}</strong>`;
    else if (m[8] !== undefined) out += `<del>${renderInline(m[8])}</del>`;
    else out += `<em>${renderInline(m[9] ?? m[10])}</em>`;
  }
  return out + escapeHTML(text.slice(at));
}

const LIST_RE = /^(\s*)([-*+]|[\d۰-۹]+[.)])\s+(.*)$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})$/;
const SEP_CELL = /^:?-+:?$/;

const splitRow = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));

const isSepRow = (line) => {
  if (!line || !line.includes('-') || !line.includes('|')) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => SEP_CELL.test(c));
};

function renderTable(rows, aligns) {
  const cell = (tag, c, i) => {
    const a = aligns[i];
    return `<${tag}${a ? ` style="text-align:${a}"` : ''}>${renderInline(c)}</${tag}>`;
  };
  const head = rows.length ? `<thead><tr>${rows[0].map((c, i) => cell('th', c, i)).join('')}</tr></thead>` : '';
  const bodyRows = rows.slice(1).map((r) => `<tr>${r.map((c, i) => cell('td', c, i)).join('')}</tr>`);
  return `<table>${head}${bodyRows.length ? `<tbody>${bodyRows.join('')}</tbody>` : ''}</table>`;
}

function dedent(lines) {
  const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
  return Number.isFinite(ind) ? lines.map((l) => l.slice(Math.min(ind, l.match(/^\s*/)[0].length))) : lines;
}

function renderList(lines, start) {
  const first = lines[start].match(LIST_RE);
  const base = first[1].length;
  const ordered = /^[\d۰-۹]/.test(first[2]);
  const items = [];
  let i = start;
  while (i < lines.length) {
    const m = lines[i].match(LIST_RE);
    if (!m || m[1].length !== base || /^[\d۰-۹]/.test(m[2]) !== ordered) break;
    const body = [m[3]];
    i++;
    const rest = [];
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) {
        const next = lines.slice(i + 1).find((x) => x.trim());
        if (next && next.match(/^\s*/)[0].length > base) {
          rest.push('');
          i++;
          continue;
        }
        break;
      }
      if (l.match(/^\s*/)[0].length > base) {
        rest.push(l);
        i++;
        continue;
      }
      break;
    }
    let html = renderBlocks([...body, ...dedent(rest)]);
    if (!rest.includes('')) html = html.replace(/^<p>([\s\S]*?)<\/p>/, '$1'); // tight list item: no <p> wrapper
    items.push(`<li>${html}</li>`);
  }
  const tag = ordered ? 'ol' : 'ul';
  return [`<${tag}>${items.join('')}</${tag}>`, i];
}

export function renderBlocks(lines) {
  const out = [];
  let para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(renderInline).join('<br>')}</p>`);
    para = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      flush();
      i++;
      continue;
    }
    const fence = line.match(FENCE_RE);
    if (fence) {
      flush();
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i++]);
      if (i < lines.length) i++;
      out.push(`<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`);
      continue;
    }
    const h = t.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?$/);
    if (h) {
      flush();
      out.push(`<h${h[1].length}>${renderInline(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }
    if (HR_RE.test(t)) {
      flush();
      out.push('<hr>');
      i++;
      continue;
    }
    const legacyTable = t.startsWith('|') && t.endsWith('|');
    if (legacyTable || (t.includes('|') && isSepRow(lines[i + 1]))) {
      flush();
      const rows = [];
      let aligns = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        const cells = splitRow(lines[i]);
        if (rows.length === 1 && isSepRow(lines[i])) {
          aligns = cells.map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : ''));
          // Markdown "left/right" are literal; keep as authored.
        } else rows.push(cells);
        i++;
      }
      out.push(renderTable(rows, aligns));
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const inner = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) inner.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${renderBlocks(inner)}</blockquote>`);
      continue;
    }
    if (LIST_RE.test(line)) {
      flush();
      const [html, next] = renderList(lines, i);
      out.push(html);
      i = next;
      continue;
    }
    para.push(t);
    i++;
  }
  flush();
  return out.join('');
}

export function markdownToHTML(text) {
  return renderBlocks(String(text ?? '').replace(/\r\n?/g, '\n').split('\n'));
}
