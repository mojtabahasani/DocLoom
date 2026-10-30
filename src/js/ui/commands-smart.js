// Phase 2 palette commands + shortcut: cleanup, detection, TOC, reading mode, charts.
import { $ } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { palette } from './palette.js';
import { defineShortcut } from './shortcuts.js';
import { applyCleanup, openCleanup } from './cleanup-ui.js';
import { checkDocument, suggestLetterMode } from './suggest.js';
import { insertToc, showTab } from './toc-panel.js';
import { openReading } from './reading.js';
import { openChartPopover, chartableData } from './chart-ui.js';
import { preview } from '../editor/preview.js';

function chartForCaretTable() {
  const sel = getSelection();
  const near = sel?.anchorNode && preview.contains(sel.anchorNode) ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement).closest('table') : null;
  const table = near || Array.from(preview.querySelectorAll('table')).find(chartableData);
  if (!table || !chartableData(table)) return notify('جدولی با ستون عددی در سند پیدا نشد.');
  table.scrollIntoView({ block: 'center' });
  openChartPopover(table, table.getBoundingClientRect());
}

export function registerSmartCommands() {
  [
    { id: 'cleanup', title: 'پاک‌سازی خروجی هوش مصنوعی…', group: 'پاک‌سازی', keywords: 'cleanup ai clean zwnj نیم فاصله ایموجی ی ک اعداد', run: openCleanup },
    { id: 'cleanup-quick', title: 'پاک‌سازی سریع با قاعده‌های پیش‌فرض', group: 'پاک‌سازی', keywords: 'cleanup quick ai فوری', run: () => applyCleanup() },
    { id: 'detect', title: 'بررسی نوع سند (خروجی AI / نامه)', group: 'پاک‌سازی', keywords: 'detect type ai letter تشخیص', run: () => checkDocument() || notify('سندی برای بررسی نیست.') },
    { id: 'letter-mode', title: 'حالت نامه برای این سند', group: 'سند', keywords: 'letter نامه باسمه', run: suggestLetterMode },
    { id: 'toc-insert', title: 'درج فهرست مطالب در سند', group: 'درج', keywords: 'toc table of contents فهرست مطالب', run: insertToc },
    { id: 'toc-show', title: 'نمایش فهرست مطالب در پنل کناری', group: 'نما', keywords: 'toc outline headings فهرست', run: () => (showTab('toc'), $('#tabBtnToc').focus()) },
    { id: 'reading', title: 'حالت مطالعه', group: 'نما', keywords: 'reading mode focus read مطالعه خواندن', run: openReading },
    { id: 'chart', title: 'درج نمودار از جدول', group: 'درج', keywords: 'chart graph table نمودار', run: chartForCaretTable },
  ].forEach((c) => palette.register(c));
  defineShortcut({ id: 'reading', keys: 'Mod+Shift+E', title: 'حالت مطالعه', run: openReading });
}

export function initSmartButtons() {
  $('#cleanupBtn').addEventListener('click', openCleanup);
  $('#readBtn').addEventListener('click', openReading);
}
