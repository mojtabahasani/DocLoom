// Command palette (⌘K / Ctrl+K): fuzzy search over commands, library documents (and brands later).
//   palette.register({ id, title, keywords, shortcut, group, run })
//   palette.addSource({ id, label, load: async () => [{ id, title, subtitle, run }] })
import { el, icon } from '../core/dom.js';
import { fuzzyFilter } from './fuzzy.js';
import { shortcutFor } from './shortcuts.js';
import { getPref, setPref } from '../library/prefs.js';

const commands = new Map();
const sources = [];
const MAX_RECENT = 6;
let openState = null;

export const palette = {
  register(cmd) {
    commands.set(cmd.id, { keywords: '', group: '', ...cmd });
  },
  unregister: (id) => commands.delete(id),
  /** Extra result sections: `load()` is called every time the palette opens. */
  addSource(src) {
    sources.push({ items: [], ...src });
  },
  get isOpen() {
    return !!openState;
  },
  open,
  close: () => openState?.close(),
  commands: () => [...commands.values()],
};

const recentIds = () => (getPref('recentCommands', []) || []).filter((id) => commands.has(id));
function remember(id) {
  setPref('recentCommands', [id, ...recentIds().filter((x) => x !== id)].slice(0, MAX_RECENT));
}

const cmdFields = (c) => [
  { text: c.title },
  { text: c.keywords, weight: 0.6 },
  { text: c.group, weight: 0.4 },
];

/** Build the visible sections for a query. Exported shape: [{label, items}] */
function compute(query) {
  const all = [...commands.values()].map((c) => ({ ...c, kind: 'command', shortcut: c.shortcut || shortcutFor(c.id) }));
  const out = [];
  if (!query.trim()) {
    const recent = recentIds().map((id) => all.find((c) => c.id === id)).filter(Boolean);
    if (recent.length) out.push({ label: 'اخیراً استفاده‌شده', items: recent });
    out.push({ label: 'فرمان‌ها', items: all.filter((c) => !recent.includes(c)) });
    for (const s of sources) if (s.items.length) out.push({ label: s.label, items: s.items.slice(0, 5) });
    return out;
  }
  const cmds = fuzzyFilter(all, query, cmdFields);
  if (cmds.length) out.push({ label: 'فرمان‌ها', items: cmds.slice(0, 14) });
  for (const s of sources) {
    const hits = fuzzyFilter(s.items, query, (i) => [{ text: i.title }, { text: i.keywords || '', weight: 0.6 }, { text: i.body || '', weight: 0.25 }]);
    if (hits.length) out.push({ label: s.label, items: hits.slice(0, 8) });
  }
  return out;
}

function open() {
  if (openState) return;
  const opener = document.activeElement;
  let flat = [];
  let active = 0;
  let seq = 0;

  const input = el('input', {
    type: 'text', class: 'palette-input', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'paletteList',
    'aria-autocomplete': 'list', 'aria-label': 'جست‌وجوی فرمان یا سند', placeholder: 'فرمان یا سند را جست‌وجو کنید…',
    autocomplete: 'off', spellcheck: 'false', dir: 'auto',
  });
  const list = el('ul', { id: 'paletteList', class: 'palette-list', role: 'listbox', 'aria-label': 'نتایج' });
  const empty = el('p', { class: 'palette-empty', hidden: true, text: 'نتیجه‌ای پیدا نشد.' });
  const box = el(
    'div',
    { class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'پالت فرمان' },
    el('div', { class: 'palette-top' }, icon('search'), input, el('kbd', { text: 'Esc' })),
    list,
    empty,
    el('div', { class: 'palette-foot' }, el('span', {}, el('kbd', { text: '↑↓' }), ' حرکت'), el('span', {}, el('kbd', { text: 'Enter' }), ' اجرا'), el('span', {}, el('kbd', { text: 'Esc' }), ' بستن')),
  );
  const back = el('div', { class: 'palette-back' }, box);

  function setActive(i, scroll = true) {
    active = Math.max(0, Math.min(flat.length - 1, i));
    list.querySelectorAll('[role=option]').forEach((n, idx) => {
      const on = idx === active;
      n.classList.toggle('active', on);
      n.setAttribute('aria-selected', String(on));
      if (on) {
        input.setAttribute('aria-activedescendant', n.id);
        if (scroll) n.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function render() {
    const sections = compute(input.value);
    flat = sections.flatMap((s) => s.items);
    list.replaceChildren();
    let idx = 0;
    for (const s of sections) {
      list.append(el('li', { class: 'pal-group', role: 'presentation', text: s.label }));
      for (const it of s.items) {
        const i = idx++;
        list.append(
          el(
            'li',
            {
              id: `pal-opt-${seq}-${i}`, class: 'pal-item', role: 'option', 'aria-selected': 'false',
              onmousemove: () => active !== i && setActive(i, false),
              onclick: () => run(it),
            },
            el('span', { class: 'pal-title' }, it.title, it.subtitle ? el('small', { text: it.subtitle }) : null),
            it.group ? el('span', { class: 'pal-tag', text: it.group }) : null,
            it.shortcut ? el('kbd', { class: 'pal-kbd', text: it.shortcut }) : null,
          ),
        );
      }
    }
    empty.hidden = flat.length > 0;
    seq++;
    if (flat.length) setActive(0);
  }

  function close() {
    if (!openState) return;
    openState = null;
    document.removeEventListener('keydown', onKey, true);
    back.remove();
    opener?.focus?.();
  }

  function run(it) {
    close();
    if (it.kind === 'command') remember(it.id);
    setTimeout(() => it.run?.(), 0);
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((active + 1) % Math.max(1, flat.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((active - 1 + flat.length) % Math.max(1, flat.length));
    } else if (e.key === 'Home' && e.target !== input) setActive(0);
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (flat[active]) run(flat[active]);
    } else if (e.key === 'Tab') {
      e.preventDefault(); // the input is the only tab stop: focus is trapped
      input.focus();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  input.addEventListener('input', render);
  back.addEventListener('mousedown', (e) => {
    if (e.target === back) close();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.append(back);
  openState = { close };
  render();
  input.focus();
  // Dynamic sources (library documents): load, then refresh the list without disturbing the typed query.
  Promise.all(
    sources.map(async (s) => {
      try {
        s.items = (await s.load()) || [];
      } catch {
        s.items = [];
      }
    }),
  ).then(() => openState && render());
}

