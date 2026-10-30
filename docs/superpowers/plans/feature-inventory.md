# فهرست امکانات نسخهٔ قدیمی (مرجع بدون پسرفت)

مرجع: `1file-old/MD2Html.html`. هر ردیف یک رفتار قابل‌مشاهده است. `[x]` یعنی در ساختار ماژولار `src/js` منتقل شده است. ستون آخر ماژول مقصد است.
علامت ⇢ یعنی رفتار عمداً بهبود یافته است (توضیح همان سطر).

## ۱. ورود محتوا
- [x] انتخاب فایل با کلیک روی ناحیهٔ بارگذاری (`.md .markdown .txt .html .htm`) — `editor/files.js`
- [x] کشیدن و رها کردن فایل روی ناحیهٔ بارگذاری، با برجسته شدن ناحیه (`drag`) — `editor/files.js`
- [x] ⇢ رها کردن فایل در هر جای صفحه هم فایل را باز می‌کند و مرورگر به فایل نمی‌رود — `editor/files.js`
- [x] ناحیهٔ «فایل کپی‌شده را اینجا بچسبانید» (contenteditable بدون تایپ؛ فقط `insertFromPaste`)، کلیک راست و Paste یا ⌘V — `editor/paste.js`
- [x] پیام راهنما وقتی مرورگر فقط نام فایل را می‌دهد، و وقتی چیزی در حافظه نیست — `editor/paste.js`
- [x] ⌘V در جای خالی صفحه (خارج از input/textarea/contenteditable/پیش‌نمایش) فایل را بارگذاری می‌کند — `editor/paste.js`
- [x] انتخاب فایل مناسب از clipboard: اولویت با `.md .markdown .txt .html .htm`، وگرنه فایل اول — `editor/files.js (pickSourceFile)`
- [x] `.md/.markdown/.txt`: متن در کادر منبع، عنوان از نام فایل اگر خالی بود، رندر + پیام «فایل روی همین دستگاه خوانده شد» — `editor/files.js`
- [x] `.html/.htm`: پاک‌سازی، تنظیم عنوان از `<title>`، ریست تاریخچه، رفتن به حالت سورس با HTML مرتب‌شدهٔ اصلی — `editor/files.js`
- [x] پسوند ناشناخته: پیام «فقط فایل MD، TXT یا HTML» — `editor/files.js`
- [x] ⇢ فایل بزرگ‌تر از ۵ مگابایت: پیام خطای فارسی (اسپک §۷) — `editor/files.js`
- [x] خطای خواندن فایل: پیام فارسی — `editor/files.js`
- [x] reset مقدار input فایل بعد از انتخاب تا همان فایل دوباره قابل انتخاب باشد — `editor/files.js`
- [x] کادر «متن Markdown یا متن ساده» با placeholder؛ هر تغییر پیش‌نمایش را از نو می‌سازد — `ui/panels.js` + `editor/preview.js`
- [x] فیلد «زیرعنوان (اختیاری)» — `ui/panels.js`
- [x] فیلد «عنوان سند» (اکنون در هدر) — `ui/panels.js`, `index.html`

## ۲. تحلیل Markdown
- [x] تیتر `#` تا `####` (⇢ تا `######`) — `content/markdown.js`
- [x] پاراگراف؛ خط‌های پشت‌سرهم با `<br>` — `content/markdown.js`
- [x] ``` بلوک کد ``` (⇢ `~~~` هم) — `content/markdown.js`
- [x] خط افقی `---`, `***`, `___` — `content/markdown.js`
- [x] جدول (سطر اول سرصفحه، سطر جداکننده حذف می‌شود)؛ ⇢ نشانهٔ تراز `:-:` و جدول بدون `|` ابتدا و انتها — `content/markdown.js`
- [x] نقل‌قول `>` (⇢ محتوای داخلش بازگشتی: لیست، چند پاراگراف، تو در تو) — `content/markdown.js`
- [x] فهرست `- * +` و `1. 1)` (⇢ تو در تو، ارقام فارسی) — `content/markdown.js`
- [x] درون‌خطی: `**bold**`, `__bold__`, `*em*`, `_em_` (⇢ بدون شکستن snake_case)، `` `code` ``, `[text](url)` (⇢ `~~del~~` و `![alt](src)`) — `content/markdown.js`
- [x] فقط لینک‌های امن (`http/https/mailto`، ⇢ `tel`)؛ لینک نامعتبر متن ساده می‌ماند — `content/url.js`
- [x] HTML خام داخل Markdown escape می‌شود — `content/markdown.js`
- ⇢ لینک نسبی (بدون http) دیگر به نشانی صفحه تبدیل نمی‌شود و متن می‌ماند (در سند ذخیره‌شده بی‌معنی بود)

## ۳. حالت HTML سورس
- [x] دکمهٔ «سورس HTML» (aria-pressed)؛ در حالت سورس همان دکمه سورس را اعمال می‌کند — `editor/source.js`
- [x] عنوان بخش و برچسب حالت: «سورس HTML سند / ویرایش کد» و «پیش‌نمایش سند / زنده» — `editor/source.js`
- [x] ویرایشگر کد: textarea شفاف روی رنگ‌آمیزی، شمارهٔ سطر، هم‌زمانی اسکرول — `editor/source.js`, `content/html-source.js`
- [x] رنگ‌آمیزی: تگ، براکت، attribute، مقدار، لینک، کامنت، doctype، entity — `content/html-source.js`
- [x] کلید Tab دو فاصله درج می‌کند — `editor/source.js`
- [x] «به‌روزرسانی سورس از پیش‌نمایش» — `editor/source.js`
- [x] «مرتب‌سازی HTML» (beautify: سطرها، CSS، pre/script/textarea دست‌نخورده) — `content/html-source.js`
- [x] «اعمال سورس به پیش‌نمایش»: پاک‌سازی، بدون اجرای اسکریپت/CSS مبدأ، خطای ساختار، پیام موفقیت — `editor/source.js`
- [x] یادداشت راهنمای سورس — `index.html`

## ۴. حالت وب (Paste محتوای وب)
- [x] Paste داخل پیش‌نمایش: اگر `text/html` بود پاک‌سازی (⇢ با پارس بی‌اثر DOMParser) و درج در جای مکان‌نما — `editor/paste.js`
- [x] کلاس `web-layout`: صفحهٔ عریض، بدون حاشیهٔ کاغذ، جدول/تصویر/pre درون عرض — `styles/document.css`, store `webLayout`
- [x] رندر دوبارهٔ Markdown حالت وب را خاموش می‌کند (⇢ بارگذاری HTML هم) — `editor/preview.js`
- [x] Paste متن ساده با `insertText` — `editor/paste.js`
- [x] Paste تصویر داخل پیش‌نمایش (به هدف جاری: درون‌متنی/سربرگ/پاورقی/آپلود) — `editor/paste.js`
- [x] drop داخل پیش‌نمایش مسدود است — `editor/preview.js`
- [x] کلیک روی لینک داخل پیش‌نمایش ناوبری نمی‌کند — `editor/preview.js`

## ۵. ویرایش دیداری و ابزارها
- [x] پیش‌نمایش contenteditable — `editor/preview.js`
- [x] undo/redo با تاریخچهٔ ۱۰۰تایی، دکمه‌ها و ⌘Z / ⌘⇧Z / ⌘Y / Ctrl فقط داخل پیش‌نمایش — `core/history.js`, `ui/shortcuts.js`
- [x] دکمه‌های واگرد/انجام دوباره غیرفعال وقتی چیزی نیست — `ui/panels.js`
- [x] «انتخاب همه» و «کپی متن» (clipboard با fallback `execCommand` و پیام) — `editor/toolbar.js`, `export/files.js`
- [x] کنترل اندازه: − / + (۱۱ تا ۲۳ پیکسل)، نمایش درصد با ارقام فارسی، و منوی «اندازهٔ متن» (کوچک/معمولی/بزرگ/خیلی بزرگ؛ گزینهٔ اضافه برای مقدار واردشده) — `ui/panels.js`
- [x] نوار شناور انتخاب متن: راست‌چین، وسط، چپ‌چین، بولد، A+، A−، چهار هایلایت (زرد/سبز/آبی/صورتی)، رنگ متن، رنگ زمینه، پاک‌کردن قالب — `editor/toolbar.js`
- [x] موقعیت‌دهی نوار بالای انتخاب، پنهان شدن با کلیک بیرون، resize و حالت سورس — `editor/toolbar.js`
- [x] درج: تیتر جدید، کارت برجسته، نقل‌قول، جداکننده — `editor/toolbar.js`
- [x] درج تصویر از فایل (درون‌متنی، PNG/JPG/WebP/GIF، حداکثر ۸ مگابایت) — `editor/images.js`
- [x] دکمهٔ لینک: متن + نشانی (http/https/mailto، ⇢ tel)، گزینهٔ «بازشدن در برگهٔ جدید»؛ ⇢ `prompt` قدیمی با modal جایگزین شد — `editor/toolbar.js`, `ui/modal.js`
- [x] درج در جای آخرین مکان‌نمای ذخیره‌شده، وگرنه انتهای سند — `editor/preview.js`

## ۶. ظاهر سند
- [x] چهار قالب رنگی: رسمی(navy)، سبز، گرم، ساده — `ui/panels.js`, `styles/document.css`
- [x] اندازهٔ قلم سند — store `font`
- [x] حاشیهٔ چاپ A4 (۱۲ تا ۲۸ میلی‌متر) — `ui/panels.js`
- [x] ⇢ فونت وزیرمتن جاسازی‌شده در برنامه و پیش‌نمایش (و اختیاری در HTML خروجی)

## ۷. سربرگ و پاورقی
- [x] نمایش/عدم نمایش عنوان+زیرعنوان، سربرگ، پاورقی — `content/furniture.js`
- [x] متن سربرگ و پاورقی — `content/furniture.js`
- [x] تصویر سربرگ و پاورقی (انتخاب فایل، چسباندن از clipboard، حذف) — `editor/images.js`, `ui/panels.js`
- [x] تراز: کشیده در عرض / وسط / راست / چپ (`flex-start`/`flex-end`) — `content/furniture.js`
- [x] عرض (۴۰ تا ۹۰۰) و ارتفاع (۲۰ تا ۲۴۰) تصویر — `ui/panels.js`
- [x] تکرار در صفحه‌های چاپ (`repeat-header` / `repeat-footer`) با CSS ثابت‌شده در خروجی — `export/html.js`
- [x] به‌روزرسانی فقط بلوک‌های furniture بدون از دست رفتن ویرایش بدنه — `editor/preview.js (refreshFurniture)`
- [x] ⇢ نشانگر `data-md2-furniture` از پاک‌سازی عبور می‌کند تا بعد از بارگذاری HTML تکراری نشود — `content/sanitize.js`

## ۸. آپلود zi2
- [x] فیلد نشانی API (پیش‌فرض `https://zi2.ir/api/upload/upload.php`) — `ui/panels.js`
- [x] «آپلود تصویر انتخاب‌شده»: بدون فایل ← انتخاب فایل ← آپلود خودکار — `editor/images.js`
- [x] اعتبارسنجی HTTPS برای نشانی و برای لینک برگشتی — `editor/images.js`
- [x] تأیید قبل از ارسال (عمومی شدن لینک)؛ ⇢ `confirm` با modal — `editor/images.js`
- [x] FormData با فیلد `file`، خواندن `success`, `data.upload.fileUrl|url`، اصلاح مسیر `/storage/uploads/` — `editor/images.js`
- [x] درج تصویر آپلودشده با لینک https، پاک‌سازی `pendingUpload`، پیام خطای فارسی — `editor/images.js`

## ۹. تحلیل محتوا
- [x] سطر، نویسه، بدون فاصله، واژه، حجم تقریبی، لینک، تصویر، «جدول / تیتر» (⇢ ارقام فارسی) با به‌روزرسانی زنده — `content/analytics.js`, `ui/metrics.js`

## ۱۰. خروجی‌ها
- [x] HTML مستقل با رنگ قالب، @page، تکرار سربرگ/پاورقی؛ ⇢ استایل سربرگ/پاورقی و فونت جاسازی‌شده (قابل خاموش شدن) — `export/html.js`
- [x] Save As: `showSaveFilePicker` با نوع/پسوند، AbortError بی‌صدا، fallback؛ ⇢ `prompt` نام فایل با modal — `export/files.js`
- [x] نام فایل امن از عنوان (NFKC، ۷۰ نویسه) — `export/files.js`
- [x] Markdown (⇢ جدول با سطر جداکننده، فهرست تو در تو و شماره‌دار، بلوک کد fenced) — `export/markdown.js`
- [x] PDF = چاپ پنجرهٔ جدید با A4 و حاشیه؛ پیام وقتی popup مسدود است — `export/print.js`
- [x] ایمیل: استایل inline، موضوع، modal با «کپی موضوع»، «انتخاب محتوای ایمیل»، «کپی متن ساده» — `export/email.js`
- [x] هر خروجی با سند خالی پیام «ابتدا متن یا فایل…» می‌دهد (⇢ شامل Markdown؛ و متن راهنمای خالی دیگر محتوا حساب نمی‌شود) — `export/actions.js`
- [x] چاپ مرورگر (⌘P) فقط سند را نشان می‌دهد — `styles/print.css`
- [x] ⇢ همهٔ خروجی‌ها در منوی «خروجی» هدر + دکمهٔ سریع «دریافت HTML» — `ui/topbar.js`

## ۱۱. تنظیمات JSON
- [x] صدور: ⇢ `schemaVersion: 3` (ابرمجموعهٔ v2 + `appTheme`, `embedFontInExport`, `openLinksInNewTab`)، بدون متن/تصویر/توکن — `core/settings-schema.js`, `ui/settings.js`
- [x] ورود v1 (theme, fontSize, pageMarginMm, mastheadText)، v2، v3 — `core/settings-schema.js`
- [x] اعتبارسنجی سخت: کلیدهای ناشناخته، `app`، بازه‌ها، boolean، تراز، https برای endpoint، `uploadField === "file"` — `core/settings-schema.js`
- [x] سقف ۳۲ کیلوبایت و پیام‌های خطای فارسی — `ui/settings.js`
- [x] اعمال روی همهٔ کنترل‌ها و بازسازی سربرگ/پاورقی — `ui/settings.js`, `ui/panels.js`

## ۱۲. سند تازه، هشدار خروج، اعلان‌ها
- [x] «سند تازه»: پاک‌سازی متن، عنوان، سربرگ، پاورقی، تصاویر، تاریخچه، حالت سورس؛ ⇢ `confirm` حذف شد و toast «برگردان» ۸ ثانیه‌ای جایگزین است — `editor/document.js`, `core/notify.js`
- [x] `beforeunload` وقتی سند dirty است؛ با سند تازه برداشته می‌شود — `core/guard.js`
- [x] toast وضعیت (۳ ثانیه، `role=status`، `aria-live`) — `core/notify.js`
- [x] یادداشت «متن و تصویر به سرور فرستاده نمی‌شوند؛ با بستن صفحه پیش‌نویس پاک می‌شود» — `index.html`

## ۱۳. موبایل و واکنش‌گرایی
- [x] دسکتاپ: سه ستون و اسکرول درونی؛ ≤۱۱۰۰: دو ستون و ستون طراحی زیر؛ ≤۷۲۰: چیدمان پشته‌ای (محتوا، سند، طراحی) — `styles/layout.css`
- [x] دکمه‌های «انتخاب همه/کپی متن» در موبایل پنهان می‌شوند؛ هدر فشرده — `styles/layout.css`
- [x] متن‌های کوچک‌تر و حاشیهٔ کمتر برای سند و حالت وب در موبایل — `styles/document.css`

## ۱۴. دسترس‌پذیری
- [x] focus-visible، برچسب aria برای دکمه‌های آیکونی، `role=dialog` + trap فوکوس در modal، Esc، `prefers-reduced-motion` — `styles/*`, `ui/modal.js`

## ۱۵. جدید در ۱A (اسپک §۵ بند ۳)
- [x] پوستهٔ روشن/تیره/سیستم برنامه (ذخیره در localStorage؛ ۱B به IndexedDB می‌برد) — `ui/theme.js`
- [x] هدر: عنوان سند، جای برند و کتابخانه (غیرفعال)، چیپ ⌘K (پالت در ۱B)، منوی خروجی — `index.html`, `ui/topbar.js`
- [x] فونت وزیرمتن ۴۰۰/۷۰۰ جاسازی‌شده، favicon درون‌خطی — `build.mjs`, `index.html`

## ناانتقال‌یافته
- هیچ‌چیز.
