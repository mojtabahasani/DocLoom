// A scanner for machine-generated XML (xlsx sheets, SpreadsheetML, FastReport .fp3).
// Not a parser: these files are produced by code, never hand-written, so matching tags with a
// regex is both enough and far smaller than a DOM. Pure — no DOM, no state.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeXML(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g) => {
    if (g[0] === '#') {
      const code = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[g] ?? m;
  });
}

/** One attribute out of an open tag, decoded; null when absent. */
export function attrOf(tag, name) {
  const m =
    new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`).exec(tag) || new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`).exec(tag);
  return m ? decodeXML(m[1]) : null;
}

/** Same, as a number; NaN when absent or not numeric. */
export const numAttr = (tag, name) => Number(attrOf(tag, name) ?? NaN);

/** Every `<name …>body</name>` (self-closing tags yield an empty body), with the open tag kept. */
export function* elements(xml, name) {
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
