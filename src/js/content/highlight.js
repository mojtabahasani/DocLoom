// Lightweight syntax highlighter (own tokenizer). Pure: code string -> HTML string with <span class="tok-*">.
// Languages: js/ts, python, html/xml, css, json, bash, sql. Output is always escaped; unknown languages stay plain.
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const TOK_CLASSES = ['tok-k', 'tok-s', 'tok-c', 'tok-n', 'tok-f', 'tok-a'];
/** Inline colours for places where classes do not survive (e-mail). */
export const TOK_COLORS = { k: '#8250df', s: '#0a7a4b', c: '#6b7a74', n: '#b35900', f: '#0b5fa5', a: '#a0361f' };

const ALIAS = {
  js: 'js', javascript: 'js', jsx: 'js', mjs: 'js', cjs: 'js', node: 'js',
  ts: 'ts', typescript: 'ts', tsx: 'ts',
  py: 'py', python: 'py', python3: 'py',
  html: 'html', htm: 'html', xml: 'html', svg: 'html', xhtml: 'html',
  css: 'css', scss: 'css',
  json: 'json', jsonc: 'json',
  bash: 'bash', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
  sql: 'sql', mysql: 'sql', postgres: 'sql', sqlite: 'sql',
};

/** 'JavaScript' / 'js' -> 'js'; unknown -> null. */
export const normLang = (lang) => ALIAS[String(lang || '').trim().toLowerCase()] || null;

/** First word of a fence info string, restricted to a safe label (used for data-lang). */
export function langLabel(info) {
  const w = String(info || '').trim().split(/\s+/)[0].toLowerCase();
  if (!/^[a-z0-9+#.-]{1,12}$/.test(w)) return '';
  return normLang(w) || w;
}

const words = (s) => new Set(s.split(' '));
const JS_KW = words(
  'break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await true false null undefined interface type enum implements public private protected readonly as declare namespace abstract',
);
const PY_KW = words(
  'and as assert async await break class continue def del elif else except finally for from global if import in is lambda None nonlocal not or pass raise return try while with yield True False self',
);
const BASH_KW = words('if then else elif fi for while do done case esac function in return export local set unset');
const BASH_CMD = words('echo cd ls cat grep sed awk git npm npx node python pip curl sudo mkdir rm cp mv chmod chown tar ssh docker make source exit test');
const SQL_KW = words(
  'select from where and or not insert into values update set delete create table drop alter add index view join left right inner outer full on group by order having limit offset as distinct union all null is in like between exists case when then else end primary key foreign references default unique count sum avg min max asc desc with',
);

// A rule is [sticky regex, type | (match, state, next) => type]. First matching rule wins.
const ident = (kw, calls = true) => [/[A-Za-z_$][\w$]*/y, (m, st, next) => (kw.has(m) ? 'k' : calls && /^\s*\(/.test(next) ? 'f' : '')];
const num = [/\b(?:0x[\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)n?\b/iy, 'n'];
const dq = /"(?:\\[\s\S]|[^"\\\n])*(?:"|$)/y;
const sq = /'(?:\\[\s\S]|[^'\\\n])*(?:'|$)/y;

const LANGS = {
  js: [
    [/\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y, 'c'],
    [/`(?:\\[\s\S]|[^`\\])*(?:`|$)/y, 's'],
    [dq, 's'],
    [sq, 's'],
    num,
    ident(JS_KW),
  ],
  py: [
    [/#[^\n]*/y, 'c'],
    [/[rbfRBF]{0,2}(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$))/y, 's'],
    [/[rbfRBF]{0,2}"(?:\\.|[^"\\\n])*(?:"|$)/y, 's'],
    [/[rbfRBF]{0,2}'(?:\\.|[^'\\\n])*(?:'|$)/y, 's'],
    num,
    [/@[A-Za-z_][\w.]*/y, 'a'],
    ident(PY_KW),
  ],
  css: [
    [/\/\*[\s\S]*?(?:\*\/|$)/y, 'c'],
    [dq, 's'],
    [sq, 's'],
    [/@[\w-]+/y, 'k'],
    [/#[\da-f]{3,8}\b/iy, 'n'],
    [/-?(?:\d*\.)?\d+(?:%|[a-z]+)?/iy, 'n'],
    [/\{/y, (m, st) => (st.depth++, '')],
    [/\}/y, (m, st) => (st.depth = Math.max(0, st.depth - 1), '')],
    [/[\w-]+(?=\s*:)/y, (m, st) => (st.depth > 0 ? 'a' : '')],
    [/[\w-]+(?=\()/y, 'f'],
    [/[\w-]+/y, ''],
  ],
  json: [
    [/"(?:\\.|[^"\\\n])*(?:"|$)/y, (m, st, next) => (/^\s*:/.test(next) ? 'a' : 's')],
    [/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/iy, 'n'],
    [/\b(?:true|false|null)\b/y, 'k'],
  ],
  bash: [
    [/(?<![\w$])#[^\n]*/y, 'c'],
    [dq, 's'],
    [sq, 's'],
    [/\$(?:\{[^}\n]*\}|\([\w]*|[\w@#?*!$-]+)/y, 'a'],
    [/(?<=\s)--?[A-Za-z][\w-]*/y, 'n'],
    [/[A-Za-z_][\w.-]*/y, (m) => (BASH_KW.has(m) ? 'k' : BASH_CMD.has(m) ? 'f' : '')],
  ],
  sql: [
    [/--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y, 'c'],
    [sq, 's'],
    [/"[^"\n]*(?:"|$)/y, 'a'],
    num,
    [/[A-Za-z_][\w]*/y, (m, st, next) => (SQL_KW.has(m.toLowerCase()) ? 'k' : /^\s*\(/.test(next) ? 'f' : '')],
  ],
};
LANGS.ts = LANGS.js;

function htmlTokens(code) {
  const out = [];
  const push = (t, v) => v && out.push([t, v]);
  let i = 0;
  while (i < code.length) {
    const lt = code.indexOf('<', i);
    if (lt < 0) return push('', code.slice(i)), out;
    push('', code.slice(i, lt));
    i = lt;
    if (code.startsWith('<!--', i)) {
      const end = code.indexOf('-->', i + 4);
      const stop = end < 0 ? code.length : end + 3;
      push('c', code.slice(i, stop));
      i = stop;
      continue;
    }
    const open = /<[/!?]?[A-Za-z][\w:.-]*/y;
    open.lastIndex = i;
    const m = open.exec(code);
    if (!m) {
      push('', '<');
      i++;
      continue;
    }
    push('f', m[0]);
    i += m[0].length;
    while (i < code.length) {
      const rest = code.slice(i);
      let r;
      if ((r = /^\s+/.exec(rest))) push('', r[0]);
      else if ((r = /^\/?\??>/.exec(rest))) {
        push('f', r[0]);
        i += r[0].length;
        break;
      } else if ((r = /^[^\s=>/"']+/.exec(rest))) push('a', r[0]);
      else if ((r = /^"[^"]*"?|^'[^']*'?/.exec(rest))) push('s', r[0]);
      else r = [rest[0]], push('', r[0]);
      i += r[0].length;
    }
  }
  return out;
}

/** Tokens as [type, text] pairs; type '' = plain. Concatenating the texts gives back `code`. */
export function tokenize(code, lang) {
  const id = normLang(lang);
  if (!id) return code ? [['', code]] : [];
  if (id === 'html') return htmlTokens(code);
  const rules = LANGS[id];
  const out = [];
  const st = { depth: 0 };
  let plain = '';
  const flush = () => {
    if (plain) out.push(['', plain]);
    plain = '';
  };
  let i = 0;
  while (i < code.length) {
    let hit = null;
    for (const [re, type] of rules) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m[0]) {
        const t = typeof type === 'function' ? type(m[0], st, code.slice(i + m[0].length, i + m[0].length + 40)) : type;
        hit = [t, m[0]];
        break;
      }
    }
    if (!hit) {
      plain += code[i++];
      continue;
    }
    i += hit[1].length;
    if (!hit[0]) plain += hit[1];
    else (flush(), out.push(hit));
  }
  flush();
  return out;
}

export function highlight(code, lang) {
  return tokenize(String(code), lang)
    .map(([t, v]) => (t ? `<span class="tok-${t}">${esc(v)}</span>` : esc(v)))
    .join('');
}
