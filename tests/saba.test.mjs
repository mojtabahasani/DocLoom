// FastReport .fp3 import. The fixtures below are cut down from real Saba reports: the band
// shapes, the global memo numbering and the geometry are the same, the data is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFp3, isFp3, dataBand, bandColumns, bandCounts, Fp3Error } from '../src/js/saba/fp3.js';
import { buildTable, pruneEmpty, matchHeader, labelPairs } from '../src/js/saba/fp3-table.js';
import { buildSabaReport, columnTotals } from '../src/js/saba/saba-report.js';
import { cleanText } from '../src/js/bank/normalize.js';

const memo = (name, left, width, extra = '') =>
  `<TfrxMemoView Name="${name}" Left="${left}" Top="1" Width="${width}" Height="19" ${extra}/>`;
const m = (i, u) => `<m${i} u="${u}"/>`;

/** A ledger: MasterData rows under a ColumnHeader that also holds page furniture. */
const LEDGER = `<?xml version="1.0" encoding="utf-8"?><preparedreport><previewpages><page0>
<b2 t="0">${m(8, 'نمايش دفتر حساب')}${m(9, 'سند')}${m(10, 'تاريخ')}${m(11, 'شرح سند')}${m(12, 'بدهکار')}${m(13, 'بستانکار')}${m(14, 'مانده')}${m(15, 'تاريخ :')}${m(16, '1405/08/13')}${m(17, 'شماره صفحه :')}${m(18, '1')}</b2>
<b1 t="86">${m(1, '2')}${m(2, '1404/01/01')}${m(3, 'مانده حساب نقل از سال مالي قبل')}${m(4, '2,833,618,600')}${m(5, '')}${m(6, '2,833,618,600')}${m(7, 'بد')}</b1>
<b1 t="109">${m(1, '4683')}${m(2, '1404/01/05')}${m(3, 'بابت يخچال فريزر')}${m(4, '100,000,000')}${m(5, '')}${m(6, '2,933,618,600')}${m(7, 'بد')}</b1>
<b1 t="132">${m(1, '4700')}${m(2, '1404/02/02')}${m(3, 'فروش')}${m(4, '')}${m(5, '50,000,000')}${m(6, '2,883,618,600')}${m(7, 'بس')}</b1>
<b3 t="200">${m(19, 'جـــمـــع :')}${m(20, '2,983,618,600')}${m(21, 'کاربر: مجتبي حسني')}</b3>
</page0></previewpages><sourcepages><TfrxReportPage>
<TfrxMasterData Name="MasterData1">
${memo('Memo1', 728, 60, 'HAlign="haCenter"')}${memo('Memo2', 647, 79, 'HAlign="haCenter"')}${memo('Memo3', 323, 321, 'HAlign="haRight"')}
${memo('Memo4', 224, 94, 'HAlign="haRight"')}${memo('Memo5', 126, 94, 'HAlign="haRight"')}${memo('Memo6', 30, 94, 'HAlign="haRight"')}${memo('Memo7', 8, 23, 'HAlign="haRight"')}
</TfrxMasterData>
<TfrxColumnHeader Name="ColumnHeader1">
<TfrxMemoView Name="Title" Left="153" Top="4" Width="616" Height="19" HAlign="haRight"/>
<TfrxMemoView Name="H1" Left="730" Top="40" Width="42" Height="19" HAlign="haCenter"/>
<TfrxMemoView Name="H2" Left="654" Top="40" Width="68" Height="19" HAlign="haCenter"/>
<TfrxMemoView Name="H3" Left="391" Top="40" Width="140" Height="19" HAlign="haCenter"/>
<TfrxMemoView Name="H4" Left="234" Top="40" Width="79" Height="19" HAlign="haCenter"/>
<TfrxMemoView Name="H5" Left="134" Top="40" Width="68" Height="19" HAlign="haCenter"/>
<TfrxMemoView Name="H6" Left="32" Top="40" Width="68" Height="19" HAlign="haCenter"/>
<TfrxMemoView Name="L1" Left="106" Top="4" Width="38" Height="19"/>
<TfrxMemoView Name="V1" Left="11" Top="4" Width="94" Height="19" HAlign="haRight"/>
<TfrxMemoView Name="L2" Left="70" Top="22" Width="76" Height="19"/>
<TfrxMemoView Name="V2" Left="11" Top="22" Width="57" Height="19" HAlign="haRight"/>
</TfrxColumnHeader>
<TfrxReportSummary Name="ReportSummary1">
<TfrxMemoView Name="S1" Left="325" Top="1" Width="49" Height="19"/>
<TfrxMemoView Name="S2" Left="224" Top="1" Width="98" Height="19" HAlign="haRight"/>
<TfrxMemoView Name="S3" Left="8" Top="20" Width="367" Height="19"/>
</TfrxReportSummary>
</TfrxReportPage></sourcepages></preparedreport>`;

test('an fp3 is recognised and its template is numbered globally', () => {
  assert.ok(isFp3(LEDGER));
  assert.ok(!isFp3('<?xml version="1.0"?><Workbook/>'));
  const doc = readFp3(LEDGER);
  assert.equal(doc.bands.length, 3);
  assert.deepEqual(doc.bands.map((b) => b.kind), ['data', 'header', 'summary']);
  assert.equal(doc.memos.length, 21);
  assert.equal(doc.memos[0].name, 'Memo1'); // m1 is the first memo of the first band
  assert.equal(doc.memos[7].name, 'Title'); // m8 continues into the next band
  assert.equal(doc.memos[7].band, 2);
});

test('the repeating MasterData band is the data band', () => {
  const doc = readFp3(LEDGER);
  assert.equal(dataBand(doc), 1);
  assert.equal(bandCounts(doc).get(1), 3);
  assert.deepEqual(bandColumns(doc, 1).map((c) => c.left), [728, 647, 323, 224, 126, 30, 8]);
});

test('a page-wide title is not mistaken for a column heading', () => {
  const column = { left: 224, width: 94, top: 1, height: 19 };
  const wide = { i: 1, left: 153, width: 616, top: 4, height: 19, text: 'نمایش دفتر حساب' };
  const real = { i: 2, left: 234, width: 79, top: 40, height: 19, text: 'بدهکار' };
  assert.equal(matchHeader(column, [wide]), null, 'the 616-wide banner covers the column but is far too wide');
  assert.equal(matchHeader(column, [wide, real]), real);
});

test('the ledger rebuilds into a titled table with the right columns', () => {
  const t = pruneEmpty(buildTable(LEDGER));
  assert.equal(t.ok, true);
  assert.equal(t.title, 'نمایش دفتر حساب');
  assert.deepEqual(t.columns.map((c) => c.label), ['سند', 'تاریخ', 'شرح سند', 'بدهکار', 'بستانکار', 'مانده', '']);
  assert.equal(t.rows.length, 3);
  assert.deepEqual(t.rows[0], ['2', '1404/01/01', 'مانده حساب نقل از سال مالی قبل', '2,833,618,600', '', '2,833,618,600', 'بد']);
  // The page number lives in the header band but is a label/value pair, not a column heading.
  assert.deepEqual(t.meta, [{ label: 'تاریخ', value: '1405/08/13' }, { label: 'شماره صفحه', value: '1' }]);
  assert.deepEqual(t.totals, [{ label: 'جمع', value: '2,983,618,600' }]);
});

test('«برچسب:» is paired with the box immediately to its left', () => {
  const memos = [
    { i: 1, left: 701, top: 0, width: 57, height: 19 },
    { i: 2, left: 639, top: 0, width: 61, height: 19 },
    { i: 3, left: 400, top: 60, width: 50, height: 19 }, // far away, different row
  ];
  const values = new Map([[1, 'کدمشتري:'], [2, '10927'], [3, 'بي ربط']]);
  assert.deepEqual(labelPairs(memos, values), [{ label: 'کدمشتری', value: '10927' }]);
  // Something that carries its own colon is nobody else's value.
  assert.deepEqual(labelPairs([memos[0], { i: 4, left: 600, top: 0, width: 100, height: 19 }], new Map([[1, 'مانده :'], [4, 'کاربر: مجتبی']])), []);
});

test('tatweel is stripped so stretched headings read normally', () => {
  assert.equal(cleanText('فـاکـتـور فـروش'), 'فاکتور فروش');
  assert.equal(cleanText('جـــمـــع :'), 'جمع :');
});

test('the report is MD2Html Markdown with Persian amounts and an unlabelled side column named', () => {
  const rep = buildSabaReport({ xml: LEDGER });
  assert.match(rep.markdown, /^# نمایش دفتر حساب$/m);
  assert.match(rep.markdown, /\*\*تاریخ:\*\* ۱۴۰۵\/۰۸\/۱۳/);
  assert.match(rep.markdown, /\| تشخیص \|/, 'the بد/بس column gets its accounting name');
  assert.match(rep.markdown, /۲٬۸۳۳٬۶۱۸٬۶۰۰/, 'money is regrouped with «٬»');
  assert.match(rep.markdown, /> \[!نکته\] جمع: \*\*۲٬۹۸۳٬۶۱۸٬۶۰۰\*\*/);
  // One cell per column on every row.
  const rows = rep.markdown.split('\n').filter((l) => l.startsWith('|'));
  const width = rows[0].split('|').length;
  for (const r of rows) assert.equal(r.split('|').length, width, r);
});

test('codes keep their plain form while money is regrouped', () => {
  const t = pruneEmpty(buildTable(LEDGER));
  const sand = t.columns[0]; // «سند» holds 2 / 4683 / 4700 — no separators in the source
  assert.equal(sand.numeric, true);
  assert.equal(sand.money, false);
  assert.equal(t.columns[3].money, true); // «بدهکار»
  const rep = buildSabaReport({ xml: LEDGER });
  assert.match(rep.markdown, /\| ۴۶۸۳ \|/, 'a document number is not «۴٬۶۸۳»');
});

test('a Latin product name keeps its own digits', () => {
  const xml = LEDGER.replace('بابت يخچال فريزر', 'CPU AMD RYZEN 7800 X3D');
  const rep = buildSabaReport({ xml });
  assert.match(rep.markdown, /CPU AMD RYZEN 7800 X3D/);
  assert.ok(!rep.markdown.includes('X۳D'));
});

test('columns chosen by index survive into the report', () => {
  const t = pruneEmpty(buildTable(LEDGER));
  const rep = buildSabaReport({ table: t, options: { columns: [1, 3], heading: false, meta: false, notes: false, totals: false } });
  const header = rep.markdown.split('\n').find((l) => l.startsWith('|'));
  assert.equal(header, '| تاریخ | بدهکار |');
});

test('column totals skip id columns and keep money ones', () => {
  const t = pruneEmpty(buildTable(LEDGER));
  const totals = columnTotals(t);
  assert.deepEqual(totals.map((x) => x.label), ['بدهکار', 'بستانکار', 'مانده']);
  assert.equal(totals[0].sum, 2933618600);
});

test('a file that is not an fp3, or has no rows, says so', () => {
  assert.throws(() => readFp3('<html></html>'), Fp3Error);
  assert.throws(() => readFp3('<preparedreport><previewpages></previewpages></preparedreport>'), Fp3Error);
  const empty = LEDGER.replace(/<b1 t="\d+">[\s\S]*?<\/b1>/g, '');
  assert.equal(buildTable(empty).ok, false);
});
