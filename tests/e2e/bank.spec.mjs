// Dropping a bank export on the app and getting the printed statement out of it.
import { test, expect } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { openApp } from './helpers.mjs';

/** A small statement shaped like Saderat's: two header rows above the real header. */
function bankXlsx() {
  const shared = [
    'نام : مجتبی حسنی', 'شماره حساب 0107863686001', 'شعبه سردار سلیمانی',
    'ردیف', 'تاریخ', 'زمان', 'نوع تراکنش', 'شرح', 'واریز', 'برداشت', 'مانده',
    '1405/05/12', '10:00:00', 'شاپرک - تجمیعى', 'مرکزشاپرک',
    'کارمزد', 'کارمزد تراکنش شاپرک',
    '1405/06/02', '09:15:00', 'خرید اینترنتی', 'خرید اینترنتی از ملت',
  ];
  const s = (ref, i) => `<c r="${ref}" t="s"><v>${i}</v></c>`;
  const n = (ref, v) => `<c r="${ref}"><v>${v}</v></c>`;
  const rows = [
    [s('A1', 0), s('C1', 1), s('E1', 2)],
    [],
    [s('A3', 3), s('B3', 4), s('C3', 5), s('D3', 6), s('E3', 7), s('F3', 8), s('G3', 9), s('H3', 10)],
    [n('A4', 1), s('B4', 11), s('C4', 12), s('D4', 13), s('E4', 14), n('F4', 27700000), n('G4', 0), n('H4', 27700000)],
    // The fee shares the transfer's date and time, exactly as the banks write it.
    [n('A5', 2), s('B5', 11), s('C5', 12), s('D5', 15), s('E5', 16), n('F5', 0), n('G5', 4920), n('H5', 27695080)],
    [n('A6', 3), s('B6', 17), s('C6', 18), s('D6', 19), s('E6', 20), n('F6', 0), n('G6', 771000), n('H6', 26924080)],
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

const make = (page) => page.getByRole('button', { name: 'ساخت سند گزارش' }).click();

test('a bank export opens the import dialog with the account and the period detected', async ({ page }) => {
  await openApp(page);
  await upload(page);
  const info = page.locator('.bank-info');
  await expect(info).toBeVisible();
  await expect(info).toContainText('بانک صادرات'); // guessed from the file name
  await expect(info).toContainText('۳ تراکنش');
  await expect(info).toContainText('۱۴۰۵/۰۵/۱۲ تا ۱۴۰۵/۰۶/۰۲');
  // The preview is the real table, styled, not a text sample.
  await expect(page.locator('.bank-preview table.stmt')).toBeVisible();
});

test('the printed statement has the six fixed columns with the clock under the date', async ({ page }) => {
  await openApp(page);
  await upload(page);
  await make(page);

  const t = page.locator('#preview table.stmt');
  await expect(t).toBeVisible();
  await expect(t.locator('thead th')).toHaveText(['رج', 'زمان', 'شرح عملیات', 'واریز', 'برداشت', 'مانده']);
  await expect(t.locator('tbody tr')).toHaveCount(3);

  const first = t.locator('tbody tr').first();
  await expect(first.locator('.s-n')).toHaveText('۱');
  await expect(first.locator('.s-date')).toHaveText('۱۴۰۵/۰۵/۱۲');
  await expect(first.locator('.s-time')).toHaveText('۱۰:۰۰:۰۰');
  await expect(first.locator('.s-in')).toHaveText('۲۷٬۷۰۰٬۰۰۰');
  await expect(first.locator('.s-out')).toHaveText('—');

  // The date sits above the clock, and the clock is the smaller of the two.
  const date = await first.locator('.s-date').boundingBox();
  const time = await first.locator('.s-time').boundingBox();
  expect(time.y).toBeGreaterThan(date.y);
  expect(time.height).toBeLessThan(date.height);
  const size = (sel) => first.locator(sel).evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
  expect(await size('.s-desc')).toBeLessThan(await size('.s-date'));
});

test('رج is the narrowest column and شرح عملیات takes the slack', async ({ page }) => {
  await openApp(page);
  await upload(page);
  await make(page);
  const w = async (cls) => (await page.locator(`#preview table.stmt tbody tr:first-child .${cls}`).boundingBox()).width;
  const [n, when, desc, inn, out, bal] = await Promise.all(['s-n', 's-when', 's-desc', 's-in', 's-out', 's-bal'].map(w));
  expect(n).toBeLessThan(when);
  expect(n).toBeLessThan(40);
  for (const fixed of [when, inn, out, bal]) expect(desc).toBeGreaterThan(fixed);
});

test('the money columns are coloured for a colour print', async ({ page }) => {
  await openApp(page);
  await upload(page);
  await make(page);
  const row = page.locator('#preview table.stmt tbody tr').first();
  const colour = (cls) => row.locator('.' + cls).evaluate((n) => getComputedStyle(n).color);
  // Deposits dark blue, withdrawals dark red, balance dark green.
  expect(await colour('s-in')).toBe('rgb(17, 65, 138)');
  expect(await colour('s-out')).toBe('rgb(140, 18, 48)');
  expect(await colour('s-bal')).toBe('rgb(20, 89, 58)');
  // Amounts hug the start side of an RTL table, and the «جمع کل» row — the biggest numbers
  // on the page — must fit its cells instead of running into the next column.
  for (const cls of ['s-in', 's-out', 's-bal']) {
    expect(await row.locator('.' + cls).evaluate((n) => getComputedStyle(n).textAlign)).toBe('right');
  }
  const overflowing = await page.locator('#preview table.stmt').evaluate((t) =>
    [...t.querySelectorAll('.s-in,.s-out,.s-bal')].filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.textContent.trim()));
  expect(overflowing).toEqual([]);
});

test('every heading is white and centred, whatever its column does', async ({ page }) => {
  await openApp(page);
  await upload(page);
  await make(page);
  // The column classes sit on the <th> too; without the thead rule «شرح عملیات» would be
  // near-black on the dark header bar and the amounts would be blue and red.
  const heads = await page.locator('#preview table.stmt thead th').evaluateAll((ns) =>
    ns.map((n) => ({ color: getComputedStyle(n).color, align: getComputedStyle(n).textAlign })));
  expect(heads).toHaveLength(6);
  for (const h of heads) {
    expect(h.color).toBe('rgb(255, 255, 255)');
    expect(h.align).toBe('center');
  }
});

test('the table keeps its own compact size against the document stylesheet', async ({ page }) => {
  await openApp(page);
  await upload(page);
  await make(page);
  // `.paper table{font-size:.82em}` is (0,1,1) and outranks a bare `.stmt`.
  const px = (sel) => page.locator(sel).first().evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
  expect(await px('#preview table.stmt')).toBeCloseTo(8.5, 1);
  expect(await px('#preview tbody .s-desc')).toBeCloseTo(8.5, 1);
  expect(await px('#preview tbody .s-time')).toBeLessThan(await px('#preview tbody .s-date'));
});

test('repeating kinds tint their row, and the legend names them', async ({ page }) => {
  await openApp(page);
  await upload(page);
  await make(page);
  const rows = page.locator('#preview table.stmt tbody tr');
  await expect(rows.nth(0)).toHaveClass(/g-pos/); // Shaparak settlement = POS income
  await expect(rows.nth(1)).toHaveClass(/g-fee/);
  await expect(rows.nth(2)).toHaveClass(/g-card-net/); // internet card purchase, not POS
  const tint = await rows.nth(0).evaluate((n) => getComputedStyle(n).backgroundColor);
  expect(tint).not.toBe('rgba(0, 0, 0, 0)');
  const legend = page.locator('#preview .stmt-legend');
  await expect(legend).toContainText('واریز پوز');
  await expect(legend).toContainText('خرید اینترنتی');
  // Each chip carries how much the group moved, not just how many lines it has.
  // The sum sits on its own line under the count, so the two numbers never read as one.
  const chip = legend.locator('span').first();
  await expect(chip.locator('small')).toHaveCount(1);
  const [countBox, sumBox] = await Promise.all([chip.locator('b').boundingBox(), chip.locator('small').boundingBox()]);
  expect(sumBox.y).toBeGreaterThan(countBox.y);
  await expect(legend).toContainText('۲۷٬۷۰۰٬۰۰۰');
  await expect(legend).toContainText('۷۷۱٬۰۰۰');
});

test('«تازه‌ترین در بالا» flips the order without changing the totals', async ({ page }) => {
  await openApp(page);
  await upload(page);
  await page.selectOption('#bopt-sort', 'desc');
  await make(page);
  const rows = page.locator('#preview table.stmt tbody tr');
  await expect(rows.first().locator('.s-date')).toHaveText('۱۴۰۵/۰۶/۰۲');
  await expect(rows.first().locator('.s-n')).toHaveText('۱', { useInnerText: true });
  await expect(page.locator('#preview .callout-note')).toContainText('۲۷٬۷۰۰٬۰۰۰');
});

test('fees can be folded into the transaction they belong to', async ({ page }) => {
  await openApp(page);
  await upload(page);
  await page.check('#bopt-mergeFees');
  await expect(page.locator('.bank-info')).toContainText('۲ تراکنش');
  await make(page);
  await expect(page.locator('#preview table.stmt tbody tr')).toHaveCount(2);
});

test('the monthly table option produces something the chart button accepts', async ({ page }) => {
  await openApp(page);
  await upload(page);
  await page.check('#bopt-chart');
  await make(page);
  await expect(page.locator('#preview h2')).toContainText('گردش ماهانه');
  await expect(page.locator('#preview table')).toHaveCount(2);

  await page.keyboard.press('Meta+k');
  await page.locator('.palette-input').fill('درج نمودار از جدول');
  await page.locator('.pal-item').first().click();
  await expect(page.locator('.chart-pop')).toBeVisible();
});

test('a damaged binary .xls is reported instead of half-imported', async ({ page }) => {
  await openApp(page);
  const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0]);
  await page.setInputFiles('#file', { name: 'bankStatements.xls', mimeType: 'application/vnd.ms-excel', buffer: ole });
  await expect(page.locator('#status .status-text')).toContainText('xlsx');
  await expect(page.locator('.bank-info')).toHaveCount(0);
});
