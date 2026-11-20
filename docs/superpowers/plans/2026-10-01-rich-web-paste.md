# نمایش عریض محتوای وب پیست‌شده Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HTML غنی پیست‌شده از وب را با عرض آزاد و قالب‌های امن قابل‌حمل در پیش‌نمایش نشان بده.

**Architecture:** در فایل مستقل DataSave، نوع محتوای clipboard به تابع درج HTML داده می‌شود. برای HTML غنی، یک وضعیت نمایشی روی پیش‌نمایش فعال می‌شود که محدودیت عرض کاغذ را برمی‌دارد؛ سندهای متنی و Markdown در حالت فعلی می‌مانند. پاک‌سازی HTML موجود حفظ می‌شود.

**Tech Stack:** HTML، CSS و JavaScript بومی در فایل مستقل؛ بدون وابستگی یا سرور.

## Global Constraints

- محتوا و تصویر به سرور فرستاده نمی‌شوند.
- اسکریپت‌ها و استایل‌های ناامن نباید اجرا شوند.
- حالت عریض فقط با پیست HTML غنی فعال شود.
- فایل Markdown و متن ساده در قاب سند فعلی بمانند.

---

### Task 1: افزودن حالت نمایشی وب به پیش‌نمایش

**Files:**
- Modify: `/Users/macminim4/MyApp/Vpn-Project/DataSave/DataSave.html`

**Interfaces:**
- `insertClipboardHTML(html, wide = true)` درج امن محتوای HTML را انجام می‌دهد و در حالت wide، کلاس `web-layout` را روی `#preview` فعال می‌کند.
- `clear` و بارگذاری Markdown حالت `web-layout` را پاک می‌کنند.

- [ ] به `insertClipboardHTML` پارامتر wide پیش‌فرض‌شده اضافه کن؛ پس از پاک‌سازی از `safeClone`، برای درج HTML کلیپ‌بورد `preview.classList.add("web-layout")` را اعمال کن.
- [ ] در listener پیست، مسیر `text/html` را با wide فعال نگه دار و مسیر متن ساده را بدون تغییر حالت اجرا کن.
- [ ] در listener پاک‌سازی سند و بارگذاری Markdown، `preview.classList.remove("web-layout")` را اعمال کن.
- [ ] CSS مربوط به `.paper.web-layout` را طوری اضافه کن که `max-width:none`, `width:100%`, `min-height:100%` و حاشیه/پس‌زمینهٔ کاغذی عادی را حذف کند؛ تصویر، جدول و عناصر عریض نباید از پنل بیرون بزنند.
- [ ] کلاس‌های محتوایی و استایل‌های امن clipboard را از سازوکار موجود `safeClone` استفاده کن؛ whitelist امنیتی را گسترش نده مگر برای حفظ مستقیم ویژگی‌های HTML استاندارد لازم باشد.

**Verification:** مرور کد مسیر پیست HTML، متن ساده، Markdown و پاک‌کردن؛ اجرای دستی توسط کاربر در مرورگر برای اطمینان از عرض و چیدمان.
