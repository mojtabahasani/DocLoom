// FastReport .fp3 "prepared report" reader — the format Saba (a Delphi app) writes.
// Pure: XML text in, bands and placed cells out. No DOM, no state.
//
// An .fp3 has two halves:
//   <previewpages>  what was actually printed: band instances `<b3 t="109">` holding memo
//                   instances `<m17 u="text"/>`, in document order, one group per page.
//   <sourcepages>   the template: the band and memo objects, with Left/Top/Width and alignment.
// The short names are indexes into the template, numbered globally in document order across all
// bands: the first TfrxMemoView anywhere is m1, the second m2, and so on. That is the whole trick.
import { decodeXML, attrOf, numAttr, elements } from '../core/xml.js';

export class Fp3Error extends Error {}

// Tfrx objects that are placed content rather than bands.
const CONTENT = new Set(['TfrxMemoView', 'TfrxShapeView', 'TfrxLineView', 'TfrxPictureView', 'TfrxCheckBoxView', 'TfrxSubreport']);
const NOT_A_BAND = new Set(['TfrxReportPage', 'TfrxReport', 'TfrxDataPage', 'TfrxDialogPage']);

export const isFp3 = (text) => /<preparedreport[\s>]/i.test(String(text).slice(0, 4000));

/**
 * readFp3(xml) -> { bands, memos, pages }
 *   bands: [{ i, tag, name, kind }]            kind: 'data' | 'header' | 'footer' | 'title' | 'summary' | 'other'
 *   memos: [{ i, name, left, top, width, height, align, band }]
 *   pages: [[ { band, top, cells: [{ memo, text }] } ]]
 */
export function readFp3(xml) {
  const text = String(xml);
  if (!isFp3(text)) throw new Fp3Error('این فایل گزارش فست‌ریپورت (fp3) نیست.');

  // ---- template ----
  const srcAt = text.indexOf('<sourcepages>');
  if (srcAt < 0) throw new Fp3Error('بخش الگوی گزارش در فایل پیدا نشد.');
  const src = text.slice(srcAt);
  const bands = [];
  const memos = [];
  let current = null;
  for (const m of src.matchAll(/<(Tfrx[A-Za-z]+)((?:[^>"]|"[^"]*")*?)(\/?)>/g)) {
    const [, tag, attrs] = m;
    if (tag === 'TfrxMemoView') {
      memos.push({
        i: memos.length + 1,
        name: attrOf(attrs, 'Name') || '',
        left: numAttr(attrs, 'Left') || 0,
        top: numAttr(attrs, 'Top') || 0,
        width: numAttr(attrs, 'Width') || 0,
        height: numAttr(attrs, 'Height') || 0,
        align: attrOf(attrs, 'HAlign') || '',
        band: current ? current.i : 0,
      });
    } else if (!CONTENT.has(tag) && !NOT_A_BAND.has(tag)) {
      current = { i: bands.length + 1, tag, name: attrOf(attrs, 'Name') || '', kind: bandKind(tag) };
      bands.push(current);
    }
  }
  if (!memos.length) throw new Fp3Error('در این گزارش هیچ متنی پیدا نشد.');

  // ---- what was printed ----
  const pv = text.slice(text.indexOf('<previewpages>'), text.indexOf('</previewpages>'));
  const pages = [];
  for (const page of elements(pv, 'page\\d+')) {
    const out = [];
    for (const m of page.body.matchAll(/<b(\d+)((?:[^>"]|"[^"]*")*?)(?:\/>|>([\s\S]*?)<\/b\1>)/g)) {
      const bandIndex = Number(m[1]);
      const cells = [];
      for (const c of (m[3] || '').matchAll(/<m(\d+)\s+u="([^"]*)"\s*\/>/g)) {
        cells.push({ memo: Number(c[1]), text: decodeXML(c[2]) });
      }
      out.push({ band: bandIndex, top: numAttr(m[2], 't') || 0, cells });
    }
    pages.push(out);
  }
  if (!pages.length) throw new Fp3Error('این گزارش هیچ صفحه‌ای ندارد.');
  return { bands, memos, pages };
}

function bandKind(tag) {
  const t = tag.toLowerCase();
  if (t.includes('masterdata') || t.includes('detaildata') || t.includes('subdetail')) return 'data';
  if (t.includes('columnheader') || t.includes('pageheader') || t.includes('header')) return 'header';
  if (t.includes('reportsummary') || t.includes('summary')) return 'summary';
  if (t.includes('footer')) return 'footer';
  if (t.includes('reporttitle') || t.includes('title')) return 'title';
  if (t.includes('groupheader')) return 'group';
  return 'other';
}

/** Every band instance in the report, pages flattened, in print order. */
export const allInstances = (doc) => doc.pages.flat();

/** How many times each band was printed. */
export function bandCounts(doc) {
  const counts = new Map();
  for (const inst of allInstances(doc)) counts.set(inst.band, (counts.get(inst.band) || 0) + 1);
  return counts;
}

/**
 * The repeating band that carries the rows. A MasterData band wins outright; otherwise the band
 * printed most often, as long as it repeated at all (a one-off band is not a table).
 */
export function dataBand(doc) {
  const counts = bandCounts(doc);
  const scored = [...counts.entries()]
    .map(([i, n]) => ({ i, n, band: doc.bands[i - 1] }))
    .filter((b) => b.band)
    .sort((a, b) => (b.band.kind === 'data') - (a.band.kind === 'data') || b.n - a.n);
  const best = scored[0];
  return best && best.n > 1 ? best.i : null;
}

/** Template memos of a band, ordered right-to-left — the reading order of a Persian table. */
export function bandColumns(doc, bandIndex) {
  return doc.memos.filter((m) => m.band === bandIndex).sort((a, b) => b.left - a.left || a.top - b.top);
}

/** Text of a band instance, keyed by memo index. */
export const cellMap = (inst) => new Map(inst.cells.map((c) => [c.memo, c.text]));
