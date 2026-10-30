// "پاک‌سازی خروجی هوش مصنوعی": rule list with counts and before/after samples; apply = version snapshot + undoable change.
import { store } from '../core/store.js';
import { el } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { toFaDigits } from '../content/persian.js';
import { RULES, defaultRules, cleanMarkdown } from '../content/cleanup.js';
import { cleanDOM } from '../content/cleanup-dom.js';
import { preview, isEmpty, previewInSync, renderFromSource, markChanged } from '../editor/preview.js';
import { versions } from '../library/versions.js';
import { openModal } from './modal.js';

const ALL_ON = Object.fromEntries(RULES.map((r) => [r.id, true]));
const sum = (report, on) => report.reduce((n, r) => n + (on[r.id] ? r.count : 0), 0);

function analyzeCurrent(useSource) {
  if (useSource) return cleanMarkdown(store.get('source'), ALL_ON).report;
  return cleanDOM(preview.cloneNode(true), ALL_ON).report;
}

/** Applies the chosen rules. Always snapshots first ('before-cleanup') and offers "برگردان". Returns the change count. */
export async function applyCleanup(on = defaultRules()) {
  const useSource = previewInSync();
  if (!useSource && isEmpty()) return notify('ابتدا متن یا فایل خود را وارد کنید.'), 0;
  const prev = { source: store.get('source'), html: preview.innerHTML };
  await versions.snapshot('before-cleanup').catch(() => {});
  let report;
  if (useSource) {
    const r = cleanMarkdown(prev.source, on);
    report = r.report;
    if (sum(report, ALL_ON)) {
      store.set('source', r.text);
      renderFromSource();
    }
  } else {
    report = cleanDOM(preview, on).report;
    if (sum(report, ALL_ON)) markChanged();
  }
  const total = sum(report, ALL_ON);
  if (!total) return notify('چیزی برای پاک‌سازی با قاعده‌های انتخاب‌شده پیدا نشد.'), 0;
  notify(`پاک‌سازی انجام شد؛ ${toFaDigits(total)} تغییر.`, {
    action: {
      label: 'برگردان',
      run: () => {
        store.set('source', prev.source);
        preview.innerHTML = prev.html;
        markChanged();
      },
    },
  });
  return total;
}

/** Text with each ZWNJ shown as a small dot so the fix is visible. */
function sampleText(t) {
  const out = el('span', { dir: 'auto' });
  t.split('\u200c').forEach((part, i) => {
    if (i) out.append(el('span', { class: 'zw', title: 'نیم‌فاصله' }));
    out.append(part);
  });
  return out;
}

export function openCleanup() {
  const useSource = previewInSync();
  if (!useSource && isEmpty()) return notify('ابتدا متن یا فایل خود را وارد کنید.');
  const report = analyzeCurrent(useSource);
  const on = defaultRules();
  const summary = el('p', { class: 'cl-summary', role: 'status' });
  const refresh = () => {
    const n = sum(report, on);
    summary.textContent = n ? `${toFaDigits(n)} تغییر با قاعده‌های روشن اعمال می‌شود.` : 'با قاعده‌های روشن، تغییری لازم نیست.';
  };
  const rows = RULES.map((rule) => {
    const r = report.find((x) => x.id === rule.id);
    const box = el('input', { type: 'checkbox', id: 'cl-' + rule.id, ...(on[rule.id] ? { checked: '' } : {}) });
    const row = el(
      'div',
      { class: 'cl-row' + (on[rule.id] ? '' : ' off') + (r.count ? '' : ' empty') },
      el('label', { class: 'cl-head', for: 'cl-' + rule.id }, box, el('span', { class: 'cl-label', text: rule.label }), el('em', { class: 'cl-count', text: r.count ? toFaDigits(r.count) : '۰' })),
      el('p', { class: 'cl-hint', text: rule.hint }),
    );
    if (r.samples.length) {
      row.append(
        el(
          'details',
          { class: 'cl-samples' },
          el('summary', { text: 'نمونهٔ قبل و بعد' }),
          ...r.samples.map((s) =>
            el('div', { class: 'cl-sample' }, el('div', { class: 'cl-before' }, sampleText(s.before)), el('div', { class: 'cl-after' }, sampleText(s.after))),
          ),
        ),
      );
    }
    box.addEventListener('change', () => {
      on[rule.id] = box.checked;
      row.classList.toggle('off', !box.checked);
      refresh();
    });
    return row;
  });
  refresh();
  const body = el(
    'div',
    { class: 'cleanup' },
    el('p', { class: 'modal-note', text: (useSource ? 'پاک‌سازی روی متن Markdown انجام می‌شود.' : 'سند ویرایش شده است؛ پاک‌سازی روی متن پیش‌نمایش انجام می‌شود.') + ' بلوک کد، کد درون‌خطی، نشانی وب و ایمیل هرگز تغییر نمی‌کنند. پیش از اعمال، یک نسخه ذخیره می‌شود و می‌توانید برگردانید.' }),
    ...rows,
    summary,
  );
  openModal({
    title: 'پاک‌سازی خروجی هوش مصنوعی',
    body,
    wide: true,
    actions: [
      { label: 'انصراف', kind: '' },
      { label: 'اعمال پاک‌سازی', kind: 'primary', onClick: () => void applyCleanup({ ...on }) },
    ],
  });
}
