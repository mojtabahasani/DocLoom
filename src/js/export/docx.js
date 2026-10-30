// Word (.docx) writer: pure OOXML builders (no DOM, no state) + zipping with fflate.
// Input is a small block model (see docx-dom.js for DOM -> model):
//   block: {k:'h',level,runs} | {k:'p',runs,align?,quote?,ltr?,keepNext?} | {k:'list',ordered,items:[{runs,level}]}
//        | {k:'table',header:[runs...],rows:[[runs...]]} | {k:'code',lines} | {k:'img',id,w,h,align?} | {k:'hr'}
//        | {k:'letterMeta',lines:[{label,value}],qr?:{id,w,h}} | {k:'sign',imgs:[{id,w,h}],name,role}
//   run: {t,b,i,s,code,href,color,br}      images: { [id]: {bytes:Uint8Array, ext:'png'|'jpeg', w, h} }
import { zipSync, strToU8 } from 'fflate';

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const FONT = 'Vazirmatn';
const FONT_FALLBACK = 'Tahoma';
const MONO = 'Consolas';
const MAX_IMG_EMU = 5600000; // ~15.5 cm text width on A4
const PX_EMU = 9525;
const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

export const xmlEscape = (s) =>
  String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const hex6 = (c, d = '1C5263') => (/^#?[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).replace('#', '').toUpperCase() : d);

/** Pixel size of a PNG or JPEG, or null. */
export function imageSize(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { ext: 'png', w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const m = bytes[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { ext: 'jpeg', h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8] };
      i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    }
    return { ext: 'jpeg', w: 0, h: 0 };
  }
  return null;
}

// ---- runs -----------------------------------------------------------------------------------------------------------

function runPr(r, base = {}) {
  const rtl = RTL_CHAR.test(r.t || '');
  const mono = r.code || base.code;
  const b = r.b || base.b;
  const i = r.i || base.i;
  const sz = base.sz;
  const color = r.color || base.color;
  return (
    '<w:rPr>' +
    (r.href ? '<w:rStyle w:val="Hyperlink"/>' : '') +
    (mono ? `<w:rFonts w:ascii="${MONO}" w:hAnsi="${MONO}" w:cs="${MONO}" w:eastAsia="${MONO}"/>` : `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT_FALLBACK}"/>`) +
    (b ? '<w:b/><w:bCs/>' : '') +
    (i ? '<w:i/><w:iCs/>' : '') +
    (r.s ? '<w:strike/>' : '') +
    (color && !r.href ? `<w:color w:val="${hex6(color)}"/>` : '') +
    (sz ? `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` : '') +
    (mono && !base.codeBlock ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF1F0"/>' : '') +
    (rtl && !mono ? '<w:rtl/>' : '') +
    '</w:rPr>'
  );
}

/** Runs -> XML. `ctx.link(href)` returns a relationship id. */
function runsXML(runs, ctx, base) {
  let out = '';
  for (const r of runs || []) {
    if (r.br) {
      out += '<w:r><w:br/></w:r>';
      continue;
    }
    if (r.t === '' || r.t == null) continue;
    const inner = `<w:r>${runPr(r, base)}<w:t xml:space="preserve">${xmlEscape(r.t)}</w:t></w:r>`;
    out += r.href ? `<w:hyperlink r:id="${ctx.link(r.href)}" w:history="1">${inner}</w:hyperlink>` : inner;
  }
  return out;
}

// ---- drawings -------------------------------------------------------------------------------------------------------

function drawing(ctx, img) {
  const meta = ctx.images[img.id];
  if (!meta) return '';
  const rid = ctx.media(img.id);
  let w = Math.round((img.w || meta.w || 100) * PX_EMU);
  let h = Math.round((img.h || meta.h || 100) * PX_EMU);
  if (w > MAX_IMG_EMU) {
    h = Math.round((h * MAX_IMG_EMU) / w);
    w = MAX_IMG_EMU;
  }
  const n = ctx.nextDocPr();
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${w}" cy="${h}"/>` +
    `<wp:docPr id="${n}" name="Picture ${n}" descr="${xmlEscape(img.alt || '')}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="${NS_PIC}"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
  );
}

// ---- paragraphs / blocks --------------------------------------------------------------------------------------------

const para = ({ style, bidi = true, jc, shade, border, keep, spacing, numId, ilvl, ind, keepLines, pageBreak } = {}, inner = '') =>
  '<w:p><w:pPr>' +
  (style ? `<w:pStyle w:val="${style}"/>` : '') +
  (keep ? '<w:keepNext/>' : '') +
  (keepLines ? '<w:keepLines/>' : '') +
  (pageBreak ? '<w:pageBreakBefore/>' : '') +
  (numId ? `<w:numPr><w:ilvl w:val="${ilvl || 0}"/><w:numId w:val="${numId}"/></w:numPr>` : '') +
  (border ? `<w:pBdr><w:right w:val="single" w:sz="24" w:space="8" w:color="${border}"/></w:pBdr>` : '') +
  (shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : '') +
  (bidi ? '<w:bidi/>' : '<w:bidi w:val="0"/>') +
  (spacing ? `<w:spacing w:before="${spacing[0]}" w:after="${spacing[1]}"${spacing[2] ? ` w:line="${spacing[2]}" w:lineRule="auto"` : ''}/>` : '') +
  (ind ? `<w:ind ${ind}/>` : '') +
  (jc ? `<w:jc w:val="${jc}"/>` : '') +
  `</w:pPr>${inner}</w:p>`;

function tableXML(b, ctx) {
  const cols = Math.max(b.header?.length || 0, ...b.rows.map((r) => r.length), 1);
  const colW = Math.floor(9026 / cols);
  const cell = (runs, head) =>
    `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/>${head ? `<w:shd w:val="clear" w:color="auto" w:fill="${ctx.accent}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr>` +
    para({ spacing: [40, 40, 276] }, runsXML(runs, ctx, head ? { b: true, color: 'FFFFFF' } : {})) +
    '</w:tc>';
  const row = (cells, head) => {
    const padded = Array.from({ length: cols }, (_, i) => cells[i] || []);
    return `<w:tr><w:trPr><w:cantSplit/>${head ? '<w:tblHeader/>' : ''}</w:trPr>${padded.map((c) => cell(c, head)).join('')}</w:tr>`;
  };
  const edge = (n) => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="C9D1CD"/>`;
  return (
    '<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="5000" w:type="pct"/>' +
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(edge).join('')}</w:tblBorders>` +
    '<w:tblLayout w:type="autofit"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>' +
    `<w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${colW}"/>`).join('')}</w:tblGrid>` +
    (b.header?.length ? row(b.header, true) : '') +
    b.rows.map((r) => row(r, false)).join('') +
    '</w:tbl>' +
    para({ spacing: [0, 120] }, '') // a table must not be the last thing before another table or the end
  );
}

/** Borderless two-cell table: [free cell | content] so the content sits on the left in an RTL page. */
function sideTable(inner, ctx, free = '') {
  const noB = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((n) => `<w:${n} w:val="nil"/>`).join('');
  return (
    `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${noB}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>` +
    '<w:tblGrid><w:gridCol w:w="5400"/><w:gridCol w:w="3626"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>' +
    `<w:tc><w:tcPr><w:tcW w:w="5400" w:type="dxa"/></w:tcPr>${free || para({}, '')}</w:tc>` +
    `<w:tc><w:tcPr><w:tcW w:w="3626" w:type="dxa"/></w:tcPr>${inner}</w:tc></w:tr></w:tbl>` +
    para({ spacing: [0, 80] }, '')
  );
}

function blockXML(b, ctx) {
  switch (b.k) {
    case 'h': {
      const lvl = Math.min(3, Math.max(1, b.level || 1));
      return para({ style: 'Heading' + lvl, keep: true }, runsXML(b.runs, ctx, {}));
    }
    case 'p': {
      const q = b.quote;
      return para(
        {
          bidi: !b.ltr, jc: b.align, keep: b.keepNext,
          ...(q ? { shade: hex6(q.fill, 'F1F5F4'), border: hex6(q.color), ind: 'w:left="140" w:right="140"', spacing: [60, 60, 336] } : {}),
          ...(b.style ? { style: b.style } : {}),
        },
        runsXML(b.runs, ctx, b.base || {}),
      );
    }
    case 'list': {
      let numId = 1;
      if (b.ordered) numId = ctx.orderedList();
      return b.items
        .map((it) => para({ numId, ilvl: Math.min(8, it.level || 0), spacing: [20, 20, 336] }, runsXML(it.runs, ctx, {})))
        .join('');
    }
    case 'table':
      return tableXML(b, ctx);
    case 'code':
      return (
        b.lines
          .map((ln, i) =>
            para(
              { style: 'CodeBlock', bidi: false, shade: 'F3F5F4', keepLines: true, spacing: [i === 0 ? 80 : 0, i === b.lines.length - 1 ? 120 : 0, 240], jc: 'left' },
              runsXML([{ t: ln.replace(/\t/g, '    '), code: true }], ctx, { code: true, codeBlock: true, sz: 19 }),
            ),
          )
          .join('') || ''
      );
    case 'img':
      return para({ jc: b.align || 'center', spacing: [80, 120] }, drawing(ctx, b));
    case 'hr':
      return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="C9D1CD"/></w:pBdr><w:bidi/><w:spacing w:before="120" w:after="120"/></w:pPr></w:p>';
    case 'letterMeta': {
      const lines = b.lines
        .map((l) => para({ spacing: [20, 20] }, runsXML([{ t: l.label + ' ', b: true, color: ctx.accent }, { t: l.value }], ctx, {})))
        .join('');
      const free = b.qr ? para({ jc: 'right', bidi: true }, drawing(ctx, b.qr)) : '';
      return sideTable(lines, ctx, free);
    }
    case 'sign': {
      const pics = b.imgs.length ? para({ jc: 'center', spacing: [60, 0] }, b.imgs.map((i) => drawing(ctx, i)).join('')) : '';
      const name = b.name ? para({ jc: 'center', spacing: [20, 0] }, runsXML([{ t: b.name, b: true }], ctx, {})) : '';
      const role = b.role ? para({ jc: 'center', spacing: [0, 0] }, runsXML([{ t: b.role, color: '64736D' }], ctx, { sz: 20 })) : '';
      return sideTable(pics + name + role, ctx);
    }
    default:
      return '';
  }
}

// ---- parts ----------------------------------------------------------------------------------------------------------

const W_ROOT = `xmlns:w="${NS_W}" xmlns:r="${NS_R}" xmlns:wp="${NS_WP}" xmlns:a="${NS_A}" xmlns:pic="${NS_PIC}"`;

function stylesXML(accent) {
  const rf = `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT_FALLBACK}"/>`;
  const head = (n, sz, before) =>
    `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${before}" w:after="100"/><w:outlineLvl w:val="${n - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:bCs/><w:color w:val="${accent}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
  return (
    XML_HEAD +
    `<w:styles xmlns:w="${NS_W}"><w:docDefaults><w:rPrDefault><w:rPr>${rf}<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="fa-IR" w:eastAsia="fa-IR" w:bidi="fa-IR"/></w:rPr></w:rPrDefault>` +
    '<w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    head(1, 40, 360) + head(2, 32, 280) + head(3, 27, 220) +
    `<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:bidi w:val="0"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="${MONO}" w:hAnsi="${MONO}" w:cs="${MONO}"/><w:sz w:val="19"/></w:rPr></w:style>` +
    '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>' +
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    '</w:styles>'
  );
}

function fontTableXML() {
  const font = (n, alt, charset, fam) => `<w:font w:name="${n}">${alt ? `<w:altName w:val="${alt}"/>` : ''}<w:charset w:val="${charset}"/><w:family w:val="${fam}"/></w:font>`;
  return XML_HEAD + `<w:fonts xmlns:w="${NS_W}">${font(FONT, FONT_FALLBACK, '00', 'swiss')}${font(FONT_FALLBACK, '', '00', 'swiss')}${font(MONO, 'Courier New', '00', 'modern')}</w:fonts>`;
}

function numberingXML(orderedCount) {
  const levels = (bullet) =>
    Array.from({ length: 9 }, (_, i) => {
      const left = 540 + i * 360;
      return (
        `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${bullet ? 'bullet' : i % 3 === 0 ? 'decimal' : i % 3 === 1 ? 'lowerLetter' : 'lowerRoman'}"/>` +
        `<w:lvlText w:val="${bullet ? (i % 2 ? '–' : '•') : `%${i + 1}.`}"/><w:lvlJc w:val="left"/>` +
        `<w:pPr><w:ind w:left="${left}" w:hanging="360"/></w:pPr>${bullet ? '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:hint="default"/></w:rPr>' : ''}</w:lvl>`
      );
    }).join('');
  let nums = '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
  for (let k = 0; k < orderedCount; k++) {
    nums += `<w:num w:numId="${k + 2}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`;
  }
  return (
    XML_HEAD +
    `<w:numbering xmlns:w="${NS_W}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${levels(true)}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels(false)}</w:abstractNum>${nums}</w:numbering>`
  );
}

const relsXML = (items) =>
  XML_HEAD + `<Relationships xmlns="${NS_PKG_REL}">${items.map((r) => `<Relationship Id="${r.id}" Type="${r.type.startsWith('http') ? r.type : REL + r.type}" Target="${xmlEscape(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`;

/** Header/footer content: optional image + text; the footer also carries a page number. */
function bandXML(tag, band, ctx, pageNumber) {
  const parts = [];
  if (band?.image) parts.push(drawing(ctx, band.image));
  if (band?.text) parts.push(runsXML([{ t: (band.image ? '  ' : '') + band.text, b: tag === 'hdr' }], ctx, { sz: 20, color: '64736D' }));
  let inner = parts.join('');
  if (pageNumber) {
    inner +=
      `<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${band?.text || band?.image ? '    ' : ''}</w:t></w:r>` +
      '<w:fldSimple w:instr=" PAGE "><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>';
  }
  const bdr = tag === 'hdr' ? '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="C9D1CD"/></w:pBdr>' : '<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="C9D1CD"/></w:pBdr>';
  const tagName = tag === 'hdr' ? 'hdr' : 'ftr';
  return `${XML_HEAD}<w:${tagName} ${W_ROOT}><w:p><w:pPr>${bdr}<w:bidi/></w:pPr>${inner}</w:p></w:${tagName}>`;
}

/**
 * model: { title, accent, blocks, header?, footer?, images }
 *   header/footer: { text?, image?: {id,w,h} }
 * Returns { 'path': string | Uint8Array } (every XML part is a string).
 */
export function buildDocxParts(model) {
  const images = model.images || {};
  const accent = hex6(model.accent);
  const mediaNames = new Map(); // image id -> 'media/imageN.ext'
  let docPr = 0;
  let ordered = 0;
  const makeCtx = (rels, extra = {}) => ({
    images,
    accent,
    nextDocPr: () => ++docPr,
    orderedList: () => ++ordered + 1,
    media(id) {
      if (!mediaNames.has(id)) mediaNames.set(id, `media/image${mediaNames.size + 1}.${images[id].ext === 'jpeg' ? 'jpeg' : 'png'}`);
      const name = mediaNames.get(id);
      let r = rels.find((x) => x.target === name);
      if (!r) rels.push((r = { id: 'rId' + (rels.length + 1), type: 'image', target: name }));
      return r.id;
    },
    link(href) {
      let r = rels.find((x) => x.external && x.target === href);
      if (!r) rels.push((r = { id: 'rId' + (rels.length + 1), type: 'hyperlink', target: href, external: true }));
      return r.id;
    },
    ...extra,
  });

  const docRels = [
    { id: 'rId1', type: 'styles', target: 'styles.xml' },
    { id: 'rId2', type: 'numbering', target: 'numbering.xml' },
    { id: 'rId3', type: 'fontTable', target: 'fontTable.xml' },
    { id: 'rId4', type: 'settings', target: 'settings.xml' },
  ];
  const hasHeader = !!(model.header && (model.header.text || model.header.image));
  const hasFooter = true; // page number
  if (hasHeader) docRels.push({ id: 'rId5', type: 'header', target: 'header1.xml' });
  if (hasFooter) docRels.push({ id: 'rId6', type: 'footer', target: 'footer1.xml' });
  const hRels = [];
  const fRels = [];

  const ctx = makeCtx(docRels);
  const body = (model.blocks || []).map((b) => blockXML(b, ctx)).join('') || para({}, '');
  const sect =
    '<w:sectPr>' +
    (hasHeader ? `<w:headerReference w:type="default" r:id="rId5"/>` : '') +
    (hasFooter ? `<w:footerReference w:type="default" r:id="rId6"/>` : '') +
    '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/><w:bidi/></w:sectPr>';

  const parts = {};
  parts['[Content_Types].xml'] = null; // filled last (needs the media extensions)
  parts['_rels/.rels'] =
    relsXML([
      { id: 'rId1', type: 'officeDocument', target: 'word/document.xml' },
      { id: 'rId2', type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', target: 'docProps/core.xml' },
      { id: 'rId3', type: 'extended-properties', target: 'docProps/app.xml' },
    ]);
  parts['docProps/core.xml'] =
    `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${xmlEscape(model.title || '')}</dc:title><dc:creator>MD2Html</dc:creator><dc:language>fa-IR</dc:language>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${model.created || '2026-01-01T00:00:00Z'}</dcterms:created></cp:coreProperties>`;
  parts['docProps/app.xml'] = `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>MD2Html Pro</Application></Properties>`;
  parts['word/document.xml'] = `${XML_HEAD}<w:document ${W_ROOT}><w:body>${body}${sect}</w:body></w:document>`;
  parts['word/styles.xml'] = stylesXML(accent);
  parts['word/fontTable.xml'] = fontTableXML();
  parts['word/settings.xml'] = `${XML_HEAD}<w:settings xmlns:w="${NS_W}"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:themeFontLang w:val="en-US" w:bidi="fa-IR"/><w:decimalSymbol w:val="."/><w:listSeparator w:val=","/></w:settings>`;
  parts['word/numbering.xml'] = numberingXML(ordered);
  if (hasHeader) parts['word/header1.xml'] = bandXML('hdr', model.header, makeCtx(hRels), false);
  parts['word/footer1.xml'] = bandXML('ftr', model.footer, makeCtx(fRels), true);
  // Header/footer ctx was created after the body, so its docPr ids continue the same counter (all unique).
  parts['word/_rels/document.xml.rels'] = relsXML(docRels);
  if (hRels.length) parts['word/_rels/header1.xml.rels'] = relsXML(hRels);
  if (fRels.length) parts['word/_rels/footer1.xml.rels'] = relsXML(fRels);
  const exts = new Set();
  for (const [id, name] of mediaNames) {
    parts['word/' + name] = images[id].bytes;
    exts.add(name.split('.').pop());
  }
  const def = (e, t) => `<Default Extension="${e}" ContentType="${t}"/>`;
  const ov = (p, t) => `<Override PartName="${p}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${t}+xml"/>`;
  parts['[Content_Types].xml'] =
    `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    def('rels', 'application/vnd.openxmlformats-package.relationships+xml') + def('xml', 'application/xml') +
    (exts.has('png') ? def('png', 'image/png') : '') + (exts.has('jpeg') ? def('jpeg', 'image/jpeg') : '') +
    ov('/word/document.xml', 'document.main') + ov('/word/styles.xml', 'styles') + ov('/word/numbering.xml', 'numbering') +
    ov('/word/fontTable.xml', 'fontTable') + ov('/word/settings.xml', 'settings') +
    (hasHeader ? ov('/word/header1.xml', 'header') : '') + ov('/word/footer1.xml', 'footer') +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
  // [Content_Types].xml must come first in the archive.
  const { '[Content_Types].xml': ct, ...rest } = parts;
  return { '[Content_Types].xml': ct, ...rest };
}

export function buildDocx(model) {
  const parts = buildDocxParts(model);
  const files = {};
  for (const [k, v] of Object.entries(parts)) files[k] = typeof v === 'string' ? strToU8(v) : v;
  return zipSync(files, { level: 6 });
}
