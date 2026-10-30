// Letter mode: side-panel section, mode switch, "شماره بگیر", draggable signature and stamp, palette commands.
import { store } from '../core/store.js';
import { $ } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { palette } from '../ui/palette.js';
import { preview, refreshFurniture, markChanged } from '../editor/preview.js';
import { normalizeLetter, issueNumber } from './letter.js';
import { formatJalali, parseJalali, todayJalali } from './jalali.js';
import { brands, applyBrand } from './brands.js';

const isLetter = () => store.get('mode') === 'letter';
const todayText = () => formatJalali(todayJalali());

/** Change one or more letter fields and redraw the letter blocks. */
export function setLetter(patch, { redraw = true } = {}) {
  const cur = normalizeLetter(store.get('letter'));
  const next = normalizeLetter({ ...cur, ...patch, signer: { ...cur.signer, ...(patch.signer || {}) } });
  store.set('letter', next);
  store.set('dirty', true);
  if (redraw && isLetter()) refreshFurniture();
}

export function setLetterMode(on) {
  if (on === isLetter()) return;
  if (on) {
    const id = brands.defaultId();
    if (!store.get('brandId') && id) applyBrand(id, { soft: true, refresh: false });
    const L = normalizeLetter(store.get('letter'));
    store.set('letter', {
      ...L,
      date: L.date || todayText(),
      recipient: L.recipient || store.get('subtitle') || '',
      subject: L.subject || store.get('title') || '',
      signer: L.signer.name || L.signer.role ? L.signer : { ...(brands.current()?.signer || L.signer) },
    });
  }
  store.set('mode', on ? 'letter' : 'doc');
  store.set('dirty', true);
  refreshFurniture();
}

export const toggleLetterMode = () => setLetterMode(!isLetter());

/** Issue the next number of the document's brand (prefix/counter) and advance the brand counter. */
export async function takeNumber() {
  let brand = brands.current();
  if (!brand) {
    const id = brands.defaultId();
    if (!id) return notify('برای شماره گرفتن، ابتدا در «مدیریت برندها» یک برند بسازید.');
    applyBrand(id, { soft: true, refresh: false });
    brand = brands.current();
  }
  if (!isLetter()) setLetterMode(true);
  const before = { number: normalizeLetter(store.get('letter')).number, brand };
  const { number, brand: advanced } = issueNumber(brand);
  await brands.save(advanced);
  setLetter({ number });
  notify(`شمارهٔ ${number} گرفته شد.`, {
    action: {
      label: 'برگردان',
      run: async () => {
        await brands.save(before.brand);
        setLetter({ number: before.number });
      },
    },
  });
}

function initDrag() {
  let drag = null;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(Math.max(lo, hi), v));
  preview.addEventListener('pointerdown', (e) => {
    const img = e.button === 0 && e.target.closest?.('.sign-area img');
    if (!img) return;
    e.preventDefault();
    drag = {
      img, kind: img.classList.contains('sig-img') ? 'sig' : 'stamp', sx: e.clientX, sy: e.clientY,
      x0: parseFloat(img.style.marginLeft) || 0, y0: parseFloat(img.style.marginTop) || 0,
      area: img.parentElement.getBoundingClientRect(), x: 0, y: 0,
    };
    drag.x = drag.x0;
    drag.y = drag.y0;
    img.setPointerCapture?.(e.pointerId);
    img.classList.add('dragging');
  });
  preview.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = drag.img.getBoundingClientRect();
    drag.x = Math.round(clamp(drag.x0 + e.clientX - drag.sx, 0, drag.area.width - r.width));
    drag.y = Math.round(clamp(drag.y0 + e.clientY - drag.sy, 0, drag.area.height - r.height));
    drag.img.style.marginLeft = drag.x + 'px';
    drag.img.style.marginTop = drag.y + 'px';
  });
  const end = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.img.classList.remove('dragging');
    if (d.x === d.x0 && d.y === d.y0) return;
    setLetter({ [d.kind]: { x: d.x, y: d.y } }, { redraw: false });
    markChanged();
  };
  preview.addEventListener('pointerup', end);
  preview.addEventListener('pointercancel', end);
}

const TEXT_FIELDS = [
  ['letterDate', (v) => ({ date: v })], ['letterNumber', (v) => ({ number: v })], ['letterAttach', (v) => ({ attachments: v })],
  ['letterTo', (v) => ({ recipient: v })], ['letterSubject', (v) => ({ subject: v })],
  ['letterSigner', (v) => ({ signer: { name: v } })], ['letterRole', (v) => ({ signer: { role: v } })],
];

function syncPanel() {
  const on = isLetter();
  const L = normalizeLetter(store.get('letter'));
  $('#letterMode').checked = on;
  $('#letterFields').hidden = !on;
  const values = { letterDate: L.date, letterNumber: L.number, letterAttach: L.attachments, letterTo: L.recipient, letterSubject: L.subject, letterSigner: L.signer.name, letterRole: L.signer.role };
  for (const [id, v] of Object.entries(values)) {
    const n = $('#' + id);
    if (document.activeElement !== n && n.value !== v) n.value = v;
  }
  $('#letterGreeting').checked = L.greeting;
}

export function initLetterUI() {
  initDrag();
  $('#letterMode').addEventListener('change', (e) => {
    setLetterMode(e.target.checked);
    if (e.target.checked) $('#letterAcc').open = true;
  });
  for (const [id, make] of TEXT_FIELDS) $('#' + id).addEventListener('input', (e) => setLetter(make(e.target.value)));
  $('#letterDate').addEventListener('blur', (e) => {
    const p = parseJalali(e.target.value);
    if (p) setLetter({ date: formatJalali(p) });
  });
  $('#letterToday').addEventListener('click', () => setLetter({ date: todayText() }));
  $('#letterTake').addEventListener('click', takeNumber);
  $('#letterGreeting').addEventListener('change', (e) => setLetter({ greeting: e.target.checked }));
  $('#letterResetSign').addEventListener('click', () => setLetter({ sig: { x: 30, y: 6 }, stamp: { x: 100, y: 16 } }));
  for (const k of ['mode', 'letter', 'docId']) store.on(k, syncPanel);
  syncPanel();
  store.on('mode', (m) => {
    if (m === 'letter') $('#letterAcc').open = true;
  });
  palette.register({ id: 'letter-mode', title: 'حالت نامه', group: 'سند', keywords: 'letter نامه اداری باسمه تعالی روشن خاموش', run: toggleLetterMode });
  palette.register({ id: 'letter-number', title: 'شماره بگیر', group: 'سند', keywords: 'letter number نامه شماره شمارنده ثبت', run: takeNumber });
}
