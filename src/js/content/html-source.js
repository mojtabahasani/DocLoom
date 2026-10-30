// HTML source helpers: beautifier + syntax highlighter. Pure (DOMParser injected).
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const VOIDS = new Set('AREA BASE BR COL EMBED HR IMG INPUT LINK META PARAM SOURCE TRACK WBR'.split(' '));
const BLOCKS = new Set(
  ('html head body main header footer nav section article aside div p h1 h2 h3 h4 h5 h6 ul ol li table thead tbody tfoot tr th td ' +
    'blockquote figure figcaption details summary form fieldset dl dt dd').split(' '),
);

export function beautifyHTML(input, env = { DOMParser: globalThis.DOMParser }) {
  const doc = new env.DOMParser().parseFromString(input, 'text/html');
  const attrs = (el) =>
    Array.from(el.attributes)
      .map((a) => ` ${a.name}="${String(a.value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
      .join('');
  const inlineOnly = (el) =>
    Array.from(el.childNodes).every(
      (n) => n.nodeType === 3 || n.nodeType === 8 || (n.nodeType === 1 && !BLOCKS.has(n.tagName.toLowerCase())),
    );
  const cssPretty = (text, depth) =>
    text
      .replace(/\s*\{\s*/g, ' {\n' + '  '.repeat(depth + 1))
      .replace(/;\s*/g, ';\n' + '  '.repeat(depth + 1))
      .replace(/\s*}\s*/g, '\n' + '  '.repeat(depth) + '}\n' + '  '.repeat(depth))
      .trim();
  const node = (n, depth = 0) => {
    const pad = '  '.repeat(depth);
    if (n.nodeType === 8) return pad + '<!--' + n.nodeValue + '-->';
    if (n.nodeType === 3) return esc(n.nodeValue || '');
    if (n.nodeType !== 1) return '';
    const tag = n.tagName.toLowerCase();
    const start = '<' + tag + attrs(n) + '>';
    if (VOIDS.has(n.tagName.toUpperCase())) return pad + start.slice(0, -1) + ' />';
    if (tag === 'style')
      return pad + start + '\n' + '  '.repeat(depth + 1) + cssPretty(n.textContent, depth + 1) + '\n' + pad + '</style>';
    if (tag === 'script' || tag === 'pre' || tag === 'textarea') return pad + start + (n.textContent || '') + '</' + tag + '>';
    if (!n.childNodes.length) return pad + start + '</' + tag + '>';
    if (inlineOnly(n))
      return (
        pad +
        start +
        Array.from(n.childNodes)
          .map((c) => (c.nodeType === 3 ? esc(c.nodeValue || '') : c.nodeType === 1 ? node(c, 0) : c.nodeType === 8 ? '<!--' + c.nodeValue + '-->' : ''))
          .join('') +
        '</' + tag + '>'
      );
    const kids = Array.from(n.childNodes).map((c) => node(c, depth + 1)).filter(Boolean);
    return pad + start + '\n' + kids.join('\n') + '\n' + pad + '</' + tag + '>';
  };
  return '<!doctype html>\n' + node(doc.documentElement);
}

export function highlightHTML(text) {
  const span = (cls, s) => `<span class="${cls}">${esc(s)}</span>`;
  const tokenRe = /<\/?[a-zA-Z][^<>]*>|&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/gi;
  return String(text)
    .split('\n')
    .map((line) => {
      if (/^\s*<!doctype\b/i.test(line)) return span('tok-doctype', line);
      if (/^\s*<!--/.test(line)) return span('tok-comment', line);
      let out = '';
      let at = 0;
      for (const match of line.matchAll(tokenRe)) {
        out += esc(line.slice(at, match.index));
        const token = match[0];
        at = match.index + token.length;
        if (token[0] === '&') {
          out += span('tok-entity', token);
          continue;
        }
        const m = token.match(/^(<\/?)([\w:-]+)([\s\S]*?)(\/?>)$/);
        if (!m) {
          out += esc(token);
          continue;
        }
        const attrs = m[3];
        const attrRe = /([\w:-]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'=<>`]+)/g;
        let styled = '';
        let pos = 0;
        for (const a of attrs.matchAll(attrRe)) {
          styled += esc(attrs.slice(pos, a.index)) + span('tok-attr', a[1]) + esc(a[2]);
          const isLink = /^(href|src)$/i.test(a[1]) && /^['"]?https?:\/\//i.test(a[3]);
          styled += span(isLink ? 'tok-link' : 'tok-value', a[3]);
          pos = a.index + a[0].length;
        }
        styled += esc(attrs.slice(pos));
        out += span('tok-bracket', m[1]) + span('tok-tag', m[2]) + styled + span('tok-bracket', m[4]);
      }
      return out + esc(line.slice(at));
    })
    .join('\n');
}
