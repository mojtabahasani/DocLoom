// AI-output cleanup. Pure (no DOM): text-level rules + a Markdown-source driver.
// Code (fenced + inline), URLs and e-mail addresses are never modified.
// The DOM driver (preview text nodes) lives in cleanup-dom.js and reuses cleanText/isFillerParagraph.

export const RULES = [
  { id: 'arabic', label: 'ی و ک عربی ← فارسی', hint: 'ي ك و ارقام عربی-هندی به شکل فارسی', def: true },
  { id: 'zwnj', label: 'نیم‌فاصله', hint: '«می »، «نمی » و «ها، تر، ترین، ام…» که با فاصله جدا شده‌اند', def: true },
  { id: 'digits', label: 'ارقام لاتین ← فارسی', hint: 'فقط داخل جملهٔ فارسی؛ «Python 3» و «H2O» دست‌نخورده می‌ماند', def: true },
  { id: 'punct', label: 'علائم فارسی', hint: '، ؛ ؟ و «» در جملهٔ فارسی و حذف فاصلهٔ پیش از علامت', def: true },
  { id: 'emoji-decor', label: 'ایموجی تزئینی ابتدای تیتر و فهرست', hint: 'فقط ایموجی اول هر تیتر یا آیتم', def: true },
  { id: 'emoji-all', label: 'حذف همهٔ ایموجی‌ها', hint: 'هر ایموجی در متن (پیش‌فرض خاموش)', def: false },
  { id: 'filler', label: 'جملهٔ اضافهٔ هوش مصنوعی', hint: 'فقط وقتی یک پاراگراف کامل در ابتدا یا انتهای سند باشد', def: true },
  { id: 'artifacts', label: 'مصنوعات Markdown', hint: '** یتیم، خط خالی اضافه، فاصلهٔ انتهای خط، جداکنندهٔ تکراری', def: true },
];

export const defaultRules = () => Object.fromEntries(RULES.map((r) => [r.id, r.def]));

const LET = '\\u0621-\\u064A\\u0671-\\u06D3'; // Arabic-script letters (no digits)
const PD = '\\u06F0-\\u06F9';
const LET_RE = new RegExp(`[${LET}]`, 'g');
const EMO =
  '(?:[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B50}\\u{2B55}\\u{231A}\\u{231B}\\u{23E9}-\\u{23F3}\\u{23F8}-\\u{23FA}\\u{2934}\\u{2935}\\u{3297}\\u{3299}]|[#*0-9]\\uFE0F?\\u20E3)' +
  '(?:\\uFE0F|\\u200D[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2640}\\u{2642}]\\uFE0F?)*';
const EMO_RUN = `(?:${EMO}|\\uFE0F|\\u200D)+`;
const FENCE = /^\s*(`{3,}|~{3,})/;
const LINE_HEAD = /^(\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|[\d۰-۹]+[.)]\s+))?(.*)$/;
const PROTECT = /`[^`\n]*`|\bhttps?:\/\/[^\s)<>"]+|\bwww\.[^\s)<>"]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\]\([^)\n]*\)|<[^>\n]+>/g;
const FUNC_WORDS = new Set(['و', 'را', 'به', 'از', 'در', 'با', 'که', 'یا', 'تا', 'هم', 'نه']);
const MI_NOUN_NEXT = new Set(['سرخ', 'ناب', 'انگور', 'کهنه', 'گلرنگ']); // «یک می سرخ» (wine) is not a prefix

/** Collects per-rule counts and up to three before/after samples. */
export function makeRec() {
  const data = {};
  return {
    data,
    hit(id, before, after, whole, off = 0, len = 0) {
      const d = (data[id] ||= { count: 0, samples: [] });
      d.count++;
      if (d.samples.length < 3) {
        const pre = whole ? whole.slice(Math.max(0, off - 12), off) : '';
        const post = whole ? whole.slice(off + len, off + len + 12) : '';
        d.samples.push({ before: (pre + before + post).trim(), after: (pre + after + post).trim() });
      }
    },
  };
}

export const reportOf = (rec) =>
  RULES.map((r) => ({ id: r.id, label: r.label, count: rec.data[r.id]?.count || 0, samples: rec.data[r.id]?.samples || [] }));

/** Persian-sentence test: more Arabic-script letters than Latin ones. */
export const isPersian = (s) => (s.match(LET_RE) || []).length > (s.match(/[A-Za-z]/g) || []).length;

function sub(s, re, id, rec, fn) {
  return s.replace(re, (...a) => {
    const m = a[0];
    const off = a[a.length - 2];
    const out = fn(...a);
    if (out === m) return m;
    rec.hit(id, m, out, s, off, m.length);
    return out;
  });
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function arabic(s, rec) {
  if (/[\u064B-\u0652]/.test(s)) return s; // vocalised Arabic text (e.g. a Quran verse) is left alone
  return sub(s, /[يك٠-٩]/g, 'arabic', rec, (m) => (m === 'ي' ? 'ی' : m === 'ك' ? 'ک' : '۰۱۲۳۴۵۶۷۸۹'[AR_DIGITS.indexOf(m)]));
}

const prevWord = (s, off) => (s.slice(0, off).match(new RegExp(`([${LET}]+)$`)) || [])[1] || '';

function zwnj(s, rec) {
  s = sub(s, new RegExp(`(?<![${LET}\\u200c])(ن?می)[ \\t]+(?=([${LET}]+))`, 'g'), 'zwnj', rec, (m, p, next) =>
    p === 'می' && MI_NOUN_NEXT.has(next) ? m : p + '\u200c',
  );
  return sub(s, new RegExp(`(?<=[${LET}])[ \\t]+(هایی|های|ها|ترین|تر|ام|ات|اش)(?![${LET}])`, 'g'), 'zwnj', rec, (m, suf, off) => {
    const w = prevWord(s, off);
    return w.length < 2 || FUNC_WORDS.has(w) ? m : '\u200c' + suf;
  });
}

function digits(s, ctx, rec) {
  if (!ctx.persian) return s;
  return sub(s, /\d+(?:[.,]\d+)*/g, 'digits', rec, (m, off) => {
    const before = s.slice(0, off);
    const next = s[off + m.length] || '';
    if (/[A-Za-z_]$/.test(before) || /[A-Za-z_]/.test(next)) return m; // H2O, v2, 3D
    if (/[A-Za-z][-_/]$/.test(before)) return m; // GPT-4
    const tok = before.match(/(\S+)\s+$/);
    if (tok && /[A-Za-z]$/.test(tok[1])) return m; // "Python 3", "iPhone 15"
    let out = m;
    if (/^\d+(,\d{3})+$/.test(m)) out = m.replace(/,/g, '٬');
    else if (/^\d+\.\d+$/.test(m)) out = m.replace('.', '٫');
    return out.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  });
}

function punct(s, ctx, rec) {
  if (!ctx.persian) return s;
  const L = `[${LET}${PD}»”)\\]]`;
  s = sub(s, new RegExp(`(?<=${L})\\s*,(?=\\s|$)`, 'g'), 'punct', rec, () => '،');
  s = sub(s, new RegExp(`(?<=${L})\\s*;(?=\\s|$)`, 'g'), 'punct', rec, () => '؛');
  s = sub(s, new RegExp(`(?<=${L})\\s*\\?`, 'g'), 'punct', rec, () => '؟');
  s = sub(s, /[ \t]+(?=[،؛؟]|!(?!\[))/g, 'punct', rec, () => '');
  s = sub(s, new RegExp(`(?<=[${LET}${PD}])[ \\t]+(?=[.:](?:\\s|$))`, 'g'), 'punct', rec, () => '');
  s = sub(s, /[“”]/g, 'punct', rec, (m) => (m === '“' ? '«' : '»'));
  if ((s.match(/"/g) || []).length >= 2 && (s.match(/"/g) || []).length % 2 === 0) {
    let closing = false;
    s = sub(s, /"/g, 'punct', rec, () => ((closing = !closing) ? '«' : '»'));
  }
  return s;
}

function emojiAll(s, rec) {
  return sub(s, new RegExp(`([ \\t]?)${EMO_RUN}([ \\t]?)`, 'gu'), 'emoji-all', rec, (m, a, b, off) => {
    if (off === 0 || off + m.length >= s.length || /^[.,،؛؟!:)]/.test(s.slice(off + m.length))) return '';
    return a || b ? ' ' : '';
  });
}

/** Rules for one run of text (never code/URL/e-mail). ctx: { persian } */
export function cleanText(s, on, ctx, rec = makeRec()) {
  if (on.arabic) s = arabic(s, rec);
  if (on.zwnj) s = zwnj(s, rec);
  if (on.digits) s = digits(s, ctx, rec);
  if (on.punct) s = punct(s, ctx, rec);
  if (on['emoji-all']) s = emojiAll(s, rec);
  return s;
}

/** Split a line into [{text, prot}] keeping inline code, URLs, e-mail, link targets and tags protected. */
export function splitProtected(line) {
  const out = [];
  let at = 0;
  for (const m of line.matchAll(PROTECT)) {
    if (m.index > at) out.push({ text: line.slice(at, m.index), prot: false });
    out.push({ text: m[0], prot: true });
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at), prot: false });
  return out;
}

export function removeLeadEmoji(body, rec) {
  const re = new RegExp(`^${EMO_RUN}\\s*(?=\\S)`, 'u');
  const m = body.match(re);
  if (!m) return body;
  rec.hit('emoji-decor', m[0].trim(), '', body, 0, m[0].length);
  return body.slice(m[0].length);
}

/** Remove the unpaired `**` of a line (masked = same line with protected spans blanked out). */
function orphanBold(line, parts, rec) {
  const masked = parts.map((p) => (p.prot ? '\u0000'.repeat(p.text.length) : p.text)).join('');
  const pos = [...masked.matchAll(/\*\*/g)].map((m) => m.index);
  if (pos.length % 2 === 0) return line;
  const at = pos[pos.length - 1];
  rec.hit('artifacts', '**', '', line, at, 2);
  return line.slice(0, at) + line.slice(at + 2);
}

/** One Markdown line outside fenced code. */
export function cleanLine(line, on, rec) {
  const [, head = '', body0] = line.match(LINE_HEAD);
  let body = body0;
  if (on['emoji-decor'] && /^\s*(#{1,6}|[-*+])\s/.test(head)) body = removeLeadEmoji(body, rec);
  const parts = splitProtected(body);
  const persian = isPersian(parts.filter((p) => !p.prot).map((p) => p.text).join(''));
  for (const p of parts) if (!p.prot) p.text = cleanText(p.text, on, { persian }, rec);
  let out = head + parts.map((p) => p.text).join('');
  if (on.artifacts) {
    const ps = splitProtected(out);
    out = orphanBold(out, ps, rec);
    const t = out.replace(/[ \t]+$/, '');
    if (t !== out) rec.hit('artifacts', 'فاصلهٔ انتهای خط', '', out, out.length - 1, 0);
    out = t;
  }
  return out;
}

// ---- AI filler paragraphs ----
const FA_END = '[.!؟?…]*';
const FILLER = [
  new RegExp(`^امیدوارم[^.!؟?،]{0,45}(مفید|کمک|کاربردی|رضایت)[^.!؟?،]{0,30}${FA_END}$`),
  new RegExp(`^(اگر|چنانچه)\\s[^.!؟?]{0,50}?(س[وؤئ]+ال|پرسش|ابهام|کمک|توضیح)[^.!؟?]{0,60}(بپرسید|بفرمایید|بگویید|در خدمت|خوشحال|مطرح کنید|اطلاع دهید|کمک کنم|حاضرم)[^.!؟?]{0,50}${FA_END}$`),
  new RegExp(`^(بله[،,]?\\s*)?(حتماً|حتما|البته|چشم|باشه|بسیار خوب)\\s*[!.،]*\\s*((در ادامه|این هم|ایناهاش|پاسخ شما|در زیر)[^.!؟?]{0,100})?[:!.]?$`),
  /^(در ادامه|این هم|ایناهاش|در زیر)[^.!؟?]{0,100}[:.]?$/,
  new RegExp(`^(موفق باشید|در خدمتم|خوشحال می ?شوم[^.!؟?]*)${FA_END}$`),
  /^(certainly|sure|of course|absolutely|great question)[!.,]?(\s+(here('| i)s|here are|below is)[^.!?]{0,100})?[:!.]?$/i,
  /^i hope (this|that|these)[^.!?]*(helps|useful|helpful)[^.!?]*[.!]?$/i,
  /^if you (have|need|want)[^.!?]*(question|help|anything|else|further|more)[^.!?]*[.!?]?$/i,
  /^(let me know|feel free|don't hesitate|please let me know|happy to help)[^.!?]*[.!?]?$/i,
];

export function isFillerParagraph(text) {
  const t = String(text)
    .replace(/[*_`#>~]/g, '')
    .replace(new RegExp(EMO_RUN, 'gu'), '')
    .replace(/\u200c/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[—–-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.length > 160) return false;
  const sentences = t.split(/(?<=[.!?؟…])\s+/).filter(Boolean);
  return sentences.every((s) => FILLER.some((re) => re.test(s)));
}

function dropFiller(lines, rec) {
  const paragraphAt = (i, step) => {
    while (lines[i] !== undefined && !lines[i].trim()) i += step;
    if (lines[i] === undefined || FENCE.test(lines[i])) return null;
    let a = i;
    let b = i;
    while (lines[a - 1] !== undefined && lines[a - 1].trim()) a--;
    while (lines[b + 1] !== undefined && lines[b + 1].trim()) b++;
    return { a, b };
  };
  const strip = () => {
    while (lines.length && /^\s*(-{3,}|\*{3,}|_{3,})?\s*$/.test(lines[lines.length - 1])) lines.pop();
    while (lines.length && /^\s*(-{3,}|\*{3,}|_{3,})?\s*$/.test(lines[0])) lines.shift();
  };
  for (const step of [1, -1]) {
    for (let n = 0; n < 2; n++) {
      const p = paragraphAt(step > 0 ? 0 : lines.length - 1, step);
      if (!p || lines.slice(p.a, p.b + 1).some((l) => FENCE.test(l)) || !isFillerParagraph(lines.slice(p.a, p.b + 1).join(' '))) break;
      rec.hit('filler', lines.slice(p.a, p.b + 1).join(' ').slice(0, 70), '(حذف شد)');
      lines.splice(p.a, p.b - p.a + 1);
      strip();
    }
  }
}

/** Clean a Markdown source. Returns { text, report }. */
export function cleanMarkdown(src, on = defaultRules()) {
  const rec = makeRec();
  let lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  if (on.filler) dropFiller(lines, rec);
  let fence = null;
  lines = lines.map((line) => {
    const f = line.match(FENCE);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      return line;
    }
    if (f) {
      fence = f[1];
      return line;
    }
    return cleanLine(line, on, rec);
  });
  if (on.artifacts) lines = tidyBlocks(lines, rec);
  return { text: lines.join('\n'), report: reportOf(rec) };
}

/** Outside fenced code: at most two blank lines in a row, and no repeated horizontal rule. */
function tidyBlocks(lines, rec) {
  const out = [];
  let fence = null;
  let blanks = 0;
  const isHr = (l) => /^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/.test(l);
  for (const line of lines) {
    const f = line.match(FENCE);
    if (fence || f) {
      if (f && !fence) fence = f[1];
      else if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      out.push(line);
      blanks = 0;
      continue;
    }
    if (!line.trim()) {
      if (++blanks > 2) rec.hit('artifacts', 'خط‌های خالی پیاپی', '');
      else out.push(line);
      continue;
    }
    blanks = 0;
    if (isHr(line)) {
      let k = out.length;
      while (k > 0 && !out[k - 1].trim()) k--;
      if (k > 0 && isHr(out[k - 1])) {
        out.length = k;
        rec.hit('artifacts', 'جداکنندهٔ تکراری', '');
        continue;
      }
    }
    out.push(line);
  }
  return out;
}
