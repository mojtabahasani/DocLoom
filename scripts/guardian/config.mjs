// نگهبان کدِ DocLoom — پیکربندیِ پروژه روی موتور مشترک @darwin/guardian (ADR 0003).
//
// مرز طبق همان ADR: موتور و «بستهٔ قواعد مشترک» در داروین‌اند، قاعده و شدتِ این پروژه همین‌جا.
// هر قاعده یک `origin` دارد: از کدام باگ یا قرارداد واقعی آمده. قانونی که شکستنش نامرئی باشد
// قانون نیست (اصل ۷، ADR 0004) — پس هر چیزی که اینجاست یا regex قطعی دارد یا یک چکِ کل‌فایل.
//
// چیزهایی که عمداً اینجا نیستند، چون جای دیگری **اجرا** می‌شوند:
//   • «هیچ دکمه‌ای داده را نابود نمی‌کند»      → tests/no-destroy.test.mjs
//   • کنتراست ۴٫۵:۱ و WCAG 2.5.3                → tests/e2e/a11y.spec.mjs (axe)
//   • یکی‌بودن قالب‌های رنگی با CSS پیش‌نمایش   → tests/doc-themes.test.mjs
//   • جهتِ فلش و پر شدنِ نوار پیشرفت در عمل     → tests/e2e/rtl.spec.mjs و drawer.spec.mjs
import { createManifest } from '@darwin/guardian';

const manifest = createManifest([
  {
    code: 'MD-RTL', title: 'کنترل قبلی/بعدی یا نوار پیشرفت آینه شده', severity: 'important',
    greppable: true, enforcedBy: ['hook', 'author'],
    origin: 'DW-RTLNAV داروین (ADR 0004 §۸): سه بار در دیت‌پیکر، پروگرس‌بار و نوار پخش صدا شکست. در این پروژه هم یک بار در دیت‌پیکر و یک بار در نوار صدا.',
  },
  {
    code: 'MD-HEX', title: 'رنگ خام در جاوااسکریپت به‌جای توکن یا جدول قالب‌ها', severity: 'advisory',
    greppable: true, enforcedBy: ['hook'],
    origin: 'DW-COLOR داروین + قرارداد همین پروژه: رنگِ سند فقط در DOC_THEMES و رنگِ پوسته فقط در styles/tokens.css.',
  },
  {
    code: 'MD-DIGITS', title: 'تبدیل دستی ارقام فارسی بیرون از core/digits.js', severity: 'important',
    greppable: true, enforcedBy: ['hook'],
    origin: 'DW-DIGITS داروین + باگ واقعی در خروجی آرنا (gpt-6.2-sol-max، آبان ۱۴۰۵): cleanPrint هر رقم لاتین را فارسی می‌کرد و «A4» را به «A۴» تبدیل می‌کرد. حالت embed هم ارقام لاتین می‌خواهد، پس تبدیل باید از digitMode() رد شود.',
  },
  {
    code: 'MD-DIALOG', title: 'alert/confirm/prompt به‌جای notify و openModal', severity: 'important',
    greppable: true, enforcedBy: ['hook'],
    origin: 'DW-DIALOG داروین: برنامه مودال و اعلان فارسی خودش را دارد؛ دیالوگ مرورگر راست‌به‌چپ نیست و در حالت ارائه و PDF اصلاً دیده نمی‌شود.',
  },
  {
    code: 'MD-SECRET', title: 'راز یا کلید درون کد', severity: 'critical',
    greppable: true, enforcedBy: ['hook'],
    origin: 'DW-SECRET داروین. این برنامه تک‌فایل است و کل کدش در DocLoom.html به دست کاربر می‌رسد: هر رازی در کد، رازِ منتشرشده است.',
  },
  {
    code: 'MD-ACC', title: 'آکاردئون در پنل کناری برگشته', severity: 'advisory',
    greppable: true, enforcedBy: ['hook'],
    origin: 'بازطراحی ۲۷ آبان ۱۴۰۵: چهار آکاردئون هم‌شکل همان چیزی بودند که مجتبی از آن‌ها شکایت داشت؛ جایشان را زبانهٔ تودرتو گرفت. CLAUDE.md: «there are no <details> left in the panels, don’t add one back».',
  },
  {
    code: 'MD-MOVE', title: 'اسلاتِ data-move به شناسه‌ای اشاره می‌کند که در تمپلیت نیست', severity: 'critical',
    greppable: false, enforcedBy: ['hook'],
    origin: 'باگ واقعی ۲۷ آبان ۱۴۰۵: data-move="exportMenuBtn" فقط دکمه را جابه‌جا کرد و منویش در تمپلیتِ حذف‌شده جا ماند؛ $(#exportMenu) شد null و کل برنامه در startup مُرد — بی‌صدا، چون main() خطا را فقط console.error می‌کند.',
  },
]);

/**
 * چکِ کل‌فایل برای MD-MOVE. نوار ابزار در `<template id="movedFromToolbar">` است و
 * `toolbar-move.js` هر گره را در اسلاتِ `data-move="<id>"` می‌گذارد. اگر شناسه‌ای در تمپلیت
 * نباشد، گره جابه‌جا نمی‌شود و اولین ماژولی که سراغش برود null می‌گیرد.
 */
const movedSlotsExist = (rel, content) => {
  if (!/src\/index\.html$/.test(rel)) return null;
  const tpl = content.match(/<template id="movedFromToolbar">([\s\S]*?)<\/template>/);
  if (!tpl) return null;
  const ids = new Set([...tpl[1].matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const out = [];
  for (const m of content.matchAll(/data-move="([^"]+)"/g)) {
    if (ids.has(m[1])) continue;
    out.push({
      file: rel,
      line: content.slice(0, m.index).split('\n').length,
      rule: {
        code: 'MD-MOVE', title: manifest.meta.find((r) => r.code === 'MD-MOVE').title, severity: 'critical',
        message: `اسلاتِ data-move="${m[1]}" شناسه‌ای را می‌خواهد که در <template id="movedFromToolbar"> نیست. گره جابه‌جا نمی‌شود و اولین ماژولی که آن را بخواهد null می‌گیرد — برنامه در startup می‌میرد و خطا فقط در کنسول دیده می‌شود. اگر کنترل یک منوی کشویی است، باید .menu-wrap (با id خودش) جابه‌جا شود، نه فقط دکمه‌اش.`,
      },
      text: m[0],
    });
  }
  return out;
};

/** قاعده‌های خاصِ همین پروژه (بقیه از بستهٔ مشترک می‌آیند). */
const RULES = [
  {
    code: 'MD-ACC',
    title: manifest.meta.find((r) => r.code === 'MD-ACC').title,
    severity: 'advisory',
    include: /src\/index\.html$/,
    pattern: /<details[^>]*class=["'][^"']*\bacc\b/,
    message: 'پنل‌های کناری آکاردئون ندارند: گروهی که دو کار جدا دارد یک drawer تودرتو با data-shape="tabs" می‌گیرد. چهار آکاردئون هم‌شکل همان چیزی بود که بازطراحی از آن خلاص شد.',
  },
];

export const config = {
  name: 'DocLoom',
  title: 'نگهبانِ DocLoom',
  roots: ['src', 'server', 'scripts', 'build.mjs'],
  fileRegex: /\.(js|mjs|css|html)$/,
  skipDirs: ['node_modules', 'dist', 'vendor', '.git', 'Sample-arena', '1file-old'],
  rules: RULES,
  checks: [movedSlotsExist],
  severityOf: manifest.severityOf,
  isSuspended: manifest.isSuspended,
  suspendedInfo: () => manifest.suspendedRules(),
  contextWindow: { before: 24, after: 8 }, // یک کمکیِ خصوصیِ رقم می‌تواند بالاتر از دروازهٔ digitMode() باشد
  baseline: { path: 'scripts/guardian/baseline.json', format: 'fingerprints' },
  extends: [
    {
      pack: 'darwin',
      use: { 'DW-RTLNAV': 'MD-RTL', 'DW-COLOR': 'MD-HEX', 'DW-DIGITS': 'MD-DIGITS', 'DW-DIALOG': 'MD-DIALOG', 'DW-SECRET': 'MD-SECRET' },
      override: {
        'DW-RTLNAV': {
          include: /\.(css|js|mjs|html)$/,
          pattern: /(scaleX\(\s*-1\s*\)|rotate\(\s*180deg\s*\)|rtl:-?(rotate|scale-x))/,
          unless: /guardian-ignore MD-RTL/,
          reason: 'بستهٔ مشترک برای React و Tailwind نوشته شده (ChevronLeft + rotate-180). این برنامه وانیلاست و آینه‌کردن اینجا در CSS اتفاق می‌افتد. فقط *آینه‌کردن* را می‌گیرد: «پر شدنِ نوار پیشرفت از چپ» را tests/e2e/rtl.spec.mjs در مرورگر واقعی ثابت می‌کند، و یک regex روی direction:rtl فقط نویز می‌سازد چون کل برنامه راست‌به‌چپ است.',
        },
        'DW-COLOR': {
          include: /src\/js\/.*\.m?js$/,
          exclude: /src\/js\/export\/theme\.js$/,
          pattern: /#[0-9a-fA-F]{6}\b/,
          unless: /guardian-ignore MD-HEX/,
          reason: 'الگوی بسته کلاس‌های Tailwind را می‌گیرد. اینجا رنگ در CSS جایش درست است؛ چیزی که اشتباه است رنگِ ثابت در جاوااسکریپت است — بیرون از جدول قالب‌های سند.',
        },
        'DW-DIGITS': {
          include: /src\/js\/.*\.m?js$/,
          exclude: /src\/js\/core\/digits\.js$/,
          pattern: /(['"`]۰۱۲۳۴۵۶۷۸۹['"`]|replace\(\s*\/\\d\/g)/,
          unless: /(guardian-ignore MD-DIGITS|digitMode\(|data-digits|toLatin|localDigits)/,
          reason: 'الگوی بسته دنبال input[type=tel] در JSX است. اینجا خطر چیز دیگری است: نگاشتِ دستیِ رقم، که حالت ارقام لاتینِ embed را دور می‌زند و «A4» را هم فارسی می‌کند.',
        },
        'DW-DIALOG': { include: /\.(js|mjs)$/, reason: 'پروژه جاوااسکریپت خالص است، نه TypeScript.' },
        'DW-SECRET': { include: /\.(js|mjs|html)$/, reason: 'پروژه جاوااسکریپت خالص است؛ html هم اسکن می‌شود چون خروجیِ build تک‌فایل است.' },
      },
    },
  ],
};

export default config;
