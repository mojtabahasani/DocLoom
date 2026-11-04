// "Bank Excel -> printed statement": the drawer between a bank export and the document.
// The table layout is fixed (رج · زمان · شرح عملیات · واریز · برداشت · مانده), so there is no
// column picker — only the choices that change what is in the report, not how it looks.
import { store } from '../core/store.js';
import { el } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { openModal } from '../ui/modal.js';
import { preview, setContent, applyLook } from '../editor/preview.js';
import { sanitizeToFragment } from '../content/sanitize.js';
import { readWorkbook, SheetError } from './sheet-read.js';
import { parseStatement } from './bank-table.js';
import { guessBank, monthlyTable } from './bank-report.js';
import { buildStatementHTML } from './statement-html.js';
import { toFaDigits } from './normalize.js';
import { markdownToHTML } from '../content/markdown.js';

export const SPREADSHEET_RE = /\.(xlsx|xlsm|xls|csv|xml)$/i;
export const MAX_SHEET_BYTES = 12 * 1024 * 1024;

const fa = (n) => toFaDigits(String(n));

/** Read a File and hand back every sheet that looks like a statement. */
async function readStatements(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const wb = readWorkbook(bytes, file.name);
  return wb.sheets.map((sheet) => ({ sheet, statement: parseStatement(sheet.rows) })).filter((s) => s.statement.ok);
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
  const opts = { sort: 'asc', mergeFees: false, summary: true, legend: true, totalRow: true, digits: 'fa', chart: false, minAmount: 0 };

  const info = el('p', { class: 'modal-note bank-info' });
  const shot = el('div', { class: 'bank-preview' });

  const toggle = (key, label) => {
    const id = 'bopt-' + key;
    const input = el('input', { type: 'checkbox', id, ...(opts[key] ? { checked: true } : {}) });
    input.addEventListener('change', () => {
      opts[key] = input.checked;
      refresh();
    });
    return el('label', { class: 'check', for: id }, input, ' ' + label);
  };

  // Oldest-first reads like a ledger; newest-first is what the bank's own page shows.
  const sortPick = el(
    'select',
    { class: 'lib-sort', id: 'bopt-sort', 'aria-label': 'ترتیب ردیف‌ها' },
    el('option', { value: 'asc', text: 'قدیمی‌ترین در بالا' }),
    el('option', { value: 'desc', text: 'تازه‌ترین در بالا' }),
  );
  sortPick.addEventListener('change', () => {
    opts.sort = sortPick.value;
    refresh();
  });

  const minInput = el('input', { type: 'number', min: '0', step: '1000', value: '0', dir: 'ltr', id: 'bopt-min', 'aria-label': 'حداقل مبلغ' });
  minInput.addEventListener('input', () => {
    opts.minAmount = Math.max(0, Number(minInput.value) || 0);
    refresh();
  });

  const sheetPick =
    found.length > 1
      ? el('select', { class: 'lib-sort', 'aria-label': 'برگه' }, ...found.map((f, i) => el('option', { value: String(i), text: f.sheet.name })))
      : null;
  sheetPick?.addEventListener('change', () => {
    pick = found[Number(sheetPick.value)];
    refresh();
  });

  let report = null;
  function refresh() {
    report = buildStatementHTML({ statement: pick.statement, options: { ...opts, bank } });
    const st = pick.statement;
    const s = report.summary;
    info.textContent = [
      bank ? `بانک ${bank}` : 'بانک ناشناس',
      `${fa(report.rows.length)} تراکنش`,
      s.from && s.to ? `${toFaDigits(s.from.text)} تا ${toFaDigits(s.to.text)}` : '',
      st.dropped.total ? `${fa(st.dropped.total)} ردیف «جمع کل» حذف شد` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    // A live sample of the real thing, styles and all — six rows is enough to judge it.
    const sample = buildStatementHTML({
      statement: { ...st, records: report.rows.slice(0, 6) },
      options: { ...opts, bank, summary: false, legend: false, totalRow: false },
    });
    shot.replaceChildren(sanitizeToFragment(sample.html.slice(sample.html.indexOf('<table'))));
  }
  refresh();

  const body = el(
    'div',
    { class: 'bank-wrap' },
    info,
    sheetPick ? el('div', { class: 'field' }, el('span', { class: 'lab', text: 'برگه' }), sheetPick) : null,
    el('div', { class: 'field' }, el('label', { class: 'lab', for: 'bopt-sort', text: 'ترتیب ردیف‌ها' }), sortPick),
    el(
      'div',
      { class: 'bank-opts' },
      toggle('mergeFees', 'ادغام کارمزد با تراکنش'),
      toggle('summary', 'خلاصهٔ بالای گزارش'),
      toggle('legend', 'راهنمای رنگ گروه‌ها'),
      toggle('totalRow', 'ردیف جمع کل'),
      toggle('chart', 'جدول گردش ماهانه (برای نمودار)'),
      el('label', { class: 'check', for: 'bopt-min' }, 'حداقل مبلغ ', minInput),
    ),
    shot,
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

function insert(report, chartTable) {
  store.emit('before-import'); // keep a version of whatever was open
  const extra = chartTable ? `<h2>گردش ماهانه</h2>${markdownToHTML(chartTable)}` : '';
  store.set('webLayout', false);
  store.set('source', ''); // the document is HTML now; the Markdown box would only mislead
  setContent(sanitizeToFragment(report.html + extra), { reset: true });
  store.set('title', report.title);
  applyLook();
  store.set('dirty', true);
  store.emit('text:imported');
  notify(`گزارش با ${fa(report.rows.length)} تراکنش ساخته شد.`);
}

/** Lets editor/files.js hand spreadsheets over without importing this module (and its weight) first. */
export function initBankImport(register) {
  register({ test: (name) => SPREADSHEET_RE.test(name), open: openBankImport });
}
