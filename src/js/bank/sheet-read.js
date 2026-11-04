// Spreadsheet reader. Pure: takes bytes, returns sheets of plain cell values. No DOM, no state.
//
// Three formats, because that is what banks actually hand out:
//   .xlsx          OOXML — a zip of XML, opened with fflate (already bundled for the Word/PNG exports)
//   .xls / .xml    SpreadsheetML 2003 — plain XML. Bank Keshavarzi ships this *named* .xls.
//   .csv / .txt    delimiter sniffed from the header line
// A real BIFF8 .xls (the old binary one) is detected and refused with a Persian message rather
// than half-parsed; `isLegacyXls()` lets the UI say so clearly.
import { unzipSync, strFromU8 } from 'fflate';
import { readBiff } from './biff.js';

export class SheetError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ---- tiny XML helpers (bank sheets are machine-generated, so a scanner beats a parser here) ----

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeXML(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g) => {
    if (g[0] === '#') {
      const code = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[g] ?? m;
  });
}

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`).exec(tag) || new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`).exec(tag);
  return m ? decodeXML(m[1]) : null;
};

/** All `<name …>…</name>` bodies (and self-closing tags, as ''), with the open tag kept. */
function* elements(xml, name) {
  const re = new RegExp(`<${name}(\\s[^>]*?)?(/)?>`, 'g');
  let m;
  while ((m = re.exec(xml))) {
    const open = m[0];
    if (m[2]) {
      yield { open, body: '' };
      continue;
    }
    const close = `</${name}>`;
    const end = xml.indexOf(close, re.lastIndex);
    if (end < 0) {
      yield { open, body: xml.slice(re.lastIndex) };
      return;
    }
    yield { open, body: xml.slice(re.lastIndex, end) };
    re.lastIndex = end + close.length;
  }
}

/** Concatenated text of every <t> in a fragment (shared strings can be split into runs). */
const textOf = (frag) => [...elements(frag, 't')].map((e) => decodeXML(e.body)).join('');

/** "BC12" -> 54 (zero-based column index). */
export function colFromRef(ref) {
  let n = 0;
  for (const ch of String(ref)) {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) n = n * 26 + (c - 64);
    else if (c >= 97 && c <= 122) n = n * 26 + (c - 96);
    else break;
  }
  return n - 1;
}

// ---- format sniffing ----

const startsWith = (bytes, sig) => sig.every((b, i) => bytes[i] === b);

export const isZip = (bytes) => startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
/** OLE2 compound file: the real binary .xls (and .doc, .ppt). */
export const isLegacyXls = (bytes) => startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const decodeText = (bytes) => {
  const s = strFromU8(bytes);
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s; // strip BOM
};

// ---- xlsx ----

function readXlsx(bytes) {
  let files;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new SheetError('bad-zip', 'فایل اکسل سالم نیست یا ناقص دانلود شده است.');
  }
  const text = (name) => (files[name] ? strFromU8(files[name]) : null);

  const shared = [];
  const sst = text('xl/sharedStrings.xml');
  if (sst) for (const si of elements(sst, 'si')) shared.push(textOf(si.body));

  // sheet name -> part path, through the workbook rels
  const rels = text('xl/_rels/workbook.xml.rels') || '';
  const target = new Map();
  for (const r of elements(rels, 'Relationship')) {
    const id = attr(r.open, 'Id');
    let t = attr(r.open, 'Target');
    if (!id || !t) continue;
    t = t.replace(/^\/?xl\//, '').replace(/^\.\//, '');
    target.set(id, 'xl/' + t);
  }

  const wb = text('xl/workbook.xml') || '';
  const sheets = [];
  for (const s of elements(wb, 'sheet')) {
    const name = attr(s.open, 'name') || `Sheet${sheets.length + 1}`;
    const rid = attr(s.open, 'r:id') || attr(s.open, 'id');
    const path = (rid && target.get(rid)) || `xl/worksheets/sheet${sheets.length + 1}.xml`;
    sheets.push({ name, path });
  }
  if (!sheets.length) sheets.push({ name: 'Sheet1', path: 'xl/worksheets/sheet1.xml' });

  return sheets.map(({ name, path }) => ({ name, rows: readSheetXml(text(path) || '', shared) }));
}

function readSheetXml(xml, shared) {
  const rows = [];
  for (const row of elements(xml, 'row')) {
    const rIndex = Number(attr(row.open, 'r'));
    const cells = [];
    let auto = 0;
    for (const c of elements(row.body, 'c')) {
      const ref = attr(c.open, 'r');
      const at = ref ? colFromRef(ref) : auto;
      auto = at + 1;
      const type = attr(c.open, 't');
      let value = null;
      if (type === 'inlineStr') value = textOf(c.body);
      else {
        const v = [...elements(c.body, 'v')][0];
        const raw = v ? decodeXML(v.body) : null;
        if (raw === null || raw === '') value = null;
        else if (type === 's') value = shared[Number(raw)] ?? '';
        else if (type === 'str') value = raw;
        else if (type === 'b') value = raw === '1';
        else if (type === 'e') value = null; // #N/A etc.
        else {
          const n = Number(raw);
          value = Number.isFinite(n) ? n : raw;
        }
      }
      cells[at] = value;
    }
    const at = Number.isFinite(rIndex) && rIndex > 0 ? rIndex - 1 : rows.length;
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null;
    rows[at] = cells;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

// ---- SpreadsheetML 2003 ----

function readSpreadsheetML(xml) {
  const sheets = [];
  for (const ws of elements(xml, 'Worksheet')) {
    const name = attr(ws.open, 'ss:Name') || attr(ws.open, 'Name') || `Sheet${sheets.length + 1}`;
    const table = [...elements(ws.body, 'Table')][0];
    const rows = [];
    if (table) {
      let rowAt = 0;
      for (const r of elements(table.body, 'Row')) {
        const rIdx = Number(attr(r.open, 'ss:Index'));
        if (Number.isFinite(rIdx) && rIdx > 0) rowAt = rIdx - 1;
        const cells = [];
        let colAt = 0;
        for (const c of elements(r.body, 'Cell')) {
          const cIdx = Number(attr(c.open, 'ss:Index'));
          if (Number.isFinite(cIdx) && cIdx > 0) colAt = cIdx - 1;
          const data = [...elements(c.body, 'Data')][0];
          let value = null;
          if (data) {
            const t = attr(data.open, 'ss:Type') || attr(data.open, 'Type');
            const raw = decodeXML(data.body.replace(/<[^>]*>/g, ''));
            if (t === 'Number') {
              const n = Number(raw);
              value = Number.isFinite(n) ? n : raw;
            } else if (t === 'Boolean') value = raw === '1';
            else value = raw;
          }
          cells[colAt] = value;
          colAt += Math.max(1, Number(attr(c.open, 'ss:MergeAcross')) + 1 || 1);
        }
        for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null;
        rows[rowAt] = cells;
        rowAt++;
      }
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    sheets.push({ name, rows });
  }
  return sheets;
}

// ---- CSV ----

export function parseCSV(text, delimiter) {
  const d = delimiter || sniffDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === d) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* handled by \n */ }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.map((r) => r.map((c) => (c === '' ? null : c)));
}

function sniffDelimiter(text) {
  const line = text.split('\n', 1)[0] || '';
  const counts = [',', ';', '\t', '|'].map((d) => [d, line.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

// ---- entry point ----

/**
 * readWorkbook(bytes, filename) -> { sheets: [{ name, rows }], format }
 * `rows` is an array of arrays; cells are string | number | boolean | null.
 */
export function readWorkbook(bytes, filename = '') {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!u8.length) throw new SheetError('empty', 'فایل خالی است.');

  if (isLegacyXls(u8)) {
    try {
      const sheets = readBiff(u8);
      if (sheets.length) return { sheets, format: 'xls' };
    } catch (e) {
      throw new SheetError('bad-xls', 'این فایل اکسل قدیمی خوانده نشد؛ در اکسل بازش کنید و با قالب xlsx ذخیره کنید.');
    }
    throw new SheetError('bad-xls', 'در این فایل اکسل قدیمی برگه‌ای پیدا نشد.');
  }
  if (isZip(u8)) return { sheets: readXlsx(u8), format: 'xlsx' };

  const text = decodeText(u8);
  if (/<\s*Workbook[\s>]/i.test(text) || /<\s*ss:Workbook[\s>]/i.test(text)) {
    const sheets = readSpreadsheetML(text);
    if (sheets.length) return { sheets, format: 'spreadsheetml' };
  }
  if (/<\?xml|<html|<table/i.test(text.slice(0, 200)) && !/[,;\t]/.test(text.split('\n', 1)[0] || '')) {
    throw new SheetError('unknown-xml', 'قالب این فایل شناخته نشد. اگر اکسل است، با قالب xlsx ذخیره‌اش کنید.');
  }
  const rows = parseCSV(text);
  if (!rows.length) throw new SheetError('empty', 'فایل خالی است.');
  return { sheets: [{ name: nameOf(filename) || 'CSV', rows }], format: 'csv' };
}

const nameOf = (f) => String(f || '').split(/[\\/]/).pop().replace(/\.[a-z0-9]+$/i, '');
