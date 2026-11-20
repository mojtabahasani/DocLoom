// "پاک‌سازی خروجی هوش مصنوعی": rule list with counts and before/after samples; apply = version snapshot + undoable change.
import { store } from '../core/store.js';
import { el } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { toFaDigits } from '../content/persian.js';
import { RULES, defaultRules, cleanMarkdown } from '../content/cleanup.js';
import { cleanDOM } from '../content/cleanup-dom.js';
import { preview, isEmpty, previewInSync, renderFromSource, markChanged } from '../editor/preview.js';
import { versions } from '../library/versions.js';
import { openModal } from './modal.js';

const ALL_ON = Object.fromEntries(RULES.map((r) => [r.id, true]));
const sum = (report, on) => report.reduce((n, r) => n + (on[r.id] ? r.count : 0), 0);

const RULE_I18N_EN = {
  arabic: { label: 'Arabic Yeh/Kaf -> Persian', hint: 'Normalize Arabic ي ك and Arabic-Indic digits to standard Persian' },
  zwnj: { label: 'ZWNJ half-spaces', hint: 'Join separated prefixes ("می ", "نمی ") and suffixes ("ها، تر، ترین...") with ZWNJ' },
  digits: { label: 'Latin digits -> Persian (in FA sentences)', hint: 'Applied inside Persian text only; technical tokens like "Python 3" or "H2O" stay untouched' },
  punct: { label: 'Persian punctuation & quotes', hint: 'Convert commas/semicolons/question marks to ، ؛ ؟ and quotes to «» in Persian prose' },
  'emoji-decor': { label: 'Decorative heading/list emojis', hint: 'Strip leading emojis on headings and list items only' },
  'emoji-all': { label: 'Remove all emojis', hint: 'Strip every emoji in document body (off by default)' },
  filler: { label: 'AI conversational filler', hint: 'Remove leading/trailing assistant boilerplate paragraphs' },
  artifacts: { label: 'Markdown artifacts', hint: 'Clean orphan ** markers, excess blank lines, trailing spaces, duplicate rules' },
};

function analyzeCurrent(useSource) {
  if (useSource) return cleanMarkdown(store.get('source'), ALL_ON).report;
  return cleanDOM(preview.cloneNode(true), ALL_ON).report;
}

/** Applies the chosen rules. Always snapshots first ('before-cleanup') and offers "برگردان". Returns the change count. */
export async function applyCleanup(on = defaultRules()) {
  const useSource = previewInSync();
  if (!useSource && isEmpty()) return notify('ابتدا متن یا فایل خود را وارد کنید.'), 0;
  const prev = { source: store.get('source'), html: preview.innerHTML };
  await versions.snapshot('before-cleanup').catch(() => {});
  let report;
  if (useSource) {
    const r = cleanMarkdown(prev.source, on);
    report = r.report;
    if (sum(report, ALL_ON)) {
      store.set('source', r.text);
      renderFromSource();
    }
  } else {
    report = cleanDOM(preview, on).report;
    if (sum(report, ALL_ON)) markChanged();
  }
  const total = sum(report, ALL_ON);
  if (!total) return notify('چیزی برای پاک‌سازی با قاعده‌های انتخاب‌شده پیدا نشد.'), 0;
  notify(`پاک‌سازی انجام شد؛ ${toFaDigits(total)} تغییر.`, {
    action: {
      label: 'برگردان',
      run: () => {
        store.set('source', prev.source);
        preview.innerHTML = prev.html;
        markChanged();
      },
    },
  });
  return total;
}

/** Text with each ZWNJ shown as a small dot so the fix is visible. */
function sampleText(t) {
  const out = el('span', { dir: 'auto' });
  t.split('\u200c').forEach((part, i) => {
    if (i) out.append(el('span', { class: 'zw', title: 'نیم‌فاصله' }));
    out.append(part);
  });
  return out;
}

export function openCleanup() {
  const en = store.get('lang') !== 'fa';
  const useSource = previewInSync();
  if (!useSource && isEmpty()) return notify('ابتدا متن یا فایل خود را وارد کنید.');
  const report = analyzeCurrent(useSource);
  const on = defaultRules();
  const summary = el('p', { class: 'cl-summary', role: 'status' });
  const refresh = () => {
    const n = sum(report, on);
    summary.textContent = en
      ? n ? `${n} changes will be applied for enabled rules.` : 'No changes needed for the enabled rules.'
      : n ? `${toFaDigits(n)} تغییر با قاعده‌های روشن اعمال می‌شود.` : 'با قاعده‌های روشن، تغییری لازم نیست.';
  };
  const rows = RULES.map((rule) => {
    const r = report.find((x) => x.id === rule.id);
    const meta = en ? RULE_I18N_EN[rule.id] || rule : rule;
    const box = el('input', { type: 'checkbox', id: 'cl-' + rule.id, ...(on[rule.id] ? { checked: '' } : {}) });
    const row = el(
      'div',
      { class: 'cl-row' + (on[rule.id] ? '' : ' off') + (r.count ? '' : ' empty') },
      el('label', { class: 'cl-head', for: 'cl-' + rule.id }, box, el('span', { class: 'cl-label', text: meta.label }), el('em', { class: 'cl-count', text: en ? String(r.count) : r.count ? toFaDigits(r.count) : '۰' })),
      el('p', { class: 'cl-hint', text: meta.hint }),
    );
    if (r.samples.length) {
      row.append(
        el(
          'details',
          { class: 'cl-samples' },
          el('summary', { text: en ? 'Before & after sample' : 'نمونهٔ قبل و بعد' }),
          ...r.samples.map((s) =>
            el('div', { class: 'cl-sample' }, el('div', { class: 'cl-before' }, sampleText(s.before)), el('div', { class: 'cl-after' }, sampleText(s.after))),
          ),
        ),
      );
    }
    box.addEventListener('change', () => {
      on[rule.id] = box.checked;
      row.classList.toggle('off', !box.checked);
      refresh();
    });
    return row;
  });
  refresh();
  const body = el(
    'div',
    { class: 'cleanup' },
    el('p', {
      class: 'modal-note',
      text: en
        ? (useSource ? 'Cleanup runs on Markdown source. ' : 'Preview has direct edits; cleanup runs on preview text. ') +
          'Code blocks, inline code, URLs, and email addresses are never modified. A snapshot is saved before applying so you can undo.'
        : (useSource ? 'پاک‌سازی روی متن Markdown انجام می‌شود.' : 'سند ویرایش شده است؛ پاک‌سازی روی متن پیش‌نمایش انجام می‌شود.') +
          ' بلوک کد، کد درون‌خطی، نشانی وب و ایمیل هرگز تغییر نمی‌کنند. پیش از اعمال، یک نسخه ذخیره می‌شود و می‌توانید برگردانید.',
    }),
    ...rows,
    summary,
  );
  openModal({
    title: en ? 'Clean AI Output' : 'پاک‌سازی خروجی هوش مصنوعی',
    body,
    wide: true,
    actions: [
      { label: en ? 'Cancel' : 'انصراف', kind: '' },
      { label: en ? 'Apply Cleanup' : 'اعمال پاک‌سازی', kind: 'primary', onClick: () => void applyCleanup({ ...on }) },
    ],
  });
}
