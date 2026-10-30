import test from 'node:test';
import assert from 'node:assert/strict';
import { highlight, tokenize, normLang, langLabel } from '../src/js/content/highlight.js';

const samples = {
  js: 'const a = "x<y" + foo(1); // hi & <bye>\n`t${a}` /* c */',
  ts: 'interface A { x: number }\nlet y: string = \'q\';',
  py: 'def f(x):\n  """doc <b>"""\n  return "a" # c\n@dec',
  html: '<div class="a b" id=x data-q=\'1\'>text & "q" <!-- c --></div><br/>',
  css: '@media (max-width:1px){a:hover{color:#fff;margin:0 10px}} /* c */',
  json: '{"a": [1, -2.5e3, true, null, "s<"]}',
  bash: 'echo "$HOME" --flag $(ls) # c\nif [ -f x ]; then cd /tmp; fi',
  sql: "SELECT count(*), 'a<b' FROM t WHERE x = 1 -- c\n/* m */",
};

test('tokens always concatenate back to the source', () => {
  for (const [lang, code] of Object.entries(samples)) assert.equal(tokenize(code, lang).map((t) => t[1]).join(''), code, lang);
});

test('output is escaped: no raw < > & or quotes from code survive', () => {
  for (const [lang, code] of Object.entries(samples)) {
    const out = highlight(code, lang);
    const text = out.replace(/<span class="tok-[a-z]">|<\/span>/g, '');
    assert.ok(!/[<>"']/.test(text.replace(/&(amp|lt|gt|quot|#39);/g, '')), lang + ': ' + text);
    assert.ok(!/<(?!\/?span)/.test(out), lang);
  }
  assert.equal(highlight('<script>alert(1)</script>', 'html').includes('<script>'), false);
});

test('token classes per language', () => {
  assert.match(highlight('const a = 1', 'js'), /<span class="tok-k">const<\/span>.*<span class="tok-n">1<\/span>/);
  assert.match(highlight('foo(1)', 'ts'), /tok-f">foo/);
  assert.match(highlight('# c', 'py'), /tok-c/);
  assert.match(highlight('<a href="x">', 'html'), /tok-f">&lt;a.*tok-a">href.*tok-s">&quot;x&quot;/);
  assert.match(highlight('a{color:red}', 'css'), /tok-a">color/);
  assert.match(highlight('{"k": "v"}', 'json'), /tok-a">&quot;k&quot;.*tok-s">&quot;v&quot;/);
  assert.match(highlight('ls --all', 'bash'), /tok-f">ls.*tok-n">--all/);
  assert.match(highlight('select 1', 'sql'), /tok-k">select/);
});

test('unknown language stays plain (escaped); aliases and labels', () => {
  assert.equal(highlight('a < b', 'rust'), 'a &lt; b');
  assert.equal(highlight('a < b'), 'a &lt; b');
  assert.equal(normLang('JavaScript'), 'js');
  assert.equal(normLang('sh'), 'bash');
  assert.equal(normLang('xml'), 'html');
  assert.equal(langLabel('python title="x"'), 'py');
  assert.equal(langLabel('rust'), 'rust');
  assert.equal(langLabel('"><script>'), '');
});
