// Central keyboard shortcut registry. Modules (commands.js) define shortcuts; the palette displays them.
// Matching uses e.key AND e.code so shortcuts keep working while a Persian keyboard layout is active.
const defs = [];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

/** defineShortcut({ id, keys:'Mod+Shift+Z', title, scope:'global'|'preview', allowInInput, run }) */
export function defineShortcut(def) {
  defs.push({ scope: 'global', allowInInput: true, ...def, parsed: parse(def.keys) });
}

function parse(keys) {
  const parts = keys.split('+');
  const key = parts.pop().toLowerCase();
  return { key, mod: parts.includes('Mod'), shift: parts.includes('Shift'), alt: parts.includes('Alt') };
}

function matches(p, e) {
  if (p.mod !== (e.metaKey || e.ctrlKey)) return false;
  if (p.shift !== e.shiftKey || p.alt !== e.altKey) return false;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (k === p.key) return true;
  return /^[a-z]$/.test(p.key) && e.code === 'Key' + p.key.toUpperCase();
}

/** Human display: ⌘⇧Z on macOS, Ctrl+Shift+Z elsewhere. */
export function formatKeys(keys) {
  const p = parse(keys);
  const key = p.key.length === 1 ? p.key.toUpperCase() : p.key[0].toUpperCase() + p.key.slice(1);
  if (isMac) return (p.mod ? '⌘' : '') + (p.alt ? '⌥' : '') + (p.shift ? '⇧' : '') + key;
  return [p.mod && 'Ctrl', p.alt && 'Alt', p.shift && 'Shift', key].filter(Boolean).join('+');
}

export const shortcutFor = (id) => {
  const d = defs.find((x) => x.id === id);
  return d ? formatKeys(d.keys) : '';
};

export const listShortcuts = () => defs.map((d) => ({ id: d.id, title: d.title, keys: formatKeys(d.keys) }));

export function initShortcuts({ preview }) {
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    for (const d of defs) {
      if (!matches(d.parsed, e)) continue;
      if (d.scope === 'preview' && !(preview.contains(e.target) || e.target === preview)) continue;
      e.preventDefault();
      d.run(e);
      return;
    }
  });
}
