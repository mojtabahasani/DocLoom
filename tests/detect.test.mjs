import test from 'node:test';
import assert from 'node:assert/strict';
import { detectKind } from '../src/js/content/detect.js';

const AI = 'حتماً!\n\n## 🚀 مقدمه\n\nمتن کتاب ها با **تأکید** و **نکته** و **مهم** و **پایان**.\n\n## ✅ جمع‌بندی\n\nمتن دوم\n\nامیدوارم مفید باشد!';

test('AI output: several cues -> ai', () => {
  const d = detectKind(AI);
  assert.equal(d.ai, true);
  assert.equal(d.letter, false);
  assert.ok(d.reasons.includes('emoji-headings') && d.reasons.includes('filler'));
});
test('AI output: Arabic letters alone are not enough', () => {
  assert.equal(detectKind('این یک متن ساده است که حرف ي دارد و هیچ نشانه دیگری ندارد.').ai, false);
});
test('plain Persian prose and tiny texts are not flagged', () => {
  assert.equal(detectKind('امروز هوا خوب است و ما به پارک رفتیم. بعد از ظهر هم کتاب خواندیم.').ai, false);
  assert.deepEqual([detectKind('').ai, detectKind('سلام').letter], [false, false]);
});
test('letter: bismillah, «به:» and «موضوع:» near the top', () => {
  assert.equal(detectKind('باسمه تعالی\n\nجناب آقای احمدی\n\nبا سلام و احترام').letter, true);
  assert.equal(detectKind('به: آقای رضایی\nموضوع: درخواست مرخصی\n\nمتن نامه در اینجا نوشته می‌شود.').letter, true);
  assert.equal(detectKind('**موضوع:** گزارش ماهانه\n\nمتن گزارش در اینجا است و ادامه دارد.').letter, true);
});
test('letter: «موضوع:» deep inside the document does not count', () => {
  const body = Array.from({ length: 12 }, (_, i) => `خط شماره ${i} از متن بلند`).join('\n');
  assert.equal(detectKind(`${body}\nموضوع: بعدی`).letter, false);
});
