// Group drawers for the two side panels.
//
// A panel's groups are declared in the markup and nowhere else:
//   <div class="drawer" data-drawer="design" data-shape="rail">
//     <section class="dgroup" data-group="look" data-name="ظاهر و چاپ" data-short="ظاهر"
//              data-icon="palette" data-emoji="🎨" data-hue="162"> … </section>
// Every control the user would call a tool carries data-tool="نامش". The group header lists those
// names, so you learn what is behind a group without opening it, and the list cannot drift away
// from the markup because it IS the markup.
//
// One shape at the top level: both side panels wear the VERTICAL RAIL on their outer edge, so the
// two columns read as one piece of furniture and the whole map of each is always on screen.
// A ROW OF FILE TABS is the second level: a group that holds two or three separate jobs nests its
// own drawer with data-shape="tabs" and data-head="off" instead of stacking accordions. Both
// carry the same two signals — a colour edge and an icon (or emoji).
// Below 1101px there is no room for a rail, so every drawer falls back to the tab row.
import { $, $$, el, icon } from '../core/dom.js';
import { store } from '../core/store.js';
import { getPref, setPref } from '../library/prefs.js';

const panels = new Map(); // name -> {root, shape, groups:[{key,section,tab,...}], active}

const shortOf = (s) => s.dataset.short || s.dataset.name;
const toolsIn = (s) => $$('[data-tool]', s).map((n) => n.dataset.tool);

/** The glyph for a group: an SVG icon, or the emoji when the user prefers emoji. */
function glyphFor(g) {
  const span = el('span', { class: 'g-glyph', 'aria-hidden': 'true' });
  if (store.get('groupGlyph') === 'emoji' && g.emoji) span.textContent = g.emoji;
  else span.append(icon(g.iconName, 'ic'));
  return span;
}

function repaintGlyphs() {
  for (const p of panels.values()) {
    for (const g of p.groups) {
      g.tab.querySelector('.g-glyph')?.replaceWith(glyphFor(g));
      g.tab.classList.toggle('is-emoji', store.get('groupGlyph') === 'emoji' && !!g.emoji);
    }
  }
}

function paint(panel) {
  const p = panels.get(panel);
  for (const g of p.groups) {
    const on = g.key === p.active;
    g.tab.setAttribute('aria-selected', String(on));
    g.tab.tabIndex = on ? 0 : -1;
    g.tab.classList.toggle('on', on);
    g.section.hidden = !on;
  }
  const g = p.groups.find((x) => x.key === p.active);
  if (!g || !p.head) return;
  p.head.style.setProperty('--h', g.hue);
  p.headName.textContent = g.name;
  // What is inside, before you go looking for it.
  const names = toolsIn(g.section);
  p.headList.textContent = names.join(' · ');
  p.headList.hidden = !names.length;
}

/** Open a group. `focus` moves keyboard focus onto its tab (used by the palette). */
export function openGroup(panel, group, { focus = false } = {}) {
  const p = panels.get(panel);
  if (!p || !p.groups.some((g) => g.key === group)) return false;
  if (p.active !== group) {
    p.active = group;
    paint(panel);
    const saved = { ...(getPref('panelGroups') || {}), [panel]: group };
    setPref('panelGroups', saved);
  }
  if (focus) p.groups.find((g) => g.key === group).tab.focus();
  return true;
}

/**
 * Bring a control into view wherever it lives: open its group, scroll to it and mark it for a
 * moment. This is how a palette command or a mode switch makes its own panel section appear,
 * instead of leaving the user to find it.
 */
export function reveal(selector) {
  const node = typeof selector === 'string' ? $(selector) : selector;
  if (!node) return false;
  // Walk every group the control sits in, innermost first, so a tool two levels down opens both
  // the rail group and the tab inside it.
  for (let section = node.closest?.('.dgroup'); section; section = section.parentElement?.closest('.dgroup')) {
    const drawer = section.closest('[data-drawer]');
    if (drawer) openGroup(drawer.dataset.drawer, section.dataset.group);
  }
  const acc = node.closest?.('details');
  if (acc) acc.open = true;
  const target = acc || node.closest('.field, .dgroup > *') || node;
  requestAnimationFrame(() => {
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    target.classList.add('just-revealed');
    setTimeout(() => target.classList.remove('just-revealed'), 1400);
  });
  return true;
}

/** Roving-tabindex arrow keys. A rail is vertical (up = previous); a tab row is RTL, so left = next. */
function onKey(panel, e) {
  const p = panels.get(panel);
  const vertical = p.shape === 'rail';
  const back = vertical ? 'ArrowUp' : 'ArrowRight';
  const fwd = vertical ? 'ArrowDown' : 'ArrowLeft';
  let i = p.groups.findIndex((g) => g.key === p.active);
  if (e.key === back) i -= 1;
  else if (e.key === fwd) i += 1;
  else if (e.key === 'Home') i = 0;
  else if (e.key === 'End') i = p.groups.length - 1;
  else return;
  e.preventDefault();
  i = (i + p.groups.length) % p.groups.length;
  openGroup(panel, p.groups[i].key, { focus: true });
}

function buildPanel(root) {
  const panel = root.dataset.drawer;
  const shape = root.dataset.shape === 'tabs' ? 'tabs' : 'rail';
  const nav = el('div', {
    class: 'dnav',
    role: 'tablist',
    'aria-orientation': shape === 'rail' ? 'vertical' : 'horizontal',
    'aria-label': root.dataset.navLabel || 'گروه‌ها',
    onkeydown: (e) => onKey(panel, e),
  });

  // Direct children only: a group may nest a drawer of its own, and those sections belong to it.
  // A group whose every tool has been hidden — embed mode switches whole features off — is left
  // out rather than offered as a tab with nothing behind it.
  const sections = $$(':scope > .dgroup', root).filter((s) => {
    const tools = $$('[data-tool]', s);
    return !tools.length || tools.some((n) => !n.hidden && !n.closest('[hidden],[data-embed-hidden]'));
  });
  for (const gone of $$(':scope > .dgroup', root)) if (!sections.includes(gone)) gone.remove();
  const groups = sections.map((section, i) => {
    const key = section.dataset.group;
    const name = section.dataset.name;
    const g = { key, name, section, hue: section.dataset.hue || '162', iconName: section.dataset.icon, emoji: section.dataset.emoji };
    // No aria-label here on purpose: the accessible name comes from the content, so it can never
    // disagree with the text on screen (WCAG 2.5.3). The tab shows the group's short name; the
    // full name is the tooltip, and what is inside is listed under the panel header instead of
    // being reduced to a number on the tab.
    g.tab = el(
      'button',
      {
        type: 'button',
        class: 'dtab',
        role: 'tab',
        id: `g-${panel}-${key}`,
        'aria-controls': section.id,
        'aria-selected': 'false',
        tabindex: '-1',
        style: `--h:${g.hue}`,
        title: name,
        onclick: () => openGroup(panel, key),
      },
      glyphFor(g),
      el('span', { class: 'g-name', text: shortOf(section) }),
    );
    section.setAttribute('role', 'tabpanel');
    section.setAttribute('aria-labelledby', g.tab.id);
    section.setAttribute('tabindex', '0');
    section.hidden = i > 0;
    nav.append(g.tab);
    return g;
  });
  if (!groups.length) return;

  // A nested drawer sits under its parent group's header already; a second one would only repeat it.
  const headName = el('strong', { class: 'dhead-name' });
  const headList = el('p', { class: 'dhead-list' });
  const head =
    root.dataset.head === 'off'
      ? null
      : el('header', { class: 'dhead' }, el('span', { class: 'dhead-dot', 'aria-hidden': 'true' }), el('div', {}, headName, headList));
  const body = el('div', { class: 'dbody' }, head, ...groups.map((g) => g.section));
  root.replaceChildren(nav, body);

  const saved = (getPref('panelGroups') || {})[panel];
  panels.set(panel, { root, shape, groups, head, headName, headList, active: groups.some((g) => g.key === saved) ? saved : groups[0].key });
  paint(panel);
}

/**
 * A dropdown inside a panel would be cut off: the panel clips its own scroll. So while one is
 * open it is taken out of the panel's box and pinned to its button instead. Watching the `hidden`
 * attribute means the menus' own modules keep opening and closing them exactly as they did.
 */
function unclipMenus() {
  for (const wrap of $$('[data-drawer] .menu-wrap')) {
    const menu = $('.menu', wrap);
    const btn = $('button', wrap);
    if (!menu || !btn) continue;
    const place = () => {
      if (menu.hidden) return;
      const r = btn.getBoundingClientRect();
      const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
      // One inset only. Pinning both sides would stretch the menu across the window, because the
      // stylesheet already sets inset-inline-start:0 for the in-flow case.
      menu.style.position = 'fixed';
      menu.style.insetInlineEnd = 'auto';
      menu.style.insetInlineStart = Math.round(rtl ? window.innerWidth - r.right : r.left) + 'px';
      menu.style.top = Math.round(r.bottom + 6) + 'px';
      menu.style.maxHeight = Math.round(window.innerHeight - r.bottom - 20) + 'px';
    };
    new MutationObserver(place).observe(menu, { attributes: true, attributeFilter: ['hidden'] });
    addEventListener('resize', place);
    addEventListener('scroll', place, true);
  }
}

export function initDrawers() {
  $$('[data-drawer]').forEach(buildPanel);
  unclipMenus();
  store.on('groupGlyph', repaintGlyphs);
  // Context brings its own group forward: turning the letter on, or a watermark or QR, should put
  // the fields that go with it on screen rather than leave them behind a closed group.
  store.on('mode', (m) => m === 'letter' && reveal('#letterMode'));
  store.on('watermark', (w) => w?.preset && w.preset !== 'none' && reveal('#wmPreset'));
  store.on('qr', (q) => q?.enabled && reveal('#qrOn'));
}

/** Which group a panel is showing — used by the tests and the palette. */
export const activeGroup = (panel) => panels.get(panel)?.active || null;

/** Refresh visible drawer tab labels and active header after a language switch. */
export function refreshDrawers() {
  for (const [panel, p] of panels.entries()) {
    const nav = $('.dnav', p.root);
    if (nav && p.root.dataset.navLabel) nav.setAttribute('aria-label', p.root.dataset.navLabel);
    for (const g of p.groups) {
      g.name = g.section.dataset.name;
      g.tab.title = g.name;
      const lbl = $('.g-name', g.tab);
      if (lbl) lbl.textContent = shortOf(g.section);
    }
    paint(panel);
  }
}
