// The binary .xls path: the OLE2 container and the BIFF8 records inside it.
// A minimal workbook is written here and read back, so the sector chain, the directory, the
// shared-string table (including a string split across a CONTINUE record) and the cell records
// are all exercised without shipping a binary fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openCfb, workbookStream, CfbError } from '../src/js/bank/cfb.js';
import { readBiff, readSST, rkValue } from '../src/js/bank/biff.js';
import { readWorkbook, SheetError } from '../src/js/bank/sheet-read.js';

const SECTOR = 512;
const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;
const FATSECT = 0xfffffffd;

// ---- a tiny BIFF8 writer, just enough to produce a readable workbook ----

const rec = (type, body) => {
  const out = new Uint8Array(4 + body.length);
  new DataView(out.buffer).setUint16(0, type, true);
  new DataView(out.buffer).setUint16(2, body.length, true);
  out.set(body, 4);
  return out;
};
const bytes = (...n) => Uint8Array.from(n);
const u16b = (n) => bytes(n & 255, (n >> 8) & 255);
const u32b = (n) => bytes(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
const cat = (...parts) => {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
/** BIFF8 unicode string, uncompressed (every bank name needs the high byte anyway). */
const uniChars = (s) => {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    out[i * 2] = s.charCodeAt(i) & 255;
    out[i * 2 + 1] = s.charCodeAt(i) >> 8;
  }
  return out;
};
const shortStr = (s) => cat(bytes(s.length, 1), uniChars(s));
const sstStr = (s) => cat(u16b(s.length), bytes(1), uniChars(s));
const f64 = (v) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v, true);
  return b;
};

function buildWorkbook(sheetName, strings, cells) {
  const bofGlobal = rec(0x0809, cat(u16b(0x0600), u16b(5), u16b(0), u16b(0), u32b(0), u32b(0)));
  const bofSheet = rec(0x0809, cat(u16b(0x0600), u16b(0x10), u16b(0), u16b(0), u32b(0), u32b(0)));
  const sst = rec(0x00fc, cat(u32b(strings.length), u32b(strings.length), ...strings.map(sstStr)));
  const eof = rec(0x000a, new Uint8Array(0));
  const body = cat(bofSheet, ...cells, eof);

  // BOUNDSHEET carries the absolute offset of the sheet's BOF, so it is written twice:
  // once to learn its own size, then again with the real position.
  const make = (pos) => rec(0x0085, cat(u32b(pos), bytes(0, 0), shortStr(sheetName)));
  const head = (bs) => cat(bofGlobal, bs, sst, eof);
  const probe = head(make(0));
  return cat(head(make(probe.length)), body);
}

/** Anything under the 4096-byte cutoff lives in the mini stream, so real workbooks are padded past it. */
const pad = (stream) => (stream.length >= 4096 ? stream : cat(stream, rec(0x00ff, new Uint8Array(4096 - stream.length))));

function buildCfb(stream) {
  const sectors = Math.ceil(stream.length / SECTOR);
  const total = 2 + sectors; // sector 0 = FAT, sector 1 = directory
  const file = new Uint8Array((1 + total) * SECTOR);
  const dv = new DataView(file.buffer);
  file.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  dv.setUint16(30, 9, true);
  dv.setUint16(32, 6, true);
  dv.setUint32(44, 1, true); // one FAT sector
  dv.setUint32(48, 1, true); // directory at sector 1
  dv.setUint32(56, 4096, true); // mini-stream cutoff
  dv.setUint32(60, ENDOFCHAIN, true);
  dv.setUint32(64, 0, true);
  dv.setUint32(68, ENDOFCHAIN, true);
  dv.setUint32(72, 0, true);
  for (let i = 0; i < 109; i++) dv.setUint32(76 + i * 4, i === 0 ? 0 : FREESECT, true);

  const sectorAt = (n) => (n + 1) * SECTOR;
  // FAT
  for (let i = 0; i < SECTOR / 4; i++) dv.setUint32(sectorAt(0) + i * 4, FREESECT, true);
  dv.setUint32(sectorAt(0) + 0, FATSECT, true);
  dv.setUint32(sectorAt(0) + 4, ENDOFCHAIN, true);
  for (let i = 0; i < sectors; i++) {
    dv.setUint32(sectorAt(0) + (2 + i) * 4, i === sectors - 1 ? ENDOFCHAIN : 2 + i + 1, true);
  }
  // directory: Root Entry, then Workbook
  const entry = (at, name, type, start, size) => {
    for (let i = 0; i < name.length; i++) dv.setUint16(at + i * 2, name.charCodeAt(i), true);
    dv.setUint16(at + 64, name.length * 2 + 2, true);
    file[at + 66] = type;
    dv.setUint32(at + 116, start, true);
    dv.setUint32(at + 120, size, true);
  };
  entry(sectorAt(1), 'Root Entry', 5, ENDOFCHAIN, 0);
  entry(sectorAt(1) + 128, 'Workbook', 2, 2, stream.length);
  file.set(stream, sectorAt(2));
  return file;
}

const CELLS = [
  // LABELSST row 0: three headers from the shared-string table
  rec(0x00fd, cat(u16b(0), u16b(0), u16b(0), u32b(0))),
  rec(0x00fd, cat(u16b(0), u16b(1), u16b(0), u32b(1))),
  rec(0x00fd, cat(u16b(0), u16b(2), u16b(0), u32b(2))),
  // row 1: a date string, an RK integer and a NUMBER float
  rec(0x00fd, cat(u16b(1), u16b(0), u16b(0), u32b(3))),
  rec(0x027e, cat(u16b(1), u16b(1), u16b(0), u32b((5000 << 2) | 2))),
  rec(0x0203, cat(u16b(1), u16b(2), u16b(0), f64(52404177))),
];

test('a BIFF8 workbook round-trips through the OLE2 container', () => {
  const stream = pad(buildWorkbook('گردش', ['تاریخ', 'برداشت', 'مانده', '1405/05/11'], CELLS));
  const file = buildCfb(stream);

  const cfb = openCfb(file);
  assert.ok(cfb.streams.has('Workbook'));
  assert.equal(workbookStream(cfb).length >= stream.length, true);

  const sheets = readBiff(file);
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].name, 'گردش');
  assert.deepEqual(sheets[0].rows[0], ['تاریخ', 'برداشت', 'مانده']);
  assert.deepEqual(sheets[0].rows[1], ['1405/05/11', 5000, 52404177]);
});

test('readWorkbook routes a binary .xls through the BIFF reader', () => {
  const file = buildCfb(pad(buildWorkbook('Sheet1', ['تاریخ', 'واریز', 'مانده', '1405/05/11'], CELLS)));
  const wb = readWorkbook(file, 'bankStatements.xls');
  assert.equal(wb.format, 'xls');
  assert.deepEqual(wb.sheets[0].rows[1], ['1405/05/11', 5000, 52404177]);
});

test('a compound file that is not a workbook fails with a Persian message', () => {
  const file = buildCfb(pad(Uint8Array.from({ length: 600 }, () => 0))); // no BOF
  assert.throws(
    () => readWorkbook(file, 'thing.xls'),
    (e) => e instanceof SheetError && e.code === 'bad-xls' && /xlsx/.test(e.message),
  );
  assert.throws(() => openCfb(Uint8Array.from([1, 2, 3])), CfbError);
});

test('RK packs four different number encodings', () => {
  assert.equal(rkValue((1234 << 2) | 2), 1234);
  assert.equal(rkValue((-5000 << 2) | 2), -5000);
  assert.equal(rkValue(((1234 << 2) | 3) >>> 0), 12.34); // integer, /100
  // Float form: the top 32 bits of the double for 1.5 are 0x3FF80000.
  assert.equal(rkValue(0x3ff80000), 1.5);
  assert.equal(rkValue(0x3ff80001), 0.015);
});

test('a shared string split across a CONTINUE keeps its characters and its encoding', () => {
  // "کارمزد" written across two blocks; the second block restarts with its own flags byte.
  const head = cat(u32b(1), u32b(1), u16b(6), bytes(1), uniChars('کار'));
  const tail = cat(bytes(1), uniChars('مزد'));
  assert.deepEqual(readSST([head, tail]), ['کارمزد']);

  // A compressed (single-byte) continuation of an uncompressed start.
  const h2 = cat(u32b(1), u32b(1), u16b(5), bytes(1), uniChars('ab'));
  const t2 = cat(bytes(0), Uint8Array.from([99, 100, 101])); // "cde"
  assert.deepEqual(readSST([h2, t2]), ['abcde']);
});

test('rich-text runs and phonetic blocks are skipped, not read as text', () => {
  const rich = cat(u32b(2), u32b(2), u16b(2), bytes(1 | 8), u16b(1), uniChars('ab'), new Uint8Array(4), u16b(2), bytes(1), uniChars('cd'));
  assert.deepEqual(readSST([rich]), ['ab', 'cd']);
});

/** The same workbook, but stored in the mini stream (streams under 4096 bytes live there). */
function buildCfbMini(stream) {
  const MINI = 64;
  const miniCount = Math.ceil(stream.length / MINI);
  const miniBytes = miniCount * MINI;
  const miniSectors = Math.ceil(miniBytes / SECTOR);
  const total = 3 + miniSectors; // 0 FAT, 1 directory, 2 miniFAT, then the mini stream
  const file = new Uint8Array((1 + total) * SECTOR);
  const dv = new DataView(file.buffer);
  const sectorAt = (n) => (n + 1) * SECTOR;
  file.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  dv.setUint16(30, 9, true);
  dv.setUint16(32, 6, true);
  dv.setUint32(44, 1, true);
  dv.setUint32(48, 1, true);
  dv.setUint32(56, 4096, true);
  dv.setUint32(60, 2, true); // miniFAT at sector 2
  dv.setUint32(64, 1, true);
  dv.setUint32(68, ENDOFCHAIN, true);
  dv.setUint32(72, 0, true);
  for (let i = 0; i < 109; i++) dv.setUint32(76 + i * 4, i === 0 ? 0 : FREESECT, true);

  for (let i = 0; i < SECTOR / 4; i++) dv.setUint32(sectorAt(0) + i * 4, FREESECT, true);
  dv.setUint32(sectorAt(0) + 0, FATSECT, true);
  dv.setUint32(sectorAt(0) + 4, ENDOFCHAIN, true); // directory
  dv.setUint32(sectorAt(0) + 8, ENDOFCHAIN, true); // miniFAT
  for (let i = 0; i < miniSectors; i++) {
    dv.setUint32(sectorAt(0) + (3 + i) * 4, i === miniSectors - 1 ? ENDOFCHAIN : 3 + i + 1, true);
  }
  // miniFAT: one chain covering the whole mini stream
  for (let i = 0; i < SECTOR / 4; i++) dv.setUint32(sectorAt(2) + i * 4, FREESECT, true);
  for (let i = 0; i < miniCount; i++) {
    dv.setUint32(sectorAt(2) + i * 4, i === miniCount - 1 ? ENDOFCHAIN : i + 1, true);
  }
  const entry = (at, name, type, start, size) => {
    for (let i = 0; i < name.length; i++) dv.setUint16(at + i * 2, name.charCodeAt(i), true);
    dv.setUint16(at + 64, name.length * 2 + 2, true);
    file[at + 66] = type;
    dv.setUint32(at + 116, start, true);
    dv.setUint32(at + 120, size, true);
  };
  entry(sectorAt(1), 'Root Entry', 5, 3, miniBytes); // the mini stream itself
  entry(sectorAt(1) + 128, 'Workbook', 2, 0, stream.length); // mini sector 0
  file.set(stream, sectorAt(3));
  return file;
}

test('a workbook small enough to live in the mini stream is read too', () => {
  const stream = buildWorkbook('کوچک', ['تاریخ', 'واریز', 'مانده', '1405/05/11'], CELLS);
  assert.ok(stream.length < 4096, 'this fixture must be below the mini-stream cutoff');
  const wb = readWorkbook(buildCfbMini(stream), 'small.xls');
  assert.equal(wb.format, 'xls');
  assert.equal(wb.sheets[0].name, 'کوچک');
  assert.deepEqual(wb.sheets[0].rows[1], ['1405/05/11', 5000, 52404177]);
});
