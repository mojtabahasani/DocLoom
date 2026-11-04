// Bank-statement import. Every fixture here encodes a shape measured in a real export from
// Keshavarzi, Refah or Saderat — the header on row 15, reversed columns, bidi marks around
// times, two-digit Jalali years, amounts as comma text, and a «جمع کل» line at the bottom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { readWorkbook, parseCSV, colFromRef, decodeXML, isLegacyXls, SheetError } from '../src/js/bank/sheet-read.js';
import { cleanText, parseAmount, parseBankDate, parseTime, faAmount, excelSerialToJalali } from '../src/js/bank/normalize.js';
import { findHeaderRow, mapColumns, matchField, parseStatement, summarize, mergeFees, orderRecords, sourceDirection } from '../src/js/bank/bank-table.js';
import { buildReport, monthlyTable, describe, usefulColumns, guessBank, filterRecords } from '../src/js/bank/bank-report.js';
import { extractChartData } from '../src/js/content/chart.js';

// ---------------------------------------------------------------- normalize

test('cleanText drops bidi marks and Arabic letters but keeps ZWNJ', () => {
  assert.equal(cleanText('‭14:54‬'), '14:54'); // Refah wraps every time like this
  assert.equal(cleanText('كارمزد پاياپاي'), 'کارمزد پایاپای');
  assert.equal(cleanText('می‌رود'), 'می‌رود');
  assert.equal(cleanText('  a‎  b  '), 'a b');
  assert.equal(cleanText(null), '');
});

test('parseAmount reads every way a bank writes a number', () => {
  assert.equal(parseAmount(1234), 1234);
  assert.equal(parseAmount('1,234'), 1234);
  assert.equal(parseAmount('۱٬۲۳۴'), 1234);
  assert.equal(parseAmount('٣٤٥'), 345);
  assert.equal(parseAmount('1 234'), 1234);
  assert.equal(parseAmount('(1,200)'), -1200);
  assert.equal(parseAmount('-5,000'), -5000);
  assert.equal(parseAmount('−5,000'), -5000); // U+2212
  assert.equal(parseAmount('۱٬۲۳۴٫۵'), 1234.5);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('IR540610000001001003005013'), null);
  assert.equal(parseAmount('کارمزد'), null);
});

test('parseBankDate accepts two-digit Jalali years and Persian digits', () => {
  assert.deepEqual(parseBankDate('1405/07/13'), { y: 1405, m: 7, d: 13, key: 14050713, text: '1405/07/13' });
  assert.equal(parseBankDate('05/05/11').text, '1405/05/11'); // Keshavarzi's old export
  assert.equal(parseBankDate('۱۴۰۵/۰۸/۱۲').text, '1405/08/12');
  assert.equal(parseBankDate('1405-07-13').text, '1405/07/13');
  assert.equal(parseBankDate('1405/13/01'), null); // month 13 is not a date
  assert.equal(parseBankDate('نامعلوم'), null);
  assert.equal(parseBankDate(''), null);
});

test('Excel serial dates convert, and ordinary amounts are not mistaken for them', () => {
  assert.deepEqual(excelSerialToJalali(45000), { y: 1401, m: 12, d: 24 }); // 2023-03-15
  assert.equal(excelSerialToJalali(5000), null); // a 5,000-rial fee is not a date
  assert.equal(excelSerialToJalali(284000000), null);
});

test('parseTime normalises, and faAmount groups with Persian separators', () => {
  assert.equal(parseTime('‮18:11:17‬'), '18:11:17');
  assert.equal(parseTime('4:20'), '04:20');
  assert.equal(parseTime('garbage'), '');
  assert.equal(faAmount(12450), '۱۲٬۴۵۰');
  assert.equal(faAmount(-700), '-۷۰۰');
  assert.equal(faAmount(1234, { digits: 'latin' }), '1,234');
  assert.equal(faAmount(null), '');
});

// ---------------------------------------------------------------- sheet-read

const SHEET_XML = (rows) =>
  `<?xml version="1.0"?><worksheet><sheetData>${rows
    .map((cells, r) => `<row r="${r + 1}">${cells.map((c, i) => c).join('')}</row>`)
    .join('')}</sheetData></worksheet>`;

const sCell = (ref, idx) => `<c r="${ref}" t="s"><v>${idx}</v></c>`;
const nCell = (ref, n) => `<c r="${ref}"><v>${n}</v></c>`;

function miniXlsx() {
  const shared = ['تاریخ', 'واریز', 'برداشت', 'مانده', '1405/07/13', 'خرید & فروش'];
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0"?><workbook><sheets><sheet name="گردش" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/sharedStrings.xml': strToU8(
      `<?xml version="1.0"?><sst>${shared.map((s) => `<si><t>${s.replace(/&/g, '&amp;')}</t></si>`).join('')}</sst>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      SHEET_XML([
        [sCell('A1', 0), sCell('B1', 1), sCell('C1', 2), sCell('D1', 3)],
        [sCell('A2', 4), nCell('B2', 1000), nCell('C2', 0), nCell('D2', 5000)],
        [sCell('A3', 4), nCell('B3', 0), nCell('C3', 200), nCell('D3', 4800), `<c r="E3" t="inlineStr"><is><t>${'یادداشت'}</t></is></c>`],
      ]),
    ),
  };
  return zipSync(files);
}

test('xlsx: shared strings, inline strings, sheet name and numbers', () => {
  const wb = readWorkbook(miniXlsx(), 'test.xlsx');
  assert.equal(wb.format, 'xlsx');
  assert.equal(wb.sheets.length, 1);
  assert.equal(wb.sheets[0].name, 'گردش');
  const rows = wb.sheets[0].rows;
  assert.deepEqual(rows[0], ['تاریخ', 'واریز', 'برداشت', 'مانده']);
  assert.deepEqual(rows[1], ['1405/07/13', 1000, 0, 5000]);
  assert.equal(rows[2][4], 'یادداشت');
});

test('SpreadsheetML named .xls is read, not mistaken for a binary workbook', () => {
  const xml = `<?xml version="1.0"?><Workbook xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
    <Worksheet ss:Name="Sheet1"><Table>
      <Row><Cell><Data ss:Type="String">تاریخ</Data></Cell><Cell><Data ss:Type="String">برداشت</Data></Cell><Cell><Data ss:Type="String">مانده</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">05/05/11</Data></Cell><Cell><Data ss:Type="String">5,000</Data></Cell><Cell><Data ss:Type="Number">52404177</Data></Cell></Row>
    </Table></Worksheet></Workbook>`;
  const wb = readWorkbook(strToU8(xml), 'internet_bank_keshavarzi.xls');
  assert.equal(wb.format, 'spreadsheetml');
  assert.deepEqual(wb.sheets[0].rows[0], ['تاریخ', 'برداشت', 'مانده']);
  assert.equal(wb.sheets[0].rows[1][2], 52404177);
});

test('ss:Index leaves a gap instead of shifting the row', () => {
  const xml = `<Workbook><Worksheet ss:Name="S"><Table>
    <Row><Cell ss:Index="3"><Data ss:Type="String">سوم</Data></Cell></Row></Table></Worksheet></Workbook>`;
  const rows = readWorkbook(strToU8(xml), 'x.xml').sheets[0].rows;
  assert.equal(rows[0][2], 'سوم');
  assert.equal(rows[0][0] ?? null, null);
});

test('a damaged binary .xls says so instead of being half-parsed', () => {
  // The real BIFF8 path is covered in xls.test.mjs; this is the truncated-file case.
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
  assert.ok(isLegacyXls(ole));
  assert.throws(
    () => readWorkbook(ole, 'bankStatements.xls'),
    (e) => e instanceof SheetError && e.code === 'bad-xls' && /xlsx/.test(e.message),
  );
});

test('CSV: BOM, delimiter sniffing and quoted fields', () => {
  const wb = readWorkbook(strToU8('﻿تاریخ;شرح;واریز\n1405/01/01;"خرید; نقدی";1,000\n'), 'x.csv');
  assert.equal(wb.format, 'csv');
  assert.deepEqual(wb.sheets[0].rows[0], ['تاریخ', 'شرح', 'واریز']);
  assert.equal(wb.sheets[0].rows[1][1], 'خرید; نقدی');
});

test('xml entities and column references', () => {
  assert.equal(decodeXML('a &amp; b &#x200c; &lt;c&gt;'), 'a & b ‌ <c>');
  assert.equal(colFromRef('A1'), 0);
  assert.equal(colFromRef('Z9'), 25);
  assert.equal(colFromRef('AA1'), 26);
  assert.equal(colFromRef('BC12'), 54);
  assert.deepEqual(parseCSV('a,b\n1,2\n')[1], ['1', '2']);
});

// ---------------------------------------------------------------- bank-table

test('column names map to fields, and «شناسه واریز» is not «واریز»', () => {
  assert.equal(matchField('شناسه واریز'), 'payId');
  assert.equal(matchField('واریز'), 'deposit');
  assert.equal(matchField('بستانکار'), 'deposit');
  assert.equal(matchField('برداشت'), 'withdraw');
  assert.equal(matchField('موجودی'), 'balance');
  assert.equal(matchField('مانده'), 'balance');
  assert.equal(matchField('کدپیگیری'), 'track');
  assert.equal(matchField('شماره حساب/کارت مبدا'), 'srcAccount');
  assert.equal(matchField('شماره حساب/کارت مقصد'), 'dstAccount');
  assert.equal(matchField('ساعت'), 'time');
  assert.equal(matchField('هیچ'), null);
});

const HEADER = ['ردیف', 'تاریخ', 'زمان', 'شرح', 'واریز', 'برداشت', 'مانده'];
const sheet = (...rows) => rows;

test('the header is found wherever it sits, including under a 15-row preamble', () => {
  assert.equal(findHeaderRow(sheet(HEADER)).index, 0);
  assert.equal(findHeaderRow(sheet([], ['نام مشتری : مجتبی'], HEADER)).index, 2);
  const deep = [...Array(15).fill([]), HEADER];
  deep[8] = ['نام مشتری: مجتبی حسنی'];
  assert.equal(findHeaderRow(deep).index, 15);
  assert.equal(findHeaderRow(sheet(['a', 'b', 'c'], ['1', '2', '3'])).index, -1);
});

test('reversed column order is handled, because columns are matched by name', () => {
  const reversed = ['یادداشت', 'مانده', 'شرح', 'برداشت', 'واریز', 'زمان', 'تاریخ', 'ردیف'];
  const { map } = mapColumns(reversed);
  assert.equal(map.balance, 1);
  assert.equal(map.withdraw, 3);
  assert.equal(map.deposit, 4);
  assert.equal(map.date, 6);
});

test('a statement parses: amounts, dates, a dropped total row, and recomputed sums', () => {
  const st = parseStatement(
    sheet(
      ['نام مشتری : مجتبی حسنی شماره حساب : 80854620'],
      HEADER,
      ['1', '1405/06/05', '‭06:43‬', 'پایا', '1,000,000', '0', '194,310,958'],
      ['2', '1405/06/06', '08:00', 'کارمزد', '0', '700', '194,310,258'],
      ['', '', '', 'جمع کل', '1,000,000', '700', ''],
    ),
  );
  assert.equal(st.ok, true);
  assert.equal(st.headerIndex, 1);
  assert.equal(st.records.length, 2);
  assert.equal(st.dropped.total, 1, 'the «جمع کل» line is not a transaction');
  assert.equal(st.meta.holder, 'مجتبی حسنی');
  assert.equal(st.meta.account, '80854620');
  assert.equal(st.records[0].time, '06:43');
  assert.equal(st.records[0].deposit, 1000000);
  const s = summarize(st.records);
  assert.equal(s.deposit, 1000000);
  assert.equal(s.withdraw, 700);
  assert.equal(s.net, 999300);
  assert.equal(s.closing, 194310258);
  assert.equal(s.from.text, '1405/06/05');
});

test('an account number repeated on every row becomes metadata, not a column', () => {
  const st = parseStatement(
    sheet(
      ['شماره حساب', 'تاریخ', 'واریز', 'برداشت', 'مانده'],
      ['410457631', '1405/07/12', '0', '700', '100'],
      ['410457631', '1405/07/13', '500', '0', '600'],
    ),
  );
  assert.equal(st.meta.account, '410457631');
  assert.equal(st.columns.account, undefined);
  assert.ok(st.records.every((r) => r.account === ''));
});

test('a newest-first file is reordered so the running balance stays consistent', () => {
  // Both rows share a timestamp: the fee is listed first because the file is newest-first.
  const st = parseStatement(
    sheet(
      ['تاریخ', 'زمان', 'کدپیگیری', 'واریز', 'برداشت', 'موجودی', 'شرح'],
      ['1405/07/13', '05:05:52', '738072', '0', '49800', '313215488', 'کارمزد'],
      ['1405/07/13', '05:05:52', '738072', '223500000', '0', '313265288', 'واریز پایا'],
      ['1405/07/12', '18:15:34', '733618', '0', '700', '89765288', 'کارمزد'],
      ['1405/07/12', '18:15:34', '733618', '0', '259630000', '89765988', 'انتقال'],
    ),
  );
  assert.equal(st.sourceDir, 'desc');
  const b = st.records.map((r) => r.balance);
  for (let i = 1; i < st.records.length; i++) {
    const prev = st.records[i - 1];
    const cur = st.records[i];
    assert.equal(prev.balance + cur.deposit - cur.withdraw, cur.balance, `chain breaks at row ${i} (${b.join(',')})`);
  }
});

test('fee lines fold into the transaction they belong to', () => {
  const st = parseStatement(
    sheet(
      ['تاریخ', 'زمان', 'کدپیگیری', 'واریز', 'برداشت', 'مانده', 'شرح'],
      ['1405/07/12', '18:15:34', '733618', '0', '259630000', '89765988', 'انتقال به حساب'],
      ['1405/07/12', '18:15:34', '733618', '0', '700', '89765288', 'کارمزد حساب به حساب'],
      ['1405/07/13', '09:00:00', '999999', '500000', '0', '90265288', 'واریز'],
    ),
  );
  const merged = mergeFees(st.records);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].withdraw, 259630700);
  assert.equal(merged[0].fee, 700);
  assert.equal(merged[0].balance, 89765288, 'the later balance wins');
  assert.equal(merged[1].withdraw, 0);
});

test('orderRecords keeps undated rows where they were', () => {
  const recs = [
    { source: 0, date: null, time: '' },
    { source: 1, date: { key: 14050101 }, time: '10:00' },
    { source: 2, date: { key: 14050102 }, time: '09:00' },
  ];
  orderRecords(recs, 'asc', 'asc');
  assert.deepEqual(recs.map((r) => r.source), [0, 1, 2]);
  assert.equal(sourceDirection([{ date: { key: 2 } }, { date: { key: 1 } }]), 'desc');
});

// ---------------------------------------------------------------- bank-report

const statementOf = (...rows) => parseStatement(sheet(HEADER, ...rows));

test('the report carries the account details, a summary callout and a totals row', () => {
  const st = parseStatement(
    sheet(
      ['نام مشتری : مجتبی حسنی شماره حساب : 0107863686001 شعبه : سردار سلیمانی'],
      HEADER,
      ['1', '1405/05/12', '10:00', 'واریز پایا', '27,700,000', '0', '34,389,244'],
      ['2', '1405/06/01', '11:00', 'خرید', '0', '771,000', '33,618,244'],
    ),
  );
  const rep = buildReport({ statement: st, options: { bank: 'صادرات' } });
  assert.match(rep.markdown, /^# صورت‌حساب بانک صادرات$/m);
  assert.match(rep.markdown, /\*\*نام:\*\* مجتبی حسنی/);
  assert.match(rep.markdown, /\*\*شماره حساب:\*\* ۰۱۰۷۸۶۳۶۸۶۰۰۱/);
  assert.match(rep.markdown, /> \[!نکته\].*جمع واریز \*\*۲۷٬۷۰۰٬۰۰۰\*\*/);
  assert.match(rep.markdown, /\| \*\*جمع کل\*\* \|/);
  assert.equal(rep.rows.length, 2);
  // The two detail lines sit next to each other so MD2Html renders them as one <br>-joined
  // paragraph, and a blank line separates every block from the next.
  const lines = rep.markdown.split('\n');
  const nameAt = lines.findIndex((l) => l.startsWith('**نام:**'));
  assert.ok(nameAt > 0);
  assert.match(lines[nameAt + 1], /^\*\*بازه:\*\*/);
  assert.equal(lines[nameAt + 2], '');
  assert.equal(lines[lines.findIndex((l) => l.startsWith('| تاریخ')) - 1], '');
});

test('the table is valid MD2Html Markdown: a pipe in a description does not break the row', () => {
  const st = statementOf(['1', '1405/05/12', '10:00', 'خرید | نقدی', '100', '0', '100']);
  const rep = buildReport({ statement: st });
  const row = rep.markdown.split('\n').find((l) => l.includes('خرید'));
  assert.ok(row.includes('\\|'), 'the pipe is escaped');
  assert.equal(row.split(/(?<!\\)\|/).length - 2, rep.columns.length, 'the row still has one cell per column');
});

test('empty columns are dropped and «شرح» falls back to the transaction type', () => {
  assert.equal(describe({ desc: '050525121199202506090002583400', kind: 'شاپرک - تجمیعی' }), 'شاپرک - تجمیعی');
  assert.equal(describe({ desc: '- واریزپایا', kind: '' }), 'واریزپایا');
  assert.equal(describe({ desc: 'انتقال', kind: 'حواله' }), 'حواله — انتقال');
  assert.equal(describe({ desc: 'حواله پل', kind: 'حواله پل' }), 'حواله پل');
  const recs = [{ date: { text: '1405/01/01' }, deposit: 1, withdraw: 0, balance: null, desc: '', kind: '' }];
  assert.deepEqual(usefulColumns(recs, ['date', 'desc', 'deposit', 'withdraw', 'balance']), ['date', 'deposit']);
});

test('filters keep a date range and hide small fee rows', () => {
  const st = statementOf(
    ['1', '1405/05/12', '10:00', 'الف', '1,000,000', '0', '1,000,000'],
    ['2', '1405/06/01', '10:00', 'کارمزد', '0', '700', '999,300'],
    ['3', '1405/07/01', '10:00', 'ب', '0', '500,000', '499,300'],
  );
  assert.equal(filterRecords(st.records, { minAmount: 1000 }).length, 2);
  assert.equal(filterRecords(st.records, { from: 14050601, to: 14050701 }).length, 2);
});

test('the monthly table really is chartable by the app', () => {
  const st = statementOf(
    ['1', '1405/05/12', '10:00', 'الف', '27,700,000', '0', '27,700,000'],
    ['2', '1405/05/20', '10:00', 'ب', '0', '700,000', '27,000,000'],
    ['3', '1405/06/01', '10:00', 'ج', '12,000,000', '0', '39,000,000'],
  );
  const md = monthlyTable(st.records);
  const rows = md
    .split('\n')
    .filter((l) => l.startsWith('|') && !/^\s*\|[\s:|-]+\|\s*$/.test(l))
    .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  const data = extractChartData(rows);
  assert.ok(data, 'the chart button must accept this table');
  assert.deepEqual(data.labels, ['۱۴۰۵/۰۵', '۱۴۰۵/۰۶']);
  assert.equal(data.series.length, 2);
  assert.deepEqual(data.series[0].values, [27.7, 12]);
  for (const s of data.series) assert.match(s.name, /میلیون ریال/);
});

test('the bank is guessed from the file name', () => {
  assert.equal(guessBank('internet_bank_keshavarzi_1405.xls'), 'کشاورزی');
  assert.equal(guessBank('mehr13-refah.xlsx'), 'رفاه');
  assert.equal(guessBank('تا۱۲مهر- صادرات.xlsx'), 'صادرات');
  assert.equal(guessBank('bankStatements.xls'), '');
});

test('an unreadable sheet reports why instead of producing an empty report', () => {
  const st = parseStatement(sheet(['a', 'b', 'c'], ['1', '2', '3']));
  assert.equal(st.ok, false);
  assert.equal(st.reason, 'no-header');
});
