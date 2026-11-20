// The prompt handed to an outside model (ChatGPT, Gemini, …) so its Markdown lands clean in DocLoom.
// Canonical text: docs/قالب-گزارش.md quotes it verbatim and tests/report-prompt.test.mjs asserts they match.
// Pure: no DOM, no state.

export const REPORT_PROMPT = `تو یک گزارش فارسی به زبان Markdown می‌نویسی که در برنامه‌ای به نام DocLoom باز
می‌شود و از آن PDF، Word، تصویر یا سند چاپی ساخته می‌شود. دقیقاً این قواعد را
رعایت کن:

ساختار
- با یک «# عنوان گزارش» شروع کن. بخش‌های اصلی «##» و زیربخش‌ها «###».
  تیترها کوتاه باشند (حداکثر ۶۰ نویسه) چون فهرست مطالب از همین‌ها ساخته می‌شود.
- هر پاراگراف را در **یک خط** بنویس و بین پاراگراف‌ها یک خط خالی بگذار.
  متن را با Enter نشکن؛ خطوط پشت‌سرهم در خروجی تبدیل به شکست خط می‌شوند.
- حداکثر یک خط خالی بین بلوک‌ها. فاصله‌ی آخر خط نگذار.

نوشتار فارسی
- «ی» و «ک» فارسی (نه ي و ك عربی).
- نیم‌فاصله را خودت بگذار: می‌رود، نمی‌شود، کتاب‌ها، بزرگ‌تر، بیش‌ترین.
- ارقام فارسی در جمله‌ی فارسی: ۱۴۰۵، ۳۲ درصد. جداکننده‌ی هزارگان «٬» و
  اعشار «٫»: ۱۲٬۴۵۰٫۵ — ولی نام‌های لاتین دست‌نخورده: Python 3، GPT-4، H2O.
- علائم فارسی: ، ؛ ؟ و نقل‌قول «...». پیش از علامت فاصله نگذار.
- هیچ ایموجی‌ای در ابتدای تیتر یا آیتم فهرست نگذار.

چیزهایی که مطلقاً نباید باشد
- هیچ جمله‌ی مقدمه یا خداحافظی: نه «حتماً!»، نه «در ادامه گزارش شما»، نه
  «امیدوارم مفید باشد»، نه «اگر سؤالی داشتید بپرسید». فقط خودِ گزارش.
- بدون توضیح درباره‌ی کاری که کردی. اولین کاراکتر خروجی باید «#» باشد.
- بدون HTML خام، بدون LaTeX و فرمول $...$، بدون Mermaid، بدون پانویس [^1].
- بدون لینک ارجاعی [متن][شماره] و بدون آدرس لخت؛ هر لینک به شکل
  [متن لینک](https://...) باشد وگرنه لینک نمی‌شود.

امکاناتی که آزادانه استفاده کن
- جدول با سطر جداکننده و تراز: |:---|---:|:---:|
- فهرست با «-» و شماره‌دار با «۱.»؛ تو در تو با دو فاصله تورفتگی.
- چک‌لیست: «- [ ] کار مانده» و «- [x] کار انجام‌شده».
- کادر تأکید در یکی از این پنج شکل، به‌عنوان نقل‌قول:
  > [!نکته] متن
  > [!راهنما] متن
  > [!مهم] متن
  > [!هشدار] متن
  > [!خطر] متن
- بلوک کد با سه بک‌تیک و نام زبان (js، ts، python، html، css، json، bash، sql).
- جداکننده‌ی بخش: --- (دو بار پشت سر هم نگذار)
- تأکید: **پررنگ** و *مورب* و ~~خط‌خورده~~ و \`کد درون‌خطی\`.

اگر عدد داری که باید نمودار شود
جدولی بساز که ستون اولش برچسب باشد و بقیه‌ی ستون‌ها **فقط عدد** داشته باشند.
واحد را در سرستون بنویس، نه داخل خانه‌ها. مثال درست:

| ماه | فروش (میلیون تومان) | سود (میلیون تومان) |
|---|---:|---:|
| فروردین | ۱۲۰ | ۱۸ |
| اردیبهشت | ۱۴۵ | ۲۴ |

«۱۲۰ میلیون» داخل خانه ستون را از حالت عددی خارج می‌کند و نمودار ساخته نمی‌شود.

خروجی را فقط به‌صورت یک بلوک Markdown بده، بدون هیچ متن دیگری دور آن.`;

export const LETTER_ADDON = `این یک نامه‌ی اداری است. سند را با این بلوک شروع کن تا برنامه حالت نامه را
تشخیص دهد و سربرگ و بلوک امضا را خودش بسازد:

باسمه تعالی

به: نام گیرنده
موضوع: موضوع نامه

با سلام و احترام
متن نامه در پاراگراف‌های کوتاه.

بعد از متن چیزی برای امضا و تاریخ و شماره ننویس؛ آن‌ها را برنامه از برند
می‌گیرد. اگر پیوست دارد، خط «پیوست: ...» را زیر «موضوع:» بگذار.`;

export const REPORT_PROMPT_EN = `You are writing a clean Markdown report designed to open directly in DocLoom and export to HTML, Word (.docx), PNG, or PDF. Follow these rules strictly:

Structure
- Start directly with "# Report Title". Use "##" for main sections and "###" for subsections. Keep headings concise (<= 60 characters) since the Table of Contents is generated from them.
- Write each paragraph on a single line, separated by one blank line. Do not hard-wrap paragraphs with manual line breaks.
- Never include raw HTML, LaTeX math ($...$), Mermaid blocks, or footnotes ([^1]).
- Always format links as [Link Text](https://...) rather than bare URLs or reference-style links.

Output Purity
- Zero preamble or closing chatter (no "Sure!", no "Here is your report:", no follow-up questions). The very first character must be "#".

Formatting Features
- Tables with alignment markers: |:---|---:|:---:|
- Checklists: "- [ ] pending" and "- [x] completed"
- Callouts as blockquotes using one of these five markers:
  > [!NOTE] text
  > [!TIP] text
  > [!IMPORTANT] text
  > [!WARNING] text
  > [!CAUTION] text
- Fenced code blocks with language tags (js, ts, python, html, css, json, bash, sql).

Chartable Numeric Tables
If your data should be plotted as a chart, make the first column labels and keep all remaining columns strictly numeric. Put units in the column header, never inside data cells:

| Quarter | Revenue (USD M) | Profit (USD M) |
|---|---:|---:|
| Q1 | 120 | 18 |
| Q2 | 145 | 24 |

Return only the Markdown document inside a single code block.`;

export const LETTER_ADDON_EN = `This is an official letter. Begin the document with the following metadata header so DocLoom activates letter layout and attaches the brand masthead and signature block automatically:

To: Recipient Name
Subject: Letter Subject

Dear Recipient,
Write the letter body in clear, concise paragraphs.

Do not add date, reference number, or signature lines at the bottom; DocLoom injects those from the active brand. Add "Attachments: ..." beneath "Subject:" if needed.`;

/** The prompt to hand over. `letter` appends the official-letter addon; `lang` chooses 'en' or 'fa'. */
export function reportPrompt({ letter = false, lang = 'fa' } = {}) {
  const base = lang === 'en' ? REPORT_PROMPT_EN : REPORT_PROMPT;
  const addon = lang === 'en' ? LETTER_ADDON_EN : LETTER_ADDON;
  return letter ? base + '\n\n' + addon : base;
}
