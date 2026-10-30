// Fuzzy matching for the command palette and library search. Pure; works for Persian and English.
const DIGITS_FA = '۰۱۲۳۴۵۶۷۸۹';
const DIGITS_AR = '٠١٢٣٤٥٦٧٨٩';

/** Lower-case, unify Arabic/Persian letter variants, drop ZWNJ/ZWJ/tatweel/diacritics, Latin digits. */
export function normalize(input) {
  return String(input ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ً-ٰٟۖ-ۭـ‌‍‎‏]/g, '')
    .replace(/[يىئ]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ۀة]/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/[۰-۹]/g, (d) => DIGITS_FA.indexOf(d))
    .replace(/[٠-٩]/g, (d) => DIGITS_AR.indexOf(d))
    .replace(/\s+/g, ' ')
    .trim();
}

const isBoundary = (ch) => ch === undefined || /[\s\-_/.:()]/.test(ch);

/** Score one normalized token against one normalized text. -1 = no match. */
function scoreToken(token, text) {
  const at = text.indexOf(token);
  if (at >= 0) {
    let s = 100 + token.length * 2;
    if (at === 0) s += 40;
    else if (isBoundary(text[at - 1])) s += 25;
    return s - Math.min(at, 30) * 0.3;
  }
  if (token.length < 2) return -1;
  // Subsequence with a gap penalty.
  let pos = -1;
  let gaps = 0;
  let first = -1;
  for (const ch of token) {
    const next = text.indexOf(ch, pos + 1);
    if (next < 0) return -1;
    if (first < 0) first = next;
    else gaps += next - pos - 1;
    pos = next;
  }
  if (gaps > token.length * 3) return -1;
  return Math.max(1, 40 - gaps - first * 0.2);
}

/** Score `query` against fields [{text, weight}]. Every query token must match some field. -1 = no match. */
export function scoreFields(query, fields) {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (!tokens.length) return 0;
  const hay = fields.map((f) => ({ text: normalize(f.text), weight: f.weight ?? 1 }));
  let total = 0;
  for (const t of tokens) {
    let best = -1;
    for (const f of hay) {
      const s = scoreToken(t, f.text);
      if (s >= 0) best = Math.max(best, s * f.weight);
    }
    if (best < 0) return -1;
    total += best;
  }
  return total;
}

export function fuzzyScore(query, text) {
  return scoreFields(query, [{ text }]);
}

/** Filter + sort items. `fieldsOf(item)` returns [{text, weight}]. Stable for equal scores. */
export function fuzzyFilter(items, query, fieldsOf) {
  if (!normalize(query)) return items.slice();
  return items
    .map((item, i) => ({ item, i, s: scoreFields(query, fieldsOf(item)) }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.item);
}
