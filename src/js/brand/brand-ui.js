// Header brand switcher, the brand manager modal and the palette commands for brands.
import { store } from '../core/store.js';
import { $, $$, el } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { toFaDigits as fa } from '../content/persian.js';
import { palette } from '../ui/palette.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { loadImageData } from '../editor/images.js';
import { brands, applyBrand } from './brands.js';
import { BRAND_THEMES, normalizeBrand, validateBrand, newBrandId } from './brand-model.js';
import { QR_KINDS, QR_POSITIONS } from './qr.js';

const IMAGES = [
  ['mastheadImage', 'تصویر سربرگ'], ['footerImage', 'تصویر پاورقی'], ['signatureImage', 'تصویر امضا'], ['stampImage', 'تصویر مهر'],
];

// ---------- manager ----------
function field(label, input, id) {
  input.id = id;
  return el('div', { class: 'field' }, el('label', { for: id, text: label }), input);
}
const text = (value, extra = {}) => el('input', { type: 'text', value: value || '', autocomplete: 'off', ...extra });
const select = (opts, value) => {
  const s = el('select', {}, ...opts.map(([v, l]) => el('option', { value: v, text: l })));
  s.value = value;
  return s;
};

function imagePicker(draft, key, label) {
  const thumb = el('img', { class: 'brand-thumb', alt: label });
  const empty = el('span', { class: 'brand-thumb empty', text: 'بدون تصویر' });
  const slot = el('span', { class: 'brand-thumb-slot' });
  const paint = () => slot.replaceChildren(draft[key] ? Object.assign(thumb, { src: draft[key] }) : empty);
  const input = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, 'aria-label': label });
  input.addEventListener('change', async () => {
    const data = await loadImageData(input.files[0]);
    input.value = '';
    if (data) {
      draft[key] = data;
      paint();
    }
  });
  paint();
  return el('div', { class: 'brand-img' }, slot,
    el('div', { class: 'brand-img-actions' }, el('strong', { text: label }),
      el('span', {}, el('button', { type: 'button', class: 'btn', text: 'انتخاب', onclick: () => input.click() }), ' ',
        el('button', { type: 'button', class: 'btn', text: 'حذف', onclick: () => { draft[key] = ''; paint(); } }))),
    input);
}

function editor(brand, done) {
  const draft = normalizeBrand(brand);
  const f = {
    name: text(draft.name, { 'data-autofocus': '' }), theme: select(BRAND_THEMES, draft.theme),
    primary: el('input', { type: 'color', value: draft.colors.primary || '#1c5263' }), useColor: el('input', { type: 'checkbox' }),
    accent: el('input', { type: 'color', value: draft.colors.accent || '#edf3f2' }), useAccent: el('input', { type: 'checkbox' }),
    mastheadText: text(draft.mastheadText), footerText: text(draft.footerText),
    signerName: text(draft.signer.name), signerRole: text(draft.signer.role),
    prefix: text(draft.letterPrefix), counter: el('input', { type: 'number', min: 1, max: 999999, value: draft.letterCounter, dir: 'ltr' }),
    website: text(draft.website, { dir: 'ltr', placeholder: 'https://www.example.com' }),
    qrOn: el('input', { type: 'checkbox' }), qrKind: select(QR_KINDS, draft.qr.kind), qrValue: text(draft.qr.value, { dir: 'ltr', placeholder: 'خالی = وب‌سایت برند' }),
    qrPos: select(QR_POSITIONS, draft.qr.position),
  };
  f.useColor.checked = !!draft.colors.primary;
  f.useAccent.checked = !!draft.colors.accent;
  f.qrOn.checked = draft.qr.enabled;
  const err = el('p', { class: 'form-error', role: 'alert', hidden: true });
  const check = (label, input) => el('label', { class: 'check' }, input, label);
  const collect = () => normalizeBrand({
    ...draft, name: f.name.value, theme: f.theme.value,
    colors: { primary: f.useColor.checked ? f.primary.value : '', accent: f.useAccent.checked ? f.accent.value : '' },
    mastheadText: f.mastheadText.value, footerText: f.footerText.value, signer: { name: f.signerName.value, role: f.signerRole.value },
    letterPrefix: f.prefix.value, letterCounter: f.counter.value, website: f.website.value,
    qr: { ...draft.qr, enabled: f.qrOn.checked, kind: f.qrKind.value, value: f.qrValue.value, position: f.qrPos.value },
  });
  const save = async () => {
    const b = collect();
    const problem = validateBrand({ ...b, website: f.website.value.trim() ? b.website : '' }) || (f.website.value.trim() && !b.website ? 'نشانی وب‌سایت معتبر نیست.' : null);
    if (problem) {
      err.textContent = problem;
      err.hidden = false;
      return;
    }
    await brands.save(b);
    notify(`برند «${b.name}» ذخیره شد.`);
    done();
  };
  return el('form', { class: 'brand-form', onsubmit: (e) => (e.preventDefault(), save()) },
    el('div', { class: 'two' }, field('نام برند', f.name, 'bf-name'), field('قالب رنگی', f.theme, 'bf-theme')),
    el('div', { class: 'two' },
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'رنگ اصلی سفارشی' }), el('div', { class: 'inline-row' }, check('استفاده', f.useColor), f.primary)),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'رنگ زمینهٔ کارت‌ها' }), el('div', { class: 'inline-row' }, check('استفاده', f.useAccent), f.accent))),
    el('div', { class: 'two' }, field('متن سربرگ', f.mastheadText, 'bf-mast'), field('متن پاورقی', f.footerText, 'bf-foot')),
    el('div', { class: 'brand-imgs' }, ...IMAGES.map(([k, l]) => imagePicker(draft, k, l))),
    el('div', { class: 'two' }, field('نام امضاکننده', f.signerName, 'bf-sn'), field('سمت', f.signerRole, 'bf-sr')),
    el('div', { class: 'two' }, field('پیشوند شمارهٔ نامه', f.prefix, 'bf-prefix'), field('شمارندهٔ بعدی', f.counter, 'bf-counter')),
    field('وب‌سایت', f.website, 'bf-web'),
    el('div', { class: 'brand-qr' }, check('QR کد برای اسناد این برند', f.qrOn),
      el('div', { class: 'two' }, field('محتوای QR', f.qrKind, 'bf-qk'), field('جای QR', f.qrPos, 'bf-qp')), field('مقدار QR', f.qrValue, 'bf-qv')),
    err,
    el('div', { class: 'brand-actions' },
      el('button', { type: 'submit', class: 'btn primary', text: 'ذخیرهٔ برند' }),
      el('button', { type: 'button', class: 'btn', text: 'انصراف', onclick: done })));
}

export function openBrandManager() {
  const body = el('div', { class: 'brand-manager' });
  const m = openModal({ title: 'مدیریت برندها', body, wide: true });
  const showList = () => {
    const rows = brands.all().map((b) => {
      const isDefault = brands.defaultId() === b.id;
      return el('li', { class: 'brand-row' },
        el('div', { class: 'brand-info' }, el('strong', { text: b.name }),
          el('small', { text: `${b.letterPrefix ? 'پیشوند ' + b.letterPrefix + ' · ' : ''}شمارندهٔ بعدی ${fa(b.letterCounter)}${isDefault ? ' · پیش‌فرض اسناد تازه' : ''}` })),
        el('div', { class: 'brand-row-actions' },
          el('button', { type: 'button', class: 'btn soft', text: 'اعمال روی سند', onclick: () => (applyBrand(b.id), notify(`برند «${b.name}» روی سند اعمال شد.`), m.close()) }),
          el('button', { type: 'button', class: 'btn', text: 'ویرایش', onclick: () => showEdit(b) }),
          el('button', { type: 'button', class: 'btn', text: 'تکثیر', onclick: async () => (await brands.duplicate(b.id), showList()) }),
          isDefault ? null : el('button', { type: 'button', class: 'btn', text: 'پیش‌فرض', onclick: async () => (await brands.setDefault(b.id), showList()) }),
          el('button', { type: 'button', class: 'btn danger-soft', text: 'حذف', onclick: () => remove(b) })));
    });
    body.replaceChildren(
      rows.length ? el('ul', { class: 'brand-list' }, ...rows) : el('p', { class: 'modal-note', text: 'هنوز برندی ندارید.' }),
      el('div', { class: 'brand-actions' }, el('button', { type: 'button', class: 'btn primary', text: 'برند تازه', onclick: () => showEdit(null) })));
  };
  const showEdit = (b) => {
    body.replaceChildren(editor(b || { id: newBrandId(), name: '' }, showList));
    body.querySelector('[data-autofocus]')?.focus();
  };
  async function remove(b) {
    const ok = await confirmDialog({ title: 'حذف برند', message: `برند «${b.name}» بایگانی شود؟ از فهرست برندها کنار می‌رود؛ سندهایی که از آن استفاده کرده‌اند تغییری نمی‌کنند.`, confirmLabel: 'حذف', danger: true });
    if (ok) {
      await brands.remove(b.id);
      notify('برند بایگانی شد.', { action: { label: 'برگردان', run: () => brands.restore(b.id) } });
    }
    openBrandManager();
  }
  showList();
}

// ---------- switcher ----------
function paintSwitcher() {
  const cur = brands.current();
  $('#brandName').textContent = cur ? cur.name : 'برند';
  $('#brandBtn').title = cur ? `برند سند: ${cur.name}` : 'انتخاب برند سند';
  const menu = $('#brandMenu');
  menu.replaceChildren(
    el('p', { class: 'menu-label', text: 'برند این سند' }),
    ...brands.all().map((b) =>
      el('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(b.id === store.get('brandId')), onclick: () => choose(b) },
        el('span', { text: b.name }), b.id === store.get('brandId') ? el('em', { text: '✓' }) : null)),
    el('div', { class: 'sep thin' }),
    el('button', { type: 'button', role: 'menuitem', onclick: () => (setOpen(false), openBrandManager()) }, el('span', { text: 'مدیریت برندها…' })),
  );
}

function setOpen(open) {
  $('#brandMenu').hidden = !open;
  $('#brandBtn').setAttribute('aria-expanded', String(open));
  if (open) $('#brandMenu button').focus();
}

function choose(b) {
  setOpen(false);
  applyBrand(b.id);
  notify(`برند «${b.name}» روی سند اعمال شد.`);
}

let registered = [];
function refreshCommands() {
  registered.forEach((id) => palette.unregister(id));
  registered = brands.all().map((b) => 'brand-use-' + b.id);
  for (const b of brands.all()) {
    palette.register({ id: 'brand-use-' + b.id, title: `برند: ${b.name}`, group: 'برندها', keywords: 'brand برند تعویض سربرگ ' + b.name, run: () => choose(b) });
  }
}

export function initBrandUI() {
  const btn = $('#brandBtn');
  const menu = $('#brandMenu');
  btn.addEventListener('click', () => setOpen(menu.hidden));
  document.addEventListener('mousedown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });
  menu.addEventListener('keydown', (e) => {
    const items = $$('button', menu);
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') (setOpen(false), btn.focus());
    else if (e.key === 'ArrowDown') (e.preventDefault(), items[(i + 1) % items.length].focus());
    else if (e.key === 'ArrowUp') (e.preventDefault(), items[(i - 1 + items.length) % items.length].focus());
  });
  for (const k of ['brands:changed', 'brandId', 'docId']) store.on(k, paintSwitcher);
  store.on('brands:changed', refreshCommands);
  paintSwitcher();
  refreshCommands();
  palette.register({ id: 'brand-manage', title: 'مدیریت برندها', group: 'برندها', keywords: 'brand manage برند ساخت ویرایش حذف تکثیر', run: openBrandManager });
}
