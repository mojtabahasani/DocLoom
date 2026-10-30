// In-app dialogs. Replaces alert / confirm / prompt. Focus is trapped; Esc and backdrop click close.
import { el } from '../core/dom.js';

let seq = 0;
const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[href],[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

/**
 * openModal({ title, body: Node|string, actions: [{label, kind:'primary'|'soft'|'danger'|'', onClick, keepOpen}], onClose, wide })
 * returns { close(), el }
 */
export function openModal({ title, body, actions = [], onClose, wide = false }) {
  const root = document.getElementById('modal');
  const opener = document.activeElement;
  const id = 'modalTitle' + ++seq;
  const closeBtn = el('button', { type: 'button', class: 'btn ghost', 'aria-label': 'بستن', text: 'بستن' });
  const bodyEl = el('div', { class: 'modalbody' }, typeof body === 'string' ? el('p', { text: body }) : body);
  const foot = el('div', { class: 'modalfoot' });
  const box = el(
    'section',
    { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id },
    el('div', { class: 'modalhead' }, el('h2', { id, text: title }), el('span', { class: 'grow' }), closeBtn),
    bodyEl,
  );
  const back = el('div', { class: 'backdrop' }, box);
  let closed = false;

  const close = (result) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    back.remove();
    opener?.focus?.();
    onClose?.(result);
  };
  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const items = Array.from(box.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  actions.forEach((a) => {
    foot.append(
      el('button', {
        type: 'button',
        class: 'btn ' + (a.kind || ''),
        text: a.label,
        onclick: async () => {
          const keep = await a.onClick?.();
          if (!a.keepOpen && keep !== false) close(a.value);
        },
      }),
    );
  });
  if (actions.length) box.append(foot);
  closeBtn.addEventListener('click', () => close());
  back.addEventListener('mousedown', (e) => {
    if (e.target === back) close();
  });
  document.addEventListener('keydown', onKey, true);
  root.replaceChildren(back);
  (box.querySelector('[data-autofocus]') || box.querySelector('.modalfoot .btn.primary,.modalfoot .btn.danger') || closeBtn).focus();
  return { close, el: box };
}

/** confirmDialog({title, message, confirmLabel, cancelLabel, danger}) -> Promise<boolean> */
export function confirmDialog({ title = 'تأیید', message, confirmLabel = 'ادامه', cancelLabel = 'انصراف', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const m = openModal({
      title,
      body: message,
      onClose: () => resolve(answer),
      actions: [
        { label: cancelLabel, kind: '' },
        { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: () => void (answer = true) },
      ],
    });
    m.el.querySelector('.modalfoot .btn.primary,.modalfoot .btn.danger')?.setAttribute('data-autofocus', '');
  });
}

/**
 * promptDialog({title, message, fields:[{name,label,value,placeholder,type,dir}], submitLabel})
 * -> Promise<{[name]: string} | null>
 */
export function promptDialog({ title, message, fields, submitLabel = 'تأیید', validate }) {
  return new Promise((resolve) => {
    let result = null;
    const inputs = {};
    const err = el('p', { class: 'form-error', role: 'alert', hidden: true });
    const form = el('form', { class: 'modal-form' });
    if (message) form.append(el('p', { class: 'modal-note', text: message }));
    fields.forEach((f, i) => {
      const id = 'pf' + ++seq;
      const input = el('input', {
        id, type: f.type || 'text', value: f.value || '', placeholder: f.placeholder || '', dir: f.dir || 'auto',
        ...(i === 0 ? { 'data-autofocus': '' } : {}),
      });
      inputs[f.name] = input;
      form.append(el('div', { class: 'field' }, el('label', { for: id, text: f.label }), input));
    });
    form.append(err);
    const submit = () => {
      const values = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.value.trim()]));
      const problem = validate?.(values);
      if (problem) {
        err.textContent = problem;
        err.hidden = false;
        return false;
      }
      result = values;
      return true;
    };
    const m = openModal({
      title,
      body: form,
      onClose: () => resolve(result),
      actions: [
        { label: 'انصراف', kind: '' },
        { label: submitLabel, kind: 'primary', onClick: () => submit() },
      ],
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (submit()) m.close();
    });
    inputs[fields[0].name].select();
  });
}
