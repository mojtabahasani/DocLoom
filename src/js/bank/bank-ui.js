// "Bank Excel -> report": the drawer that sits between a bank export and the document.
import { store } from '../core/store.js';
import { el } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { openModal } from '../ui/modal.js';
import { renderFromSource } from '../editor/preview.js';
import { readWorkbook, SheetError } from './sheet-read.js';
import { parseStatement } from './bank-table.js';
import { buildReport, monthlyTable, guessBank, COLUMNS, defaultColumns } from './bank-report.js';
import { toFaDigits } from './normalize.js';

export const SPREADSHEET_RE = /\.(xlsx|xlsm|xls|csv|xml)$/i;
export const MAX_SHEET_BYTES = 12 * 1024 * 1024;

const fa = (n) => toFaDigits(String(n));

/** Read a File and hand back every sheet that looks like a statement. */
async function readStatements(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const wb = readWorkbook(bytes, file.name);
  return wb.sheets
    .map((sheet) => ({ sheet, statement: parseStatement(sheet.rows) }))
    .filter((s) => s.statement.ok);
}

export async function openBankImport(file) {
  if (!file) return;
  if (file.size > MAX_SHEET_BYTES) return notify('فایل اکسل بزرگ‌تر از ۱۲ مگابایت است.');

  let found;
  try {
    found = await readStatements(file);
  } catch (e) {
    return notify(e instanceof SheetError ? e.message : 'خواندن فایل اکسل ممکن نشد.', { duration: 7000 });
  }
  if (!found.length) {
    return notify('در این فایل جدول گردش حساب پیدا نشد؛ ستون‌های تاریخ، واریز و برداشت لازم است.', { duration: 7000 });
  }

  let pick = found[0];
  const bank = guessBank(file.name, pick.sheet.name, JSON.stringify(pick.statement.meta));
  const chosen = new Set(defaultColumns());
  const opts = { mergeFees: false, summary: true, totalRow: true, digits: 'fa', chart: false, minAmount: 0 };

  // ---- controls ----
  const info = el('p', { class: 'modal-note bank-info' });
  const preview = el('div', { class: 'bank-preview' });

  const colBox = el('div', { class: 'bank-cols', role: 'group', 'aria-label': 'ستون‌های گزارش' });
  const colInputs = COLUMNS.map((c) => {
    const id = 'bcol-' + c.id;
    const input = el('input', { type: 'checkbox', id, ...(chosen.has(c.id) ? { checked: true } : {}) });
    input.addEventListener('change', () => {
      if (input.checked) chosen.add(c.id);
      else chosen.delete(c.id);
      refresh();
    });
    colBox.append(el('label', { class: 'check', for: id }, input, ' ' + c.label));
    return input;
  });

  const toggle = (key, label) => {
    const id = 'bopt-' + key;
    const input = el('input', { type: 'checkbox', id, ...(opts[key] ? { checked: true } : {}) });
    input.addEventListener('change', () => {
      opts[key] = input.checked;
      refresh();
    });
    return el('label', { class: 'check', for: id }, input, ' ' + label);
  };

  const minInput = el('input', { type: 'number', min: '0', step: '1000', value: '0', dir: 'ltr', id: 'bopt-min', 'aria-label': 'حداقل مبلغ' });
  minInput.addEventListener('input', () => {
    opts.minAmount = Math.max(0, Number(minInput.value) || 0);
    refresh();
  });

  const sheetPick = found.length > 1
    ? el('select', { class: 'lib-sort', 'aria-label': 'برگه' }, ...found.map((f, i) => el('option', { value: String(i), text: f.sheet.name })))
    : null;
  sheetPick?.addEventListener('change', () => {
    pick = found[Number(sheetPick.value)];
    refresh();
  });

  let report = null;
  function refresh() {
    const st = pick.statement;
    report = buildReport({
      statement: st,
      options: { ...opts, bank, heading: false, columns: COLUMNS.map((c) => c.id).filter((id) => chosen.has(id)) },
    });
    const s = report.summary;
    const bits = [
      bank ? `بانک ${bank}` : 'بانک ناشناس',
      `${fa(report.rows.length)} تراکنش`,
      s.from && s.to ? `${toFaDigits(s.from.text)} تا ${toFaDigits(s.to.text)}` : '',
      st.dropped.total ? `${fa(st.dropped.total)} ردیف «جمع کل» حذف شد` : '',
    ].filter(Boolean);
    info.textContent = bits.join(' · ');
    // Show the first few rows as plain text so the choice of columns is visible before inserting.
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
    sheetPick ? el('div', { class: 'field' }, el('label', { for: '', text: 'برگه' }), sheetPick) : null,
    el('div', { class: 'field' }, el('span', { class: 'lab', text: 'ستون‌های گزارش' }), colBox),
    el(
      'div',
      { class: 'bank-opts' },
      toggle('mergeFees', 'ادغام کارمزد با تراکنش'),
      toggle('summary', 'خلاصهٔ بالای گزارش'),
      toggle('totalRow', 'ردیف جمع کل'),
      toggle('chart', 'جدول گردش ماهانه (برای نمودار)'),
      el('label', { class: 'check', for: 'bopt-min' }, 'حداقل مبلغ ', minInput),
    ),
    preview,
  );

  openModal({
    title: 'تبدیل اکسل بانکی به گزارش',
    body,
    wide: true,
    actions: [
      { label: 'انصراف', kind: '' },
      {
        label: 'ساخت سند گزارش',
        kind: 'primary',
        onClick: () => {
          if (!report || !report.rows.length) {
            notify('تراکنشی برای درج نیست.');
            return false;
          }
          insert(report, opts.chart ? monthlyTable(report.rows) : '');
        },
      },
    ],
  });
}

function insert(report, chart) {
  store.emit('before-import'); // keep a version of whatever was open
  const md = chart ? `${report.markdown}\n## گردش ماهانه\n\n${chart}\n` : report.markdown;
  store.set('webLayout', false);
  store.set('source', md);
  // This replaces the document, so the title comes from the statement; «before-import» kept a version.
  store.set('title', report.title);
  renderFromSource();
  store.set('dirty', true);
  store.emit('text:imported');
  notify(`گزارش با ${fa(report.rows.length)} تراکنش ساخته شد.`);
}

/** Lets editor/files.js hand spreadsheets over without importing this module (and its weight) first. */
export function initBankImport(register) {
  register({ test: (name) => SPREADSHEET_RE.test(name), open: openBankImport });
}
