import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REPORT_PROMPT, LETTER_ADDON, reportPrompt } from '../src/js/content/report-prompt.js';
import { markdownToHTML, CALLOUTS } from '../src/js/content/markdown.js';
import { extractChartData } from '../src/js/content/chart.js';

const DOC = new URL('../docs/قالب-گزارش.md', import.meta.url);

/** The ```text fenced blocks of the doc, in order. */
async function docPromptBlocks() {
  const md = await readFile(DOC, 'utf8');
  return [...md.matchAll(/^```text\n([\s\S]*?)\n```$/gm)].map((m) => m[1]);
}

test('docs/قالب-گزارش.md quotes the prompt module verbatim', async () => {
  const [base, letter] = await docPromptBlocks();
  assert.equal(base, REPORT_PROMPT, 'the base prompt in the doc drifted from report-prompt.js');
  assert.equal(letter, LETTER_ADDON, 'the letter addon in the doc drifted from report-prompt.js');
});

test('reportPrompt composes the letter addon only when asked', () => {
  assert.equal(reportPrompt(), REPORT_PROMPT);
  assert.equal(reportPrompt({ letter: false }), REPORT_PROMPT);
  assert.equal(reportPrompt({ letter: true }), REPORT_PROMPT + '\n\n' + LETTER_ADDON);
});

test('the prompt itself obeys the Persian rules it preaches', () => {
  const both = REPORT_PROMPT + '\n' + LETTER_ADDON;
  // ي and ك appear exactly once, on the line that teaches not to use them.
  const arabic = both.split('\n').filter((l) => /[يك]/.test(l));
  assert.deepEqual(arabic, ['- «ی» و «ک» فارسی (نه ي و ك عربی).']);
  assert.ok(!/[ \t]+$/m.test(both), 'no trailing whitespace');
  assert.ok(!/\n{3}/.test(both), 'at most one blank line in a row');
  assert.ok(!/‌\s|\s‌/.test(both), 'no ZWNJ next to a space');
});

test('the prompt names every callout DocLoom understands', () => {
  for (const fa of Object.values(CALLOUTS)) assert.ok(REPORT_PROMPT.includes(`[!${fa}]`), `missing callout [!${fa}]`);
});

test('the prompt states the four rules that actually break reports', () => {
  assert.match(REPORT_PROMPT, /در \*\*یک خط\*\* بنویس/); // paragraphs on one line
  assert.match(REPORT_PROMPT, /آدرس لخت/); // bare URLs are not linkified
  assert.match(REPORT_PROMPT, /اولین کاراکتر خروجی باید «#» باشد/); // no AI preamble
  assert.match(REPORT_PROMPT, /واحد را در سرستون بنویس/); // chart rule
});

test("the prompt's own example table is chartable, with the unit in the header", () => {
  const rows = REPORT_PROMPT.split('\n')
    .filter((l) => l.trim().startsWith('|') && !/^\s*\|[\s:|-]+\|\s*$/.test(l))
    .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  const data = extractChartData(rows);
  assert.ok(data, 'the example table must produce chart data');
  assert.deepEqual(data.labels, ['فروردین', 'اردیبهشت']);
  assert.deepEqual(data.series.map((s) => s.values), [[120, 145], [18, 24]]);
  for (const s of data.series) assert.match(s.name, /میلیون تومان/); // unit lives in the header
});

test('the letter addon starts a document the app detects as a letter', async () => {
  const { detectKind } = await import('../src/js/content/detect.js');
  const body = LETTER_ADDON.slice(LETTER_ADDON.indexOf('باسمه تعالی'));
  assert.equal(detectKind(body).letter, true);
});

test('the prompt body renders without leaking raw markers', () => {
  const html = markdownToHTML('# عنوان\n\nیک پاراگراف.\n\n> [!مهم] نکته\n');
  assert.match(html, /<aside class="callout callout-important">/);
  assert.ok(!html.includes('[!مهم]'));
});
