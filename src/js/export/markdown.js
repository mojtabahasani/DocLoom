// HTML (preview DOM) -> Markdown. Pure: works on any DOM node (browser or linkedom).
const walkKids = (n, ctx) => Array.from(n.childNodes).map((c) => node(c, ctx)).join('');

function listMd(n, ctx) {
  const ordered = String(n.tagName).toUpperCase() === 'OL';
  let idx = 0;
  const lines = [];
  for (const li of Array.from(n.children)) {
    if (String(li.tagName).toUpperCase() !== 'LI') continue;
    idx++;
    const body = walkKids(li, { ...ctx, depth: ctx.depth + 1 }).trim().split('\n');
    const mark = ordered ? idx + '. ' : '- ';
    lines.push(mark + body[0]);
    for (const extra of body.slice(1)) lines.push(extra ? '  ' + extra : extra);
  }
  return lines.join('\n') + (ctx.depth ? '\n' : '\n\n');
}

function tableMd(n) {
  const rows = Array.from(n.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.children).map((c) => (c.textContent || '').trim().replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ')),
  );
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r) => '| ' + [...r, ...Array(width - r.length).fill('')].join(' | ') + ' |';
  return [pad(rows[0]), pad(Array(width).fill('---')), ...rows.slice(1).map(pad)].join('\n') + '\n\n';
}

function node(n, ctx) {
  if (n.nodeType === 3) return n.nodeValue || '';
  if (n.nodeType !== 1) return '';
  const tag = String(n.tagName).toUpperCase();
  switch (tag) {
    case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
      return '#'.repeat(Number(tag[1])) + ' ' + walkKids(n, ctx).trim() + '\n\n';
    case 'P': return walkKids(n, ctx) + '\n\n';
    case 'BR': return '  \n';
    case 'STRONG': case 'B': return '**' + walkKids(n, ctx) + '**';
    case 'EM': case 'I': return '*' + walkKids(n, ctx) + '*';
    case 'DEL': case 'S': return '~~' + walkKids(n, ctx) + '~~';
    case 'CODE': return '`' + (n.textContent || '') + '`';
    case 'PRE': return '```\n' + (n.textContent || '').replace(/\n$/, '') + '\n```\n\n';
    case 'A': return '[' + walkKids(n, ctx) + '](' + (n.getAttribute('href') || '') + ')';
    case 'IMG': return '![' + (n.getAttribute('alt') || '') + '](' + (n.getAttribute('src') || '') + ')\n\n';
    case 'HR': return '---\n\n';
    case 'BLOCKQUOTE':
      return walkKids(n, ctx).trim().split('\n').map((x) => '> ' + x).join('\n') + '\n\n';
    case 'UL': case 'OL': return (ctx.depth ? '\n' : '') + listMd(n, ctx);
    case 'TABLE': return tableMd(n);
    default: {
      const kids = walkKids(n, ctx);
      return /^(DIV|HEADER|FOOTER|ASIDE|SECTION|ARTICLE|MAIN|FIGURE)$/.test(tag) && kids.trim() ? kids.trim() + '\n\n' : kids;
    }
  }
}

export function htmlToMarkdown(root) {
  return Array.from(root.childNodes).map((c) => node(c, { depth: 0 })).join('').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
