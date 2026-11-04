// Dropping a bank export on the app and getting a printable report out of it.
import { test, expect } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { openApp } from './helpers.mjs';

/** A small statement shaped like Saderat's: two header rows above the real header. */
function bankXlsx() {
  const shared = [
    'نام : مجتبی حسنی', 'شماره حساب 0107863686001', 'شعبه سردار سلیمانی',
    'ردیف', 'تاریخ', 'زمان', 'نوع تراکنش', 'شرح', 'واریز', 'برداشت', 'مانده',
    '1405/05/12', '10:00:00', 'واریز پایا', 'حقوق مهر',
    '1405/05/13', '11:30:00', 'کارمزد', '',
    '1405/06/02', '09:15:00', 'خرید اینترنتی', 'فروشگاه',
  ];
  const s = (ref, i) => `<c r="${ref}" t="s"><v>${i}</v></c>`;
  const n = (ref, v) => `<c r="${ref}"><v>${v}</v></c>`;
  const rows = [
    [s('A1', 0), s('C1', 1), s('E1', 2)],
    [],
    [s('A3', 3), s('B3', 4), s('C3', 5), s('D3', 6), s('E3', 7), s('F3', 8), s('G3', 9), s('H3', 10)],
    [n('A4', 1), s('B4', 11), s('C4', 12), s('D4', 13), s('E4', 14), n('F4', 27700000), n('G4', 0), n('H4', 27700000)],
    // The fee shares the transfer's date and time, exactly as the banks write it.
    [n('A5', 2), s('B5', 11), s('C5', 12), s('D5', 17), s('E5', 18), n('F5', 0), n('G5', 700), n('H5', 27699300)],
    [n('A6', 3), s('B6', 19), s('C6', 20), s('D6', 21), s('E6', 22), n('F6', 0), n('G6', 771000), n('H6', 26928300)],
  ];
  const sheet =
    '<?xml version="1.0"?><worksheet><sheetData>' +
    rows.map((cells, r) => `<row r="${r + 1}">${cells.join('')}</row>`).join('') +
    '</sheetData></worksheet>';
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
      'xl/workbook.xml': strToU8('<?xml version="1.0"?><workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/sharedStrings.xml': strToU8(`<?xml version="1.0"?><sst>${shared.map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`),
      'xl/worksheets/sheet1.xml': strToU8(sheet),
    }),
  );
}

const upload = (page, name = 'تا۱۲مهر- صادرات.xlsx') =>
  page.setInputFiles('#file', { name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bankXlsx() });

test('a bank export opens the import dialog with the account and the period detected', async ({ page }) => {
  await openApp(page);
  await upload(page);

  const info = page.locator('.bank-info');
  await expect(info).toBeVisible();
  await expect(info).toContainText('بانک صادرات'); // guessed from the file name
  await expect(info).toContainText('۳ تراکنش');
  await expect(info).toContainText('۱۴۰۵/۰۵/۱۲ تا ۱۴۰۵/۰۶/۰۲');
  await expect(page.locator('.bank-pre')).toContainText('| تاریخ |');
});

test('the inserted report carries the header, the summary and a totals row', async ({ page }) => {
  await openApp(page);
  await upload(page);
  await page.getByRole('button', { name: 'ساخت سند گزارش' }).click();

  const p = page.locator('#preview');
  // One h1 only: the title goes to the document cover, the markdown no longer repeats it.
  await expect(p.locator('h1')).toHaveCount(1);
  await expect(p.locator('h1')).toContainText('صورت‌حساب بانک صادرات');
  await expect(p).toContainText('مجتبی حسنی');
  await expect(p).toContainText('۰۱۰۷۸۶۳۶۸۶۰۰۱');
  await expect(p.locator('.callout-note')).toContainText('جمع واریز');
  // Three transactions, plus the header row and the «جمع کل» row.
  await expect(p.locator('table tbody tr')).toHaveCount(4);
  await expect(p.locator('table')).toContainText('۲۷٬۷۰۰٬۰۰۰');
  await expect(p.locator('table')).toContainText('جمع کل');
  // The amounts are Persian digits with «٬», never raw latin thousands.
  await expect(p.locator('table')).not.toContainText('27,700,000');
});

test('choosing columns changes the report, and fees can be folded in', async ({ page }) => {
  await openApp(page);
  await upload(page);

  await page.check('#bcol-time');      // add the clock column
  await page.uncheck('#bcol-balance'); // drop the running balance
  await expect(page.locator('.bank-pre')).toContainText('ساعت');
  await expect(page.locator('.bank-pre')).not.toContainText('مانده');

  await page.check('#bopt-mergeFees');
  await expect(page.locator('.bank-info')).toContainText('۲ تراکنش'); // the fee folded into its transfer

  await page.getByRole('button', { name: 'ساخت سند گزارش' }).click();
  const head = page.locator('#preview table thead');
  await expect(head).toContainText('ساعت');
  await expect(head).not.toContainText('مانده');
});

test('the monthly table option produces something the chart button accepts', async ({ page }) => {
  await openApp(page);
  await upload(page);
  await page.check('#bopt-chart');
  await page.getByRole('button', { name: 'ساخت سند گزارش' }).click();

  await expect(page.locator('#preview h2')).toContainText('گردش ماهانه');
  const tables = page.locator('#preview table');
  await expect(tables).toHaveCount(2);
  await expect(tables.nth(1)).toContainText('میلیون ریال');

  // The app itself must agree that it is chartable.
  await page.keyboard.press('Meta+k');
  await page.locator('.palette-input').fill('درج نمودار از جدول');
  await page.locator('.pal-item').first().click();
  await expect(page.locator('.chart-pop')).toBeVisible();
});

test('a real binary .xls is refused with an instruction instead of a broken import', async ({ page }) => {
  await openApp(page);
  const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0]);
  await page.setInputFiles('#file', { name: 'bankStatements.xls', mimeType: 'application/vnd.ms-excel', buffer: ole });
  await expect(page.locator('#status .status-text')).toContainText('xlsx');
  await expect(page.locator('.bank-info')).toHaveCount(0);
});
