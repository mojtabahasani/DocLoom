// Document-type detection after text import. Pure.
import { isFillerParagraph } from './cleanup.js';

const EMOJI_HEAD = /^\s*(?:#{1,6}\s+|[-*+]\s+)[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}]/u;
const BISMILLAH = /(باسمه|بسمه)\s*تعالی|بسم\s*الله|به\s*نام\s*خدا/;
const LETTER_FIELD = /^\s*(?:\*\*)?(به|موضوع|از|گیرنده|فرستنده|پیوست|رونوشت)(?:\*\*)?\s*[:：]/;

/** Splits into paragraphs (blocks separated by blank lines). */
const paragraphs = (text) => String(text).replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/**
 * detectKind(text) -> { ai, letter, aiScore, reasons }
 * ai: >= 2 independent AI-output cues. letter: bismillah, or «به:»/«موضوع:» fields near the top.
 */
export function detectKind(text) {
  const src = String(text ?? '');
  const reasons = [];
  if (src.trim().length < 20) return { ai: false, letter: false, aiScore: 0, reasons };
  const lines = src.split('\n');
  const head = lines.filter((l) => l.trim()).slice(0, 8);

  let letter = false;
  if (head.slice(0, 3).some((l) => BISMILLAH.test(l))) letter = true;
  const fields = head.filter((l) => LETTER_FIELD.test(l)).map((l) => l.match(LETTER_FIELD)[1]);
  if (fields.includes('به') || fields.includes('موضوع')) letter = true;
  if (letter) reasons.push('letter');

  let score = 0;
  const emojiHeads = lines.filter((l) => EMOJI_HEAD.test(l)).length;
  if (emojiHeads >= 2) (score += 2), reasons.push('emoji-headings');
  else if (emojiHeads === 1) score += 1;
  const paras = paragraphs(src);
  if (paras.length > 1 && (isFillerParagraph(paras[0]) || isFillerParagraph(paras[paras.length - 1]))) (score += 2), reasons.push('filler');
  if (/[يك]/.test(src)) (score += 1), reasons.push('arabic-letters');
  const bold = (src.match(/\*\*[^*\n]+\*\*/g) || []).length;
  const heads = lines.filter((l) => /^#{1,4}\s/.test(l)).length;
  if (bold >= 4 && heads >= 2) (score += 1), reasons.push('markdown-heavy');
  if ((src.match(/^\s*(?:-{3,}|\*{3,})\s*$/gm) || []).length >= 2 && heads >= 2) (score += 1), reasons.push('separators');

  return { ai: score >= 2, letter, aiScore: score, reasons };
}
