// Registers every app action with the command palette and defines the global keyboard shortcuts.
import { store } from '../core/store.js';
import { $, el } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { palette } from './palette.js';
import { defineShortcut, listShortcuts } from './shortcuts.js';
import { openModal } from './modal.js';
import { exportHTML, exportMarkdown, exportEmail, exportPDF, exportPDFServer, exportInteractive, exportDocx, exportPNG, presentDocument, exportPresentation } from '../export/actions.js';
import { exportSettings } from './settings.js';
import { setFont } from './panels.js';
import { undo, redo, selectAll, plainText, insertNode, refreshFurniture } from '../editor/preview.js';
import { toggleSourceMode } from '../editor/source.js';
import { makeBlock, addLinkButton } from '../editor/toolbar.js';
import { pickImage, pasteClipboardImage } from '../editor/images.js';
import { newDocument } from '../editor/document.js';
import { copyPlain } from '../export/files.js';
import { library } from '../library/library.js';
import { openLibrary } from '../library/library-ui.js';
import { openVersions } from '../library/versions-ui.js';
import { exportBackup, importBackup } from '../library/backup-ui.js';
import { saveCommand } from '../server/linked.js';
import { openAbout } from './about.js';
import { embedConfig } from '../core/embed-config.js';

const toggle = (key, label, furniture = false) => () => {
  const on = !store.get(key);
  store.set(key, on);
  if (furniture) {
    store.set('dirty', true);
    refreshFurniture();
  }
  notify(`${label}: ${on ? 'روشن' : 'خاموش'}`);
};

const DOC_THEMES = [['navy', 'رسمی'], ['green', 'سبز'], ['warm', 'گرم'], ['mono', 'ساده']];
const APP_THEMES = [['light', 'روشن', 'light'], ['dark', 'تیره', 'dark'], ['system', 'مطابق سیستم', 'system auto']];

function showShortcuts() {
  const rows = [...listShortcuts(), { title: 'بستن پالت، پنجره یا کشو', keys: 'Esc' }, { title: 'حرکت در نتایج پالت', keys: '↑ ↓' }, { title: 'اجرای نتیجهٔ انتخاب‌شده', keys: 'Enter' }];
  const body = el('table', { class: 'kbd-table' }, el('tbody', {}, ...rows.map((r) => el('tr', {}, el('td', { text: r.title }), el('td', {}, el('kbd', { text: r.keys }))))));
  openModal({ title: 'میان‌برهای صفحه‌کلید', body });
}

export function registerCommands() {
  const cmds = [
    // documents & library
    { id: 'new-doc', title: 'سند تازه', group: 'سند', keywords: 'new document create جدید', run: newDocument },
    { id: 'open-library', title: 'باز کردن کتابخانه', group: 'کتابخانه', keywords: 'library documents سندها آرشیو', run: openLibrary },
    { id: 'save-version', title: 'ذخیرهٔ نسخه (و سند)', group: 'کتابخانه', keywords: 'save version snapshot ذخیره', run: () => library.saveVersion() },
    { id: 'versions', title: 'نسخه‌های این سند', group: 'کتابخانه', keywords: 'versions history restore بازگردانی تاریخچه', run: openVersions },
    { id: 'toggle-autosave', title: 'ذخیرهٔ خودکار: روشن/خاموش', group: 'کتابخانه', keywords: 'autosave', run: () => store.set('autosave', !store.get('autosave')) },
    { id: 'backup-export', title: 'صدور پشتیبان کامل (JSON)', group: 'پشتیبان', keywords: 'backup export export بکاپ', run: exportBackup },
    { id: 'backup-import', title: 'ورود پشتیبان کامل (JSON)', group: 'پشتیبان', keywords: 'backup import restore بکاپ بازیابی', run: importBackup },
    { id: 'open-file', title: 'انتخاب فایل سند (MD، TXT، HTML)', group: 'ورود', keywords: 'open file import upload فایل', run: () => $('#file').click() },
    // exports
    { id: 'export-html', title: 'خروجی HTML ساده (چاپ‌پذیر)', group: 'خروجی', keywords: 'export html download دریافت', run: exportHTML },
    { id: 'export-interactive', title: 'خروجی HTML تعاملی (فهرست، حالت تیره، کپی کد)', group: 'خروجی', keywords: 'export interactive html toc dark تعاملی', run: exportInteractive },
    { id: 'export-docx', title: 'خروجی Word (.docx)', group: 'خروجی', keywords: 'export word docx ورد', run: exportDocx },
    { id: 'export-png', title: 'خروجی تصویر PNG برای تلگرام', group: 'خروجی', keywords: 'export png image telegram تصویر عکس', run: exportPNG },
    { id: 'present', title: 'شروع حالت ارائه (اسلاید)', group: 'ارائه', keywords: 'present presentation slides ارائه اسلاید', run: presentDocument },
    { id: 'export-present', title: 'ذخیرهٔ ارائه به‌صورت فایل HTML', group: 'خروجی', keywords: 'export presentation slides html ارائه', run: exportPresentation },
    { id: 'export-md', title: 'خروجی Markdown', group: 'خروجی', keywords: 'export markdown md', run: exportMarkdown },
    { id: 'export-pdf-direct', title: 'PDF مستقیم (Chrome سرور، بدون پنجرهٔ چاپ)', group: 'خروجی', keywords: 'export pdf direct chrome server پی‌دی‌اف مستقیم', run: exportPDFServer },
    { id: 'export-pdf', title: 'خروجی PDF / چاپ', group: 'خروجی', keywords: 'export pdf print چاپ a4', run: exportPDF },
    { id: 'export-email', title: 'خروجی ایمیل فارسی', group: 'خروجی', keywords: 'export email mail', run: exportEmail },
    { id: 'copy-text', title: 'کپی متن سند', group: 'خروجی', keywords: 'copy text clipboard', run: () => copyPlain(plainText()) },
    // editing
    { id: 'undo', title: 'واگرد', group: 'ویرایش', keywords: 'undo', run: undo },
    { id: 'redo', title: 'انجام دوباره', group: 'ویرایش', keywords: 'redo', run: redo },
    { id: 'select-all', title: 'انتخاب همهٔ متن سند', group: 'ویرایش', keywords: 'select all', run: selectAll },
    { id: 'toggle-source', title: 'سورس HTML: نمایش/بازگشت', group: 'ویرایش', keywords: 'source code html mode کد', run: () => toggleSourceMode() },
    // insert
    { id: 'insert-heading', title: 'افزودن تیتر', group: 'درج', keywords: 'insert heading', run: () => insertNode(makeBlock('heading')) },
    { id: 'insert-card', title: 'افزودن کارت برجسته', group: 'درج', keywords: 'insert card callout', run: () => insertNode(makeBlock('card')) },
    { id: 'insert-quote', title: 'افزودن نقل‌قول', group: 'درج', keywords: 'insert quote blockquote', run: () => insertNode(makeBlock('quote')) },
    { id: 'insert-hr', title: 'افزودن جداکننده', group: 'درج', keywords: 'insert divider hr line', run: () => insertNode(makeBlock('hr')) },
    { id: 'insert-image', title: 'درج تصویر', group: 'درج', keywords: 'insert image picture عکس', run: () => pickImage('inline') },
    { id: 'insert-link', title: 'درج دکمهٔ لینک', group: 'درج', keywords: 'insert link button', run: addLinkButton },
    // header / footer
    { id: 'masthead-image', title: 'تصویر سربرگ را انتخاب کن', group: 'سربرگ', keywords: 'header image masthead', run: () => pickImage('masthead') },
    { id: 'masthead-paste', title: 'چسباندن تصویر سربرگ از کلیپ‌بورد', group: 'سربرگ', keywords: 'header paste image', run: () => pasteClipboardImage('masthead') },
    { id: 'footer-image', title: 'تصویر پاورقی را انتخاب کن', group: 'سربرگ', keywords: 'footer image', run: () => pickImage('footer') },
    { id: 'footer-paste', title: 'چسباندن تصویر پاورقی از کلیپ‌بورد', group: 'سربرگ', keywords: 'footer paste image', run: () => pasteClipboardImage('footer') },
    { id: 'toggle-header', title: 'نمایش سربرگ: روشن/خاموش', group: 'سربرگ', keywords: 'header show hide', run: toggle('showHeader', 'سربرگ', true) },
    { id: 'toggle-footer', title: 'نمایش پاورقی: روشن/خاموش', group: 'سربرگ', keywords: 'footer show hide', run: toggle('showFooter', 'پاورقی', true) },
    { id: 'toggle-title', title: 'نمایش عنوان و زیرعنوان: روشن/خاموش', group: 'سربرگ', keywords: 'title show hide', run: toggle('showTitle', 'عنوان', true) },
    // view
    { id: 'zoom-in', title: 'بزرگ‌تر کردن متن', group: 'نما', keywords: 'zoom in font bigger', run: () => setFont(store.get('font') + 1) },
    { id: 'zoom-out', title: 'کوچک‌تر کردن متن', group: 'نما', keywords: 'zoom out font smaller', run: () => setFont(store.get('font') - 1) },
    { id: 'zoom-reset', title: 'اندازهٔ معمولی متن', group: 'نما', keywords: 'zoom reset font normal', run: () => setFont(15) },
    ...APP_THEMES.map(([v, label, kw]) => ({ id: 'app-theme-' + v, title: `پوستهٔ برنامه: ${label}`, group: 'ظاهر', keywords: 'theme appearance dark light ' + kw, run: () => store.set('appTheme', v) })),
    ...DOC_THEMES.map(([v, label]) => ({ id: 'doc-theme-' + v, title: `قالب رنگی سند: ${label}`, group: 'ظاهر', keywords: 'document theme color ' + v, run: () => { store.set('theme', v); store.set('dirty', true); } })),
    { id: 'toggle-newtab', title: 'بازشدن پیوند در برگهٔ جدید: روشن/خاموش', group: 'تنظیمات', keywords: 'links new tab', run: toggle('openLinksInNewTab', 'پیوند در برگهٔ جدید') },
    { id: 'toggle-embedfont', title: 'جاسازی فونت در HTML: روشن/خاموش', group: 'تنظیمات', keywords: 'embed font export', run: toggle('embedFontInExport', 'جاسازی فونت') },
    { id: 'settings-export', title: 'ذخیرهٔ تنظیمات (JSON)', group: 'تنظیمات', keywords: 'settings export json', run: exportSettings },
    { id: 'settings-import', title: 'بارگذاری تنظیمات (JSON)', group: 'تنظیمات', keywords: 'settings import json', run: () => $('#settingsFile').click() },
    { id: 'shortcuts', title: 'میان‌برها', group: 'راهنما', keywords: 'shortcuts keyboard keys help کلید', run: showShortcuts },
    { id: 'about', title: 'دربارهٔ برنامه', group: 'راهنما', keywords: 'about version build licence نسخه درباره مجوز ذخیره', run: openAbout },
  ];
  cmds.forEach((c) => palette.register(c));

  // Library documents in the palette (not when an embed host has no library).
  if (embedConfig().library) palette.addSource({
    id: 'docs',
    label: 'سندهای کتابخانه',
    load: async () =>
      (await library.list()).map((d) => ({
        id: 'doc:' + d.id, kind: 'doc', title: d.title?.trim() || 'بدون عنوان', keywords: (d.tags || []).join(' '), body: (d.text || '').slice(0, 1500),
        subtitle: d.id === library.currentId() ? 'سند فعلی' : '', run: () => library.open(d.id),
      })),
  });

  // Shortcuts (⌘ on macOS, Ctrl elsewhere; also matched by key position so a Persian keyboard layout works).
  defineShortcut({ id: 'palette', keys: 'Mod+K', title: 'پالت فرمان', run: () => palette.open() });
  // Embed mode: ⌘S only tells the host (MD2Html.embed.on('save')); the host decides where the document goes.
  if (embedConfig().active) defineShortcut({ id: 'save-version', keys: 'Mod+S', title: 'ذخیره', run: () => store.emit('embed:save') });
  else defineShortcut({ id: 'save-version', keys: 'Mod+S', title: 'ذخیره (روی فایل متصل، وگرنه نسخه)', run: () => saveCommand() });
  defineShortcut({ id: 'undo', keys: 'Mod+Z', title: 'واگرد (در سند)', scope: 'preview', run: undo });
  defineShortcut({ id: 'redo', keys: 'Mod+Shift+Z', title: 'انجام دوباره (در سند)', scope: 'preview', run: redo });
  defineShortcut({ id: 'redo-y', keys: 'Mod+Y', title: 'انجام دوباره (در سند)', scope: 'preview', run: redo });
}
