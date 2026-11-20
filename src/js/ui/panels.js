// Two-way bindings between side-panel controls and the store, plus theme/zoom/margin controls.
import { store } from '../core/store.js';
import { $, $$, el } from '../core/dom.js';
import { DOC_THEMES } from '../export/theme.js';
import { faPercent } from '../content/persian.js';
import { renderFromSource, refreshFurniture, undo, redo, plainText } from '../editor/preview.js';
import { copyPlain } from '../export/files.js';
import { pasteClipboardImage, pickImage, uploadPendingImage } from '../editor/images.js';

// furniture: re-render the header/title/footer blocks after a user edit
const FIELDS = [
  { id: 'title', key: 'title', furniture: true, trim: true },
  { id: 'subtitle', key: 'subtitle', furniture: true, trim: true },
  { id: 'masthead', key: 'masthead', furniture: true },
  { id: 'footerText', key: 'footerText', furniture: true },
  { id: 'showTitle', key: 'showTitle', furniture: true },
  { id: 'showHeader', key: 'showHeader', furniture: true },
  { id: 'showFooter', key: 'showFooter', furniture: true },
  { id: 'repeatHeader', key: 'repeatHeader', furniture: true },
  { id: 'repeatFooter', key: 'repeatFooter', furniture: true },
  { id: 'headerAlign', key: 'headerAlign', furniture: true },
  { id: 'footerAlign', key: 'footerAlign', furniture: true },
  { id: 'headerWidth', key: 'headerWidth', furniture: true, num: [40, 900] },
  { id: 'headerHeight', key: 'headerHeight', furniture: true, num: [20, 240] },
  { id: 'footerWidth', key: 'footerWidth', furniture: true, num: [40, 900] },
  { id: 'footerHeight', key: 'footerHeight', furniture: true, num: [20, 240] },
  { id: 'uploadEndpoint', key: 'uploadEndpoint', trim: true },
  { id: 'newTab', key: 'openLinksInNewTab' },
  { id: 'embedFont', key: 'embedFontInExport' },
  { id: 'autosave', key: 'autosave' },
  { id: 'margin', key: 'margin', num: [12, 28], event: 'input' },
];

function bind(f) {
  const node = $('#' + f.id);
  const isCheck = node.type === 'checkbox';
  const write = (v) => {
    if (isCheck) node.checked = !!v;
    else if (String(f.trim ? node.value.trim() : node.value) !== String(v)) node.value = v;
  };
  write(store.get(f.key));
  store.on(f.key, write);
  node.addEventListener(f.event || (isCheck || node.tagName === 'SELECT' ? 'change' : 'input'), () => {
    let v = isCheck ? node.checked : node.value;
    if (f.trim) v = v.trim();
    if (f.num) {
      v = Number(v);
      if (!Number.isFinite(v) || v < f.num[0] || v > f.num[1]) return; // ignore out-of-range typing
    }
    store.set(f.key, v);
    if (f.key === 'margin') store.set('dirty', true);
    if (f.furniture) refreshFurniture();
  });
}

export function setFont(px) {
  store.set('font', Math.max(11, Math.min(23, px)));
  store.set('dirty', true);
}

export function initPanels() {
  FIELDS.forEach(bind);

  // Markdown source textarea
  const source = $('#source');
  source.value = store.get('source');
  store.on('source', (v) => {
    if (source.value !== v) source.value = v;
  });
  source.addEventListener('input', () => {
    store.set('source', source.value);
    renderFromSource();
  });

  // Document colour themes, built from the one list so adding a palette needs no markup.
  // The swatch paints the real accent and tint, so what you pick is what the page gets.
  const swatches = $('#themeSwatches');
  if (swatches && !swatches.children.length) {
    swatches.append(
      ...DOC_THEMES.map((t) =>
        el(
          'button',
          { class: 'theme', type: 'button', dataset: { theme: t.id }, title: `قالب رنگی سند: ${t.label}` },
          el('i', { style: `background:linear-gradient(90deg,${t.accent} 0 28%,${t.tint} 28%)` + (t.rule ? `;border-bottom:2px dotted ${t.accent}` : '') }),
          t.label,
        ),
      ),
    );
  }
  const themeBtns = $$('.theme');
  const paintThemes = (t) =>
    themeBtns.forEach((b) => {
      b.classList.toggle('active', b.dataset.theme === t);
      b.setAttribute('aria-pressed', String(b.dataset.theme === t));
    });
  store.on('theme', paintThemes);
  paintThemes(store.get('theme'));
  themeBtns.forEach((b) =>
    b.addEventListener('click', () => {
      store.set('theme', b.dataset.theme);
      store.set('dirty', true);
    }),
  );

  // The mark on a side-panel group tab: a drawn icon, or an emoji for whoever reads those faster.
  const glyphBtns = $$('[data-glyph]');
  const paintGlyph = (v) =>
    glyphBtns.forEach((b) => {
      b.classList.toggle('active', b.dataset.glyph === v);
      b.setAttribute('aria-pressed', String(b.dataset.glyph === v));
    });
  store.on('groupGlyph', paintGlyph);
  paintGlyph(store.get('groupGlyph'));
  glyphBtns.forEach((b) => b.addEventListener('click', () => store.set('groupGlyph', b.dataset.glyph)));

  // Font size / zoom
  const select = $('#fontSelect');
  const paintFont = (px) => {
    if (![...select.options].some((o) => o.value === String(px))) select.add(new Option(px + ' px', String(px)));
    select.value = String(px);
    $('#zoom').textContent = faPercent((px / 15) * 100);
  };
  store.on('font', paintFont);
  paintFont(store.get('font'));
  select.addEventListener('change', () => setFont(Number(select.value)));
  $('#fontUp').addEventListener('click', () => setFont(store.get('font') + 1));
  $('#fontDown').addEventListener('click', () => setFont(store.get('font') - 1));

  // History + clipboard buttons
  $('#undo').addEventListener('click', undo);
  $('#redo').addEventListener('click', redo);
  store.on('history', ({ canUndo, canRedo }) => {
    $('#undo').disabled = !canUndo;
    $('#redo').disabled = !canRedo;
  });
  $('#undo').disabled = $('#redo').disabled = true;
  $('#copyText').addEventListener('click', () => copyPlain(plainText()));

  // Header / footer images, upload
  $('#mastheadImage').addEventListener('click', () => pickImage('masthead'));
  $('#footerImage').addEventListener('click', () => pickImage('footer'));
  $('#headerPaste').addEventListener('click', () => pasteClipboardImage('masthead'));
  $('#footerPaste').addEventListener('click', () => pasteClipboardImage('footer'));
  $('#clearHeaderImage').addEventListener('click', () => {
    store.set('mastheadImage', '');
    refreshFurniture();
  });
  $('#clearFooterImage').addEventListener('click', () => {
    store.set('footerImage', '');
    refreshFurniture();
  });
  $('#uploadImage').addEventListener('click', uploadPendingImage);
}
