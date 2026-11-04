// BIFF8 — the record stream inside a binary .xls. Pure: bytes in, sheets of cell values out.
//
// Only the records a statement needs: the sheet index (BOUNDSHEET), the shared-string table
// (SST, which may be split across CONTINUE records mid-string) and the cell records
// LABELSST / LABEL / RK / MULRK / NUMBER / BOOLERR / FORMULA. Styles, formulas-as-formulas,
// charts and everything else are skipped on purpose.
import { openCfb, workbookStream, CfbError } from './cfb.js';

export { CfbError };

const REC = {
  BOF: 0x0809,
  EOF: 0x000a,
  BOUNDSHEET: 0x0085,
  SST: 0x00fc,
  CONTINUE: 0x003c,
  LABELSST: 0x00fd,
  LABEL: 0x0204,
  RK: 0x027e,
  MULRK: 0x00bd,
  NUMBER: 0x0203,
  BOOLERR: 0x0205,
  FORMULA: 0x0006,
  STRING: 0x0207,
  BLANK: 0x0201,
  MULBLANK: 0x00be,
};

/** Every record in the stream, with the offset it started at. */
function scan(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = [];
  let at = 0;
  while (at + 4 <= buf.length) {
    const type = dv.getUint16(at, true);
    const len = dv.getUint16(at + 2, true);
    if (at + 4 + len > buf.length) break;
    out.push({ type, at, data: buf.subarray(at + 4, at + 4 + len) });
    at += 4 + len;
  }
  return out;
}

const dvOf = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** BIFF8 "short" string: 1-byte length, 1-byte flags, then chars. */
function shortString(b, at) {
  const cch = b[at];
  const high = b[at + 1] & 1;
  let s = '';
  let p = at + 2;
  for (let i = 0; i < cch; i++) {
    if (high) {
      s += String.fromCharCode(b[p] | (b[p + 1] << 8));
      p += 2;
    } else s += String.fromCharCode(b[p++]);
  }
  return s;
}

/** BIFF8 string with a 2-byte count, used by LABEL and STRING. */
function longString(b, at) {
  const dv = dvOf(b);
  const cch = dv.getUint16(at, true);
  const flags = b[at + 2];
  const high = flags & 1;
  let p = at + 3;
  if (flags & 8) p += 2; // rich-text run count
  if (flags & 4) p += 4; // phonetic block length
  let s = '';
  for (let i = 0; i < cch && p < b.length; i++) {
    if (high) {
      s += String.fromCharCode(b[p] | (b[p + 1] << 8));
      p += 2;
    } else s += String.fromCharCode(b[p++]);
  }
  return s;
}

/**
 * The shared-string table. Strings can run past the end of a record; each CONTINUE then starts
 * with a fresh flags byte saying how the *rest* of that string is encoded. Getting this wrong is
 * what turns a statement into mojibake, so the block boundary is tracked explicitly.
 */
export function readSST(blocks) {
  let bi = 0;
  let off = 0;
  const atEnd = () => bi >= blocks.length;
  const ensure = () => {
    while (!atEnd() && off >= blocks[bi].length) {
      bi++;
      off = 0;
    }
  };
  const byte = () => {
    ensure();
    return atEnd() ? 0 : blocks[bi][off++];
  };
  const u16 = () => byte() | (byte() << 8);
  const u32 = () => (u16() | (u16() << 16)) >>> 0;
  const skip = (n) => {
    let left = n;
    while (left > 0 && !atEnd()) {
      ensure();
      if (atEnd()) break;
      const take = Math.min(left, blocks[bi].length - off);
      off += take;
      left -= take;
    }
  };

  u32(); // total references, unused
  const unique = u32();
  const out = [];
  for (let i = 0; i < unique && !atEnd(); i++) {
    const cch = u16();
    const flags = byte();
    let high = flags & 1;
    const runs = flags & 8 ? u16() : 0;
    const extLen = flags & 4 ? u32() : 0;

    let s = '';
    let left = cch;
    while (left > 0) {
      if (atEnd()) break;
      if (off >= blocks[bi].length) {
        bi++;
        if (atEnd()) break;
        off = 0;
        high = blocks[bi][off++] & 1; // the continuation says how the remainder is encoded
        continue;
      }
      const blk = blocks[bi];
      const avail = blk.length - off;
      const take = high ? Math.min(left, avail >> 1) : Math.min(left, avail);
      if (take <= 0) {
        off = blk.length; // not even one whole character fits: move on
        continue;
      }
      for (let k = 0; k < take; k++) {
        if (high) {
          s += String.fromCharCode(blk[off] | (blk[off + 1] << 8));
          off += 2;
        } else s += String.fromCharCode(blk[off++]);
      }
      left -= take;
    }
    skip(runs * 4 + extLen);
    out.push(s);
  }
  return out;
}

/** RK: a float squeezed into 32 bits — either a 30-bit int or the top half of a double, /100 or not. */
export function rkValue(rk) {
  let v;
  if (rk & 2) v = (rk | 0) >> 2;
  else {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setUint32(0, 0, true);
    dv.setUint32(4, (rk & 0xfffffffc) >>> 0, true);
    v = dv.getFloat64(0, true);
  }
  return rk & 1 ? v / 100 : v;
}

function readSheet(recs, startIndex, sst) {
  const rows = [];
  const put = (r, c, v) => {
    if (!rows[r]) rows[r] = [];
    rows[r][c] = v;
  };
  let pendingFormula = null; // FORMULA with a string result: the text arrives in the next STRING

  for (let i = startIndex; i < recs.length; i++) {
    const { type, data } = recs[i];
    if (type === REC.EOF) break;
    const dv = dvOf(data);
    switch (type) {
      case REC.LABELSST: {
        const idx = dv.getUint32(6, true);
        put(dv.getUint16(0, true), dv.getUint16(2, true), sst[idx] ?? '');
        break;
      }
      case REC.LABEL:
        put(dv.getUint16(0, true), dv.getUint16(2, true), longString(data, 6));
        break;
      case REC.RK:
        put(dv.getUint16(0, true), dv.getUint16(2, true), rkValue(dv.getUint32(6, true)));
        break;
      case REC.MULRK: {
        const row = dv.getUint16(0, true);
        const first = dv.getUint16(2, true);
        const n = Math.floor((data.length - 6) / 6);
        for (let k = 0; k < n; k++) put(row, first + k, rkValue(dv.getUint32(4 + k * 6 + 2, true)));
        break;
      }
      case REC.NUMBER:
        put(dv.getUint16(0, true), dv.getUint16(2, true), dv.getFloat64(6, true));
        break;
      case REC.BOOLERR:
        if (data[7] === 0) put(dv.getUint16(0, true), dv.getUint16(2, true), data[6] !== 0);
        break;
      case REC.FORMULA: {
        const row = dv.getUint16(0, true);
        const col = dv.getUint16(2, true);
        // A result of ...FFFF is a marker, not a number: 0 means "a STRING record follows".
        if (data[12] === 0xff && data[13] === 0xff) {
          if (data[6] === 0) pendingFormula = { row, col };
          else if (data[6] === 1) put(row, col, data[8] !== 0);
        } else put(row, col, dv.getFloat64(6, true));
        break;
      }
      case REC.STRING:
        if (pendingFormula) {
          put(pendingFormula.row, pendingFormula.col, longString(data, 0));
          pendingFormula = null;
        }
        break;
      default:
        break;
    }
  }
  for (let r = 0; r < rows.length; r++) {
    if (!rows[r]) rows[r] = [];
    else for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === undefined) rows[r][c] = null;
  }
  return rows;
}

/** readBiff(bytes) -> [{ name, rows }] for a binary .xls. Throws CfbError when it is not one. */
export function readBiff(bytes) {
  const wb = workbookStream(openCfb(bytes));
  if (!wb) throw new CfbError('no workbook stream in this compound file');
  const recs = scan(wb);
  if (!recs.length || recs[0].type !== REC.BOF) throw new CfbError('not a BIFF workbook');

  // BOUNDSHEET gives each sheet's name and the offset of its BOF in the stream.
  const sheets = [];
  for (const r of recs) {
    if (r.type === REC.BOUNDSHEET) {
      const dv = dvOf(r.data);
      sheets.push({ name: shortString(r.data, 6), pos: dv.getUint32(0, true), visible: r.data[4] === 0 });
    }
    if (r.type === REC.EOF) break; // end of the global substream
  }

  // SST plus every CONTINUE that follows it.
  let sst = [];
  const sstAt = recs.findIndex((r) => r.type === REC.SST);
  if (sstAt >= 0) {
    const blocks = [recs[sstAt].data];
    for (let i = sstAt + 1; i < recs.length && recs[i].type === REC.CONTINUE; i++) blocks.push(recs[i].data);
    sst = readSST(blocks);
  }

  const byOffset = new Map(recs.map((r, i) => [r.at, i]));
  const out = sheets.map((s, i) => {
    const start = byOffset.get(s.pos);
    return { name: s.name || `Sheet${i + 1}`, rows: start === undefined ? [] : readSheet(recs, start + 1, sst) };
  });
  return out.length ? out : [{ name: 'Sheet1', rows: readSheet(recs, 1, sst) }];
}
