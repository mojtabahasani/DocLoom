import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { cleanMarkdown, cleanText, defaultRules, isFillerParagraph, makeRec, RULES } from '../src/js/content/cleanup.js';
import { cleanDOM } from '../src/js/content/cleanup-dom.js';

const ZW = '‌';
const only = (id) => ({ ...Object.fromEntries(RULES.map((r) => [r.id, false])), [id]: true });
const run = (src, id) => cleanMarkdown(src, only(id)).text;
const count = (src, id) => cleanMarkdown(src, only(id)).report.find((r) => r.id === id).count;

test('defaults: digits and emoji-decor on, emoji-all off', () => {
  const d = defaultRules();
  assert.equal(d.digits, true);
  assert.equal(d['emoji-decor'], true);
  assert.equal(d['emoji-all'], false);
});

test('arabic: ي ك and Arabic-Indic digits become Persian', () => {
  assert.equal(run('علي كتاب ٤٥٦', 'arabic'), 'علی کتاب ۴۵۶');
  assert.equal(count('علي كتاب', 'arabic'), 2);
});
test('arabic: already Persian text and vocalised Arabic are untouched', () => {
  assert.equal(run('علی کتاب', 'arabic'), 'علی کتاب');
  const verse = 'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ';
  assert.equal(run(verse, 'arabic'), verse);
});
test('arabic: code, URL and e-mail are never touched', () => {
  const s = 'متن `كتاب` و https://x.com/ي و me@x.com\n```\nكتاب ي\n```';
  assert.equal(run(s, 'arabic'), s);
});

test('zwnj: prefix می / نمی and suffixes get a half-space', () => {
  assert.equal(run('نمی خواهم و می روم', 'zwnj'), `نمی${ZW}خواهم و می${ZW}روم`);
  assert.equal(run('کتاب ها و بزرگ تر و بزرگ ترین و دوستان ام', 'zwnj'), `کتاب${ZW}ها و بزرگ${ZW}تر و بزرگ${ZW}ترین و دوستان${ZW}ام`);
  assert.equal(run('خانه های بزرگ', 'zwnj'), `خانه${ZW}های بزرگ`);
});
test('zwnj: already-correct words, «میز» and «می‌روم» do not change', () => {
  for (const s of [`می${ZW}روم`, 'میز', 'میز بزرگ', 'نمیدانم', `کتاب${ZW}ها`, 'کتابها', 'ایمی خوب است', 'تر و تازه']) assert.equal(run(s, 'zwnj'), s);
});
test('zwnj: exceptions (wine noun, function words before a suffix-like word)', () => {
  assert.equal(run('یک می سرخ نوشید', 'zwnj'), 'یک می سرخ نوشید');
  assert.equal(run('او را ها کرد', 'zwnj'), 'او را ها کرد');
  assert.equal(run('و تر بود', 'zwnj'), 'و تر بود');
  assert.equal(run('a می b', 'zwnj'), 'a می b');
});
test('zwnj: not inside code or URLs', () => {
  const s = '`می خواهم` و https://x.com/کتاب ها و me@x.com';
  assert.equal(run(s, 'zwnj'), s.replace('و https://x.com/کتاب ها', 'و https://x.com/کتاب ها'));
  assert.equal(run('```\nنمی خواهم\n```', 'zwnj'), '```\nنمی خواهم\n```');
});

test('digits: Latin digits become Persian only inside Persian sentences', () => {
  assert.equal(run('من 3 کتاب دارم در سال 2024', 'digits'), 'من ۳ کتاب دارم در سال ۲۰۲۴');
  assert.equal(run('قیمت 1,200 تومان و 3.5 درصد', 'digits'), 'قیمت ۱٬۲۰۰ تومان و ۳٫۵ درصد');
});
test('digits: English sentences, version/identifier digits stay Latin', () => {
  assert.equal(run('I have 3 apples in 2024', 'digits'), 'I have 3 apples in 2024');
  assert.equal(run('از Python 3 و H2O و GPT-4 و 3D و v2 و iPhone 15 استفاده کن', 'digits'), 'از Python 3 و H2O و GPT-4 و 3D و v2 و iPhone 15 استفاده کن');
});
test('digits: code, URL, e-mail and fenced blocks untouched', () => {
  const s = 'سایت https://x.com/a1/2 و `x = 5` و me2@x.com\n```\nمن 3 کتاب\n```';
  assert.equal(run(s, 'digits'), s);
});

test('punct: Persian comma, semicolon, question mark, quotes; space before mark removed', () => {
  assert.equal(run('سلام, چطوری ؟ بله; خوب', 'punct'), 'سلام، چطوری؟ بله؛ خوب');
  assert.equal(run('او گفت "سلام" و رفت', 'punct'), 'او گفت «سلام» و رفت');
  assert.equal(run('نکته : مهم است !', 'punct'), 'نکته: مهم است!');
});
test('punct: English sentences, numbers like 1,000 and URLs keep their marks', () => {
  assert.equal(run('Hello, world? Yes; "ok"', 'punct'), 'Hello, world? Yes; "ok"');
  assert.equal(run('آمار ۱,۰۰۰ نفر', 'punct'), 'آمار ۱,۰۰۰ نفر');
  assert.equal(run('ببین https://x.com/a?b=1,2 و `a, b` ؟', 'punct'), 'ببین https://x.com/a?b=1,2 و `a, b`؟');
  assert.equal(run('سلام ![تصویر](a.png)', 'punct'), 'سلام ![تصویر](a.png)');
});

test('emoji-decor: only the leading emoji of headings and list items', () => {
  assert.equal(run('# 🚀 مقدمه', 'emoji-decor'), '# مقدمه');
  assert.equal(run('- ✅ مورد\n* 📌 دیگر', 'emoji-decor'), '- مورد\n* دیگر');
  assert.equal(run('پاراگراف 🎉 با ایموجی', 'emoji-decor'), 'پاراگراف 🎉 با ایموجی');
  assert.equal(run('# عنوان 🚀', 'emoji-decor'), '# عنوان 🚀');
  assert.equal(run('```\n# 🚀 x\n```', 'emoji-decor'), '```\n# 🚀 x\n```');
});
test('emoji-all: removes every emoji outside code; © and arrows stay', () => {
  assert.equal(run('سلام 🎉 دنیا 👍🏽.', 'emoji-all'), 'سلام دنیا.');
  assert.equal(run('© 2024 → بعد', 'emoji-all'), '© 2024 → بعد');
  assert.equal(run('`🎉` و 🎉', 'emoji-all'), '`🎉` و');
});

test('filler: whole first / last paragraph only', () => {
  assert.equal(run('حتماً!\n\nمتن اصلی\n\nامیدوارم مفید باشد.', 'filler'), 'متن اصلی');
  assert.equal(run('Certainly!\n\nBody text here.\n\nI hope this helps!', 'filler'), 'Body text here.');
  assert.equal(run('متن\n\nاگر سؤال دیگری داشتید، خوشحال می‌شوم کمک کنم.', 'filler'), 'متن');
  assert.equal(count('حتماً!\n\nمتن\n\nI hope this helps', 'filler'), 2);
});
test('filler: phrase inside a longer paragraph, or in the middle, is kept', () => {
  const a = 'امیدوارم مفید باشد، اما اول باید درباره بودجه سال آینده و برنامه‌های شرکت صحبت کنیم تا همه چیز روشن شود و تصمیم بگیریم.';
  assert.equal(run(`${a}\n\nمتن`, 'filler'), `${a}\n\nمتن`);
  assert.equal(run('متن اول\n\nامیدوارم مفید باشد\n\nمتن آخر', 'filler'), 'متن اول\n\nامیدوارم مفید باشد\n\nمتن آخر');
  assert.equal(isFillerParagraph('حتماً! این گزارش فروش سه ماه گذشته است و باید با دقت بررسی شود، چون تصمیم‌های مهمی به آن وابسته است.'), false);
});
test('filler: fenced code is never removed', () => {
  const s = '```\nCertainly!\n```\n\nمتن';
  assert.equal(run(s, 'filler'), s);
});

test('artifacts: orphan **, trailing spaces, extra blank lines, duplicate hr', () => {
  assert.equal(run('این **ناقص است', 'artifacts'), 'این ناقص است');
  assert.equal(run('این **کامل** است', 'artifacts'), 'این **کامل** است');
  assert.equal(run('خط   \nخط دو\t', 'artifacts'), 'خط\nخط دو');
  assert.equal(run('a\n\n\n\n\nb', 'artifacts'), 'a\n\n\nb');
  assert.equal(run('a\n\n---\n\n---\n\nb', 'artifacts'), 'a\n\n---\n\nb');
  assert.equal(run('a\n\n---\n\nb', 'artifacts'), 'a\n\n---\n\nb');
  assert.equal(run('```\nx **y   \n\n\n\n\nz\n```', 'artifacts'), '```\nx **y   \n\n\n\n\nz\n```');
});

test('full run on a realistic AI answer reports counts and leaves code intact', () => {
  const src = 'حتماً!\n\n# 🚀 مقدمه ي كتاب ها\n\nمن 3 كتاب ها دارم, و نمی خواهم.\n\n```js\nconst a = 3; // كتاب ها\n```\n\nامیدوارم مفید باشد';
  const r = cleanMarkdown(src);
  assert.ok(r.text.includes('```js\nconst a = 3; // كتاب ها\n```'));
  assert.ok(r.text.startsWith(`# مقدمه ی کتاب${ZW}ها`));
  assert.ok(r.text.includes(`من ۳ کتاب${ZW}ها دارم، و نمی${ZW}خواهم.`));
  assert.ok(!r.text.includes('حتماً') && !r.text.includes('امیدوارم'));
  for (const id of ['arabic', 'zwnj', 'digits', 'punct', 'emoji-decor', 'filler']) assert.ok(r.report.find((x) => x.id === id).count > 0, id);
  assert.ok(r.report.find((x) => x.id === 'zwnj').samples[0].after.includes(ZW));
});

test('cleanText on a plain run (used by the DOM driver)', () => {
  assert.equal(cleanText('علي 3 كتاب ها', defaultRules(), { persian: true }), `علی ۳ کتاب${ZW}ها`);
  assert.equal(cleanText('x 3', defaultRules(), { persian: false }), 'x 3');
  assert.ok(makeRec().data);
});

test('DOM driver: text nodes cleaned; pre/code/link text and URLs untouched', () => {
  const { document } = parseHTML('<!doctype html><html><body><div id="r"></div></body></html>');
  const root = document.getElementById('r');
  root.innerHTML = '<p>حتماً!</p><h2>🚀 مقدمه</h2><p>من 3 كتاب ها دارم</p><pre><code>كتاب ها 3</code></pre>' +
    '<p>لینک: <a href="https://x.com/ي">https://x.com/ي</a> و <code>كتاب</code></p><hr><hr><p>این **ناقص</p><p>امیدوارم مفید باشد</p>';
  const { report } = cleanDOM(root, defaultRules());
  const html = root.innerHTML;
  assert.ok(html.includes('<h2>مقدمه</h2>'));
  assert.ok(html.includes(`من ۳ کتاب${ZW}ها دارم`));
  assert.ok(html.includes('<pre><code>كتاب ها 3</code></pre>'));
  assert.ok(html.includes('https://x.com/ي</a>') && html.includes('<code>كتاب</code>'));
  assert.equal((html.match(/<hr/g) || []).length, 1);
  assert.ok(html.includes('این ناقص') && !html.includes('حتماً') && !html.includes('امیدوارم'));
  assert.ok(report.find((r) => r.id === 'filler').count === 2);
});

test('filler: «حتماً! در ادامه …:» intro is removed as a whole', () => {
  assert.equal(run('حتماً! در ادامه راهنما:\n\nمتن', 'filler'), 'متن');
  assert.equal(run('متن\n\nدر ادامه راهنما: ' + 'کلمه '.repeat(40), 'filler').startsWith('متن\n\nدر ادامه'), true);
});
