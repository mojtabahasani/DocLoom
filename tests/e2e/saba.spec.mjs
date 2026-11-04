// Dropping a Saba (FastReport) .fp3 on the app and getting a clean document out of it.
import { test, expect } from '@playwright/test';
import { openApp } from './helpers.mjs';

const m = (i, u) => `<m${i} u="${u}"/>`;
const memo = (name, left, top, width, extra = '') =>
  `<TfrxMemoView Name="${name}" Left="${left}" Top="${top}" Width="${width}" Height="19" ${extra}/>`;

/** A small ledger with the Arabic ي/ك and tatweel a real Saba export carries. */
const FP3 = `<?xml version="1.0" encoding="utf-8"?><preparedreport><previewpages><page0>
<b2 t="0">${m(8, 'نمايش دفتر حساب')}${m(9, 'سند')}${m(10, 'تاريخ')}${m(11, 'شرح سند')}${m(12, 'بدهکار')}${m(13, 'بستانکار')}${m(14, 'مانده')}${m(15, 'تاريخ :')}${m(16, '1405/08/13')}</b2>
<b1 t="86">${m(1, '2')}${m(2, '1404/01/01')}${m(3, 'مانده حساب نقل از سال مالي قبل')}${m(4, '2,833,618,600')}${m(5, '')}${m(6, '2,833,618,600')}${m(7, 'بد')}</b1>
<b1 t="109">${m(1, '4683')}${m(2, '1404/01/05')}${m(3, 'CPU AMD RYZEN 7800 X3D')}${m(4, '100,000,000')}${m(5, '')}${m(6, '2,933,618,600')}${m(7, 'بد')}</b1>
<b3 t="200">${m(17, 'جـــمـــع :')}${m(18, '2,933,618,600')}</b3>
</page0></previewpages><sourcepages><TfrxReportPage>
<TfrxMasterData Name="MasterData1">
${memo('Memo1', 728, 1, 60, 'HAlign="haCenter"')}${memo('Memo2', 647, 1, 79, 'HAlign="haCenter"')}${memo('Memo3', 323, 1, 321, 'HAlign="haRight"')}
${memo('Memo4', 224, 1, 94, 'HAlign="haRight"')}${memo('Memo5', 126, 1, 94, 'HAlign="haRight"')}${memo('Memo6', 30, 1, 94, 'HAlign="haRight"')}${memo('Memo7', 8, 1, 23, 'HAlign="haRight"')}
</TfrxMasterData>
<TfrxColumnHeader Name="ColumnHeader1">
${memo('Title', 153, 4, 616, 'HAlign="haRight"')}
${memo('H1', 730, 40, 42, 'HAlign="haCenter"')}${memo('H2', 654, 40, 68, 'HAlign="haCenter"')}${memo('H3', 391, 40, 140, 'HAlign="haCenter"')}
${memo('H4', 234, 40, 79, 'HAlign="haCenter"')}${memo('H5', 134, 40, 68, 'HAlign="haCenter"')}${memo('H6', 32, 40, 68, 'HAlign="haCenter"')}
${memo('L1', 106, 4, 38)}${memo('V1', 11, 4, 94, 'HAlign="haRight"')}
</TfrxColumnHeader>
<TfrxReportSummary Name="ReportSummary1">
${memo('S1', 325, 1, 49)}${memo('S2', 224, 1, 98, 'HAlign="haRight"')}
</TfrxReportSummary>
</TfrxReportPage></sourcepages></preparedreport>`;

const upload = (page, name = 'گزارش سند.fp3') =>
  page.setInputFiles('#file', { name, mimeType: 'application/xml', buffer: Buffer.from(FP3, 'utf8') });

test('an fp3 opens the Saba importer with the title and the row count', async ({ page }) => {
  await openApp(page);
  await upload(page);
  const info = page.locator('.bank-info');
  await expect(info).toBeVisible();
  await expect(info).toContainText('نمایش دفتر حساب');
  await expect(info).toContainText('۲ ردیف');
  await expect(page.locator('.bank-pre')).toContainText('بدهکار');
});

test('the document comes out with clean Persian and a real table', async ({ page }) => {
  await openApp(page);
  await upload(page);
  await page.getByRole('button', { name: 'ساخت سند گزارش' }).click();

  const p = page.locator('#preview');
  await expect(p.locator('h1')).toHaveCount(1);
  await expect(p.locator('h1')).toContainText('نمایش دفتر حساب');

  // The Arabic letters and the tatweel the exporter wrote are gone.
  await expect(p).not.toContainText('نمايش');
  await expect(p).not.toContainText('ي');
  await expect(p).not.toContainText('جـــمـــع');

  const head = p.locator('table thead');
  await expect(head).toContainText('بدهکار');
  await expect(head).toContainText('تشخیص'); // the unlabelled بد/بس column gets named
  await expect(p.locator('table tbody tr')).toHaveCount(2);

  // Money regrouped with «٬»; a Latin product name keeps its own digits.
  await expect(p.locator('table')).toContainText('۲٬۸۳۳٬۶۱۸٬۶۰۰');
  await expect(p.locator('table')).toContainText('CPU AMD RYZEN 7800 X3D');
  await expect(p.locator('table')).not.toContainText('2,833,618,600');
  await expect(p.locator('.callout-note')).toContainText('جمع');
});

test('columns can be dropped before the document is made', async ({ page }) => {
  await openApp(page);
  await upload(page);
  // «بستانکار» is empty on every row of this fixture, so it is already gone: the surviving
  // columns are سند · تاریخ · شرح سند · بدهکار · مانده · (the بد/بس marker).
  await expect(page.locator('.bank-info')).toContainText('۶ ستون');
  await page.uncheck('#scol-4'); // مانده
  await page.uncheck('#scol-5'); // the بد/بس marker
  await expect(page.locator('.bank-info')).toContainText('۴ ستون');
  await page.getByRole('button', { name: 'ساخت سند گزارش' }).click();
  const head = page.locator('#preview table thead');
  await expect(head).not.toContainText('مانده');
  await expect(head).not.toContainText('تشخیص');
  await expect(head).toContainText('بدهکار');
});

test('a file that is not a prepared report is reported, not half-imported', async ({ page }) => {
  await openApp(page);
  await page.setInputFiles('#file', { name: 'broken.fp3', mimeType: 'application/xml', buffer: Buffer.from('<html>nope</html>', 'utf8') });
  await expect(page.locator('#status .status-text')).toContainText('فست‌ریپورت');
  await expect(page.locator('.bank-info')).toHaveCount(0);
});
