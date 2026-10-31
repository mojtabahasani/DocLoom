// Folder picker (inside the server's roots) used by "ذخیره به نام" and "ذخیره در پوشه…".
import { el, icon } from '../core/dom.js';
import { openModal } from '../ui/modal.js';
import { fapi, errorText } from './files-api.js';
import { crumbs, joinPath, cleanFileName } from './files-core.js';

/** Breadcrumb row. Paths read left→right (LTR) whatever the page direction; each crumb is a button. */
export function crumbBar(dir, root, go) {
  const items = crumbs(dir, root);
  const bar = el('nav', { class: 'f-crumbs', 'aria-label': 'مسیر' });
  bar.append(el('button', { type: 'button', class: 'f-crumb', text: 'ریشه‌ها', onclick: () => go('') }));
  items.forEach((c, i) => {
    bar.append(el('span', { class: 'f-sep', 'aria-hidden': 'true', text: '/' }));
    bar.append(el('button', { type: 'button', class: 'f-crumb', 'aria-current': i === items.length - 1 ? 'true' : null, text: c.name, onclick: () => go(c.path) }));
  });
  return bar;
}

/**
 * pickLocation({title, startDir, name, withName, submitLabel}) -> Promise<{dir, name?}|null>
 * Only folders are listed; the user may create a new folder. With `withName` a file-name field is shown.
 */
export function pickLocation({ title, startDir = '', name = '', withName = false, submitLabel = 'انتخاب' }) {
  return new Promise((resolve) => {
    let result = null;
    let cur = { path: '', root: null };
    const list = el('ul', { class: 'f-list f-pick', 'aria-label': 'پوشه‌ها' });
    const where = el('div', { class: 'f-where' });
    const err = el('p', { class: 'form-error', role: 'alert', hidden: true });
    const nameInput = withName ? el('input', { type: 'text', id: 'fpName', value: name, dir: 'ltr', 'aria-label': 'نام فایل', autocomplete: 'off', spellcheck: 'false' }) : null;
    const newName = el('input', { type: 'text', placeholder: 'نام پوشهٔ تازه', 'aria-label': 'نام پوشهٔ تازه', dir: 'auto', autocomplete: 'off' });
    const newBtn = el('button', { type: 'button', class: 'btn soft', onclick: makeFolder }, icon('plus'), 'ساخت پوشه');
    const newRow = el('div', { class: 'f-newrow' }, newName, newBtn);
    newName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        makeFolder();
      }
    });

    async function go(path) {
      try {
        const r = await fapi.list(path);
        cur = { path: r.path, root: r.root };
        list.replaceChildren(
          ...r.entries
            .filter((e) => e.kind === 'dir')
            .map((e) => el('li', {}, el('button', { type: 'button', class: 'f-open', onclick: () => go(e.path) }, icon('folder'), el('span', { class: 'f-name', text: e.name })))),
        );
        if (!list.children.length) list.append(el('li', { class: 'f-none', text: r.path ? 'پوشهٔ دیگری در اینجا نیست.' : '' }));
        where.replaceChildren(crumbBar(r.path, r.root, go));
        newRow.hidden = !r.path;
        err.hidden = true;
      } catch (e) {
        if (path) return go('');
        err.textContent = errorText(e);
        err.hidden = false;
      }
    }
    async function makeFolder() {
      const n = cleanFileName(newName.value, '').replace(/\.$/, '');
      if (!n) return;
      try {
        await fapi.mkdir(joinPath(cur.path, n));
        newName.value = '';
        await go(cur.path);
      } catch (e) {
        err.textContent = e.status === 409 ? 'این پوشه از قبل هست.' : errorText(e);
        err.hidden = false;
      }
    }

    const body = el('div', { class: 'f-picker' }, where, list, newRow, withName ? el('div', { class: 'field' }, el('label', { for: 'fpName', text: 'نام فایل' }), nameInput) : null, err);
    const actions = () => [
      { label: 'انصراف', kind: '' },
      {
        label: submitLabel,
        kind: 'primary',
        onClick: () => {
          if (!cur.path) {
            err.textContent = 'ابتدا یکی از پوشه‌ها را باز کنید.';
            err.hidden = false;
            return false;
          }
          const n = withName ? cleanFileName(nameInput.value, '.md') : '';
          if (withName && !n) {
            err.textContent = 'نام فایل خالی است.';
            err.hidden = false;
            return false;
          }
          result = { dir: cur.path, ...(withName ? { name: n } : {}) };
        },
      },
    ];
    const m = openModal({ title, body, wide: true, onClose: () => resolve(result), actions: actions() });
    nameInput?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      m.el.querySelector('.modalfoot .btn.primary')?.click();
    });
    nameInput?.focus();
    go(startDir);
  });
}
