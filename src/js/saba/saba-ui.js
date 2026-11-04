// "Saba report -> clean document": the dialog for a FastReport .fp3.
import { store } from '../core/store.js';
import { el } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { openModal } from '../ui/modal.js';
import { renderFromSource } from '../editor/preview.js';
import { readFp3, Fp3Error } from './fp3.js';
import { buildTable, pruneEmpty, isZeroColumn } from './fp3-table.js';
import { buildSabaReport } from './saba-report.js';
import { toFaDigits } from '../bank/normalize.js';

export const FP3_RE = /\.fp3$/i;
export const MAX_FP3_BYTES = 20 * 1024 * 1024;

const fa = (n) => toFaDigits(String(n));

export async function openSabaImport(file) {
  if (!file) return;
  if (file.size > MAX_FP3_BYTES) return notify('فایل گزارش بزرگ‌تر از ۲۰ مگابایت است.');

  let table;
  try {
    table = pruneEmpty(buildTable(readFp3(await file.text())));
  } catch (e) {
    return notify(e instanceof Fp3Error ? e.message : 'خواندن فایل گزارش ممکن نشد.', { duration: 7000 });
  }
  if (!table.ok) return notify('در این گزارش هیچ ردیف داده‌ای پیدا نشد.', { duration: 7000 });

  // All-zero columns start unticked: they are noise on a printed invoice, but one click brings
  // them back, which is better than removing them outright.
  const chosen = new Set(table.columns.map((_, i) => i).filter((i) => !isZeroColumn(table, i)));
  const opts = { meta: true, notes: true, totals: true, digits: 'fa' };

  const info = el('p', { class: 'modal-note bank-info' });
  const preview = el('div', { class: 'bank-preview' });
  const colBox = el('div', { class: 'bank-cols', role: 'group', 'aria-label': 'ستون‌های گزارش' });

  table.columns.forEach((c, i) => {
    const id = 'scol-' + i;
    const input = el('input', { type: 'checkbox', id, ...(chosen.has(i) ? { checked: true } : {}) });
    input.addEventListener('change', () => {
      if (input.checked) chosen.add(i);
      else chosen.delete(i);
      refresh();
    });
    colBox.append(el('label', { class: 'check', for: id }, input, ' ' + (c.label || '—')));
  });

  const toggle = (key, label) => {
    const id = 'sopt-' + key;
    const input = el('input', { type: 'checkbox', id, ...(opts[key] ? { checked: true } : {}) });
    input.addEventListener('change', () => {
      opts[key] = input.checked;
      refresh();
    });
    return el('label', { class: 'check', for: id }, input, ' ' + label);
  };

  let report = null;
  function refresh() {
    const columns = [...chosen].sort((a, b) => a - b);
    report = buildSabaReport({ table, options: { ...opts, heading: false, columns } });
    info.textContent = [
      report.title || 'گزارش صبا',
      `${fa(table.rows.length)} ردیف`,
      `${fa(columns.length)} ستون`,
      table.dropped ? `${fa(table.dropped)} ستون خالی حذف شد` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const lines = report.markdown.split('\n').filter((l) => l.startsWith('|'));
    preview.replaceChildren(
      el('pre', { class: 'bank-pre', dir: 'rtl', text: lines.slice(0, 7).join('\n') + (lines.length > 7 ? '\n…' : '') }),
    );
  }
  refresh();

  const body = el(
    'div',
    { class: 'bank-wrap' },
    info,
    el('div', { class: 'field' }, el('span', { class: 'lab', text: 'ستون‌های گزارش' }), colBox),
    el('div', { class: 'bank-opts' }, toggle('meta', 'مشخصات بالای گزارش'), toggle('notes', 'یادداشت‌ها و توضیحات'), toggle('totals', 'جمع‌ها')),
    preview,
  );

  openModal({
    title: 'تبدیل گزارش صبا به سند',
    body,
    wide: true,
    actions: [
      { label: 'انصراف', kind: '' },
      {
        label: 'ساخت سند گزارش',
        kind: 'primary',
        onClick: () => {
          if (!report || !report.table.rows.length) {
            notify('ردیفی برای درج نیست.');
            return false;
          }
          insert(report);
        },
      },
    ],
  });
}

function insert(report) {
  store.emit('before-import'); // keep a version of whatever was open
  store.set('webLayout', false);
  store.set('source', report.markdown);
  store.set('title', report.title); // the heading is off, so the title goes on the brand cover
  renderFromSource();
  store.set('dirty', true);
  store.emit('text:imported');
  notify(`گزارش با ${fa(report.table.rows.length)} ردیف ساخته شد.`);
}

export function initSabaImport(register) {
  register({ test: (name) => FP3_RE.test(name), open: openSabaImport });
}
