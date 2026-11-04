// OLE2 / Compound File Binary — the container a binary .xls lives in. Pure: bytes in, streams out.
// Only what a workbook needs: the FAT and mini-FAT sector chains and the directory, so the
// "Workbook" stream can be pulled out. Nothing is written and no storage tree is exposed.

const SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;
const MAX_SECTORS = 1 << 21; // ~1M sectors: a guard against a corrupt chain looping forever

export class CfbError extends Error {}

const u16 = (dv, at) => dv.getUint16(at, true);
const u32 = (dv, at) => dv.getUint32(at, true);

/** Walk a sector chain from `start`, returning the sector numbers in order. */
function chain(fat, start) {
  const out = [];
  let s = start;
  const seen = new Set();
  while (s !== ENDOFCHAIN && s !== FREESECT && s < fat.length) {
    if (seen.has(s) || out.length > MAX_SECTORS) throw new CfbError('sector chain loops');
    seen.add(s);
    out.push(s);
    s = fat[s];
  }
  return out;
}

/**
 * openCfb(bytes) -> { streams: Map<name, Uint8Array> }
 * Stream names are the directory entry names (e.g. "Workbook", "Book").
 */
export function openCfb(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length < 512 || !SIG.every((b, i) => u8[i] === b)) throw new CfbError('not a compound file');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  const sectorSize = 1 << u16(dv, 30);
  const miniSize = 1 << u16(dv, 32);
  const miniCutoff = u32(dv, 56);
  if (sectorSize < 128 || sectorSize > 1 << 20) throw new CfbError('bad sector size');

  const sectorAt = (n) => {
    const start = (n + 1) * sectorSize;
    if (start + sectorSize > u8.length) throw new CfbError('sector past end of file');
    return u8.subarray(start, start + sectorSize);
  };

  // ---- DIFAT: the list of sectors that hold the FAT ----
  const fatCount = u32(dv, 44);
  const difat = [];
  for (let i = 0; i < 109 && difat.length < fatCount; i++) {
    const s = u32(dv, 76 + i * 4);
    if (s === FREESECT || s === ENDOFCHAIN) break;
    difat.push(s);
  }
  let next = u32(dv, 68);
  const perSector = sectorSize / 4 - 1;
  let guard = 0;
  while (next !== ENDOFCHAIN && next !== FREESECT && difat.length < fatCount && guard++ < MAX_SECTORS) {
    const sec = sectorAt(next);
    const sv = new DataView(sec.buffer, sec.byteOffset, sec.byteLength);
    for (let i = 0; i < perSector && difat.length < fatCount; i++) {
      const s = u32(sv, i * 4);
      if (s === FREESECT || s === ENDOFCHAIN) break;
      difat.push(s);
    }
    next = u32(sv, perSector * 4);
  }

  // ---- FAT ----
  const fat = new Uint32Array(difat.length * (sectorSize / 4));
  difat.forEach((sec, i) => {
    const s = sectorAt(sec);
    const sv = new DataView(s.buffer, s.byteOffset, s.byteLength);
    for (let j = 0; j < sectorSize / 4; j++) fat[i * (sectorSize / 4) + j] = u32(sv, j * 4);
  });

  const readChain = (start, size) => {
    const parts = chain(fat, start).map(sectorAt);
    const out = new Uint8Array(parts.length * sectorSize);
    parts.forEach((p, i) => out.set(p, i * sectorSize));
    return size >= 0 ? out.subarray(0, Math.min(size, out.length)) : out;
  };

  // ---- directory ----
  const dir = readChain(u32(dv, 48), -1);
  const entries = [];
  for (let at = 0; at + 128 <= dir.length; at += 128) {
    const nameLen = u16(new DataView(dir.buffer, dir.byteOffset + at, 128), 64);
    const type = dir[at + 66];
    if (type !== 1 && type !== 2 && type !== 5) continue;
    let name = '';
    for (let i = 0; i + 1 < Math.max(0, nameLen - 2); i += 2) {
      name += String.fromCharCode(dir[at + i] | (dir[at + i + 1] << 8));
    }
    const edv = new DataView(dir.buffer, dir.byteOffset + at, 128);
    entries.push({ name, type, start: u32(edv, 116), size: u32(edv, 120) });
  }

  // ---- mini stream (small streams live inside the root entry's stream) ----
  const root = entries.find((e) => e.type === 5);
  let miniData = null;
  let miniFat = null;
  const miniOf = (start, size) => {
    if (!miniData) {
      miniData = readChain(root.start, root.size);
      const mf = readChain(u32(dv, 60), u32(dv, 64) * sectorSize);
      const mv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
      miniFat = new Uint32Array(Math.floor(mf.length / 4));
      for (let i = 0; i < miniFat.length; i++) miniFat[i] = u32(mv, i * 4);
    }
    const parts = chain(miniFat, start);
    const out = new Uint8Array(parts.length * miniSize);
    parts.forEach((p, i) => out.set(miniData.subarray(p * miniSize, (p + 1) * miniSize), i * miniSize));
    return out.subarray(0, Math.min(size, out.length));
  };

  const streams = new Map();
  for (const e of entries) {
    if (e.type !== 2 || !e.size) continue;
    streams.set(e.name, e.size < miniCutoff && root ? miniOf(e.start, e.size) : readChain(e.start, e.size));
  }
  return { streams, sectorSize };
}

/** The workbook stream, whatever Excel version named it. */
export function workbookStream(cfb) {
  for (const name of ['Workbook', 'Book', 'WORKBOOK', 'BOOK']) {
    if (cfb.streams.has(name)) return cfb.streams.get(name);
  }
  return null;
}
