// Classifying a transaction for the printed statement. Pure: no DOM, no state.
//
// Two jobs, both for reconciliation by eye:
//   • a short label, because «کارمزد وارده پایا-شاپرک» does not fit a narrow column;
//   • a group, which colours the row so the repeating kinds separate at a glance.
// The rules are ordered, most specific first, and read the type, the description and شرح۲
// together — the banks put the same fact in different fields.
//
// Telling a card purchase at a POS terminal from one on the internet matters most here:
// Saderat writes «خرید اینترنتی», Keshavarzi and Refah give it away with «پایانه», «POS»
// or «شاپرک» (the Iranian card switch, which settles POS takings).

/** group -> the colour class used by styles/statement.css */
export const GROUPS = {
  'pos-in': { label: 'واریز پوز', cls: 'g-pos' },
  'card-pos': { label: 'خرید پوز', cls: 'g-card-pos' },
  'card-net': { label: 'خرید اینترنتی', cls: 'g-card-net' },
  card: { label: 'خرید کارت', cls: 'g-card' },
  'paya-in': { label: 'واریز پایا', cls: 'g-paya-in' },
  'paya-out': { label: 'حواله پایا', cls: 'g-paya-out' },
  transfer: { label: 'انتقال', cls: 'g-transfer' },
  fee: { label: 'کارمزد', cls: 'g-fee' },
  bill: { label: 'قبض و شارژ', cls: 'g-bill' },
  cheque: { label: 'چک', cls: 'g-cheque' },
  interest: { label: 'سود', cls: 'g-interest' },
  other: { label: '', cls: '' },
};

const has = (s, ...words) => words.some((w) => s.includes(w));

// Each rule gets the text and the record: direction settles cases the wording cannot.
const RULES = [
  // Fees first: «کارمزد POS» is a fee, not a POS purchase. But a bank never pays you a fee —
  // «حواله ACH و کارمزد» on an incoming 2-billion line is the transfer, not its charge.
  ['fee', (s, r) => has(s, 'کارمزد') && !(r.deposit > 0)],
  ['interest', (s) => has(s, 'سود سپرده', 'سود بانکی', 'واریز سود')],
  ['cheque', (s) => has(s, 'چک', 'فیش')],
  // Shaparak settles POS takings, so an incoming Shaparak line is POS income.
  ['pos-in', (s) => has(s, 'شاپرک', 'شاپرك')],
  // The card rules come before bills: Refah labels a whole class of lines
  // «خرید POS / پرداخت قبض», and a card purchase at a terminal is what that is.
  ['card-net', (s) => has(s, 'اینترنتی', 'اینترنتى', 'اينترنتي') && has(s, 'خرید', 'خريد', 'پرداخت')],
  ['card-pos', (s) => has(s, 'خرید', 'خريد') && has(s, 'پایانه', 'پايانه', 'pos', 'کارتخوان')],
  ['card', (s) => has(s, 'خرید', 'خريد') && !has(s, 'قبض', 'شارژ')],
  ['bill', (s) => has(s, 'قبض', 'شارژ سیم', 'خرید شارژ', 'شارژ کارت')],
  // One Paya rule, split by direction afterwards: the wording is identical both ways.
  ['paya', (s) => has(s, 'واریز پایا', 'واریزپایا', 'پایا - واریز', 'وصول پایا', 'حواله', 'ach', 'پایا', 'ساتنا', 'پل')],
  ['transfer', (s) => has(s, 'انتقال', 'به حساب', 'به کارت', 'برداشت')],
];

/** The text the rules look at: type, description and the second description, lower-cased. */
export const subject = (rec) => `${rec.kind || ''} ${rec.desc || ''} ${rec.desc2 || ''}`.toLowerCase();

/** classify(record) -> { group, label, cls } */
export function classify(rec) {
  const s = subject(rec);
  for (const [rule, test] of RULES) {
    if (!test(s, rec)) continue;
    // «پایا» reads the same whichever way the money went, so the amounts decide.
    const group = rule === 'paya' ? (rec.deposit > 0 ? 'paya-in' : 'paya-out') : rule;
    const g = GROUPS[group];
    return { group, label: g.label, cls: g.cls };
  }
  return { group: 'other', label: '', cls: '' };
}

/**
 * The compact «شرح عملیات» cell: description / short type / second description.
 * Parts that repeat each other are dropped — the banks duplicate constantly, and the column
 * is the narrowest thing on the page.
 */
export function describeCompact(rec, { label } = classify(rec)) {
  const trim = (v) => String(v ?? '').replace(/^[\s\-–—·:|]+/, '').replace(/[\s\-–—·:|]+$/, '').replace(/\s+/g, ' ').trim();
  const parts = [];
  for (const raw of [trim(rec.desc), label, trim(rec.desc2)]) {
    if (!raw) continue;
    if (parts.some((p) => p === raw || p.includes(raw) || raw.includes(p))) continue;
    parts.push(raw);
  }
  return parts.join(' / ');
}

/** How often each group appears — used to show the legend for the groups actually present. */
export function groupCounts(records) {
  const counts = new Map();
  for (const r of records) {
    const g = classify(r).group;
    if (g === 'other') continue;
    counts.set(g, (counts.get(g) || 0) + 1);
  }
  return counts;
}

/**
 * Per group: how many lines and how much money moved, split by direction.
 * A group is almost always one-directional (POS income in, fees out), so the legend shows one
 * figure; when a group really does move money both ways, both are shown rather than netted,
 * because a net of zero would hide the traffic.
 */
export function groupTotals(records) {
  const out = new Map();
  for (const r of records) {
    const g = classify(r).group;
    if (g === 'other') continue;
    const t = out.get(g) || { count: 0, in: 0, out: 0 };
    t.count++;
    t.in += r.deposit || 0;
    t.out += r.withdraw || 0;
    out.set(g, t);
  }
  return out;
}
