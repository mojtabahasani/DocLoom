// Full backup: export / import (JSON) with validation and merge-or-replace choice.
import { toFaDigits as fa } from '../content/persian.js';
import { notify } from '../core/notify.js';
import { store } from '../core/store.js';
import { el } from '../core/dom.js';
import { openModal } from '../ui/modal.js';
import { downloadFile } from '../export/files.js';
import { db, QuotaError } from './db.js';
import { buildBackup, validateBackup, planMerge, MAX_BACKUP_BYTES } from './backup.js';
import { versions } from './versions.js';
import { library } from './library.js';
import { applyPrefs } from './prefs.js';

const stamp = () => new Date().toISOString().slice(0, 10).replaceAll('-', '');

async function readAll() {
  const [documents, versionList, brands, rows] = await Promise.all([db.all('documents'), db.all('versions'), db.all('brands'), db.all('settings')]);
  return { documents, versions: versionList, brands, settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}

export async function exportBackup() {
  await library.flush();
  const data = await readAll();
  const backup = buildBackup(data);
  downloadFile(`md2html-backup-${stamp()}.json`, JSON.stringify(backup), 'application/json;charset=utf-8');
  notify(`پشتیبان ساخته شد: ${fa(data.documents.length)} سند، ${fa(data.versions.length)} نسخه.`);
}

function choose(counts) {
  return new Promise((resolve) => {
    let answer = null;
    const body = el('div', {},
      el('p', { text: `این فایل شامل ${fa(counts.documents)} سند، ${fa(counts.versions)} نسخه و ${fa(counts.brands)} برند است.` }),
      el('p', { class: 'modal-note', text: 'ادغام: سندهای تازه‌تر نگه داشته می‌شوند و چیزی پاک نمی‌شود. جایگزینی: همهٔ دادهٔ فعلی کتابخانه با محتوای فایل عوض می‌شود.' }),
    );
    openModal({
      title: 'ورود پشتیبان',
      body,
      onClose: () => resolve(answer),
      actions: [
        { label: 'انصراف', kind: '' },
        { label: 'ادغام', kind: 'soft', onClick: () => void (answer = 'merge') },
        { label: 'جایگزینی کامل', kind: 'danger', onClick: () => void (answer = 'replace') },
      ],
    });
  });
}

/** Validate `text` and apply it. Returns true on success. Exported for tests / palette. */
export async function importBackupText(text, mode) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    notify('فایل پشتیبان قابل خواندن نیست.');
    return false;
  }
  const r = validateBackup(obj);
  if (!r.ok) {
    notify(r.error);
    return false;
  }
  const chosen = mode || (await choose(r.counts));
  if (!chosen) return false;
  await library.flush();
  await versions.snapshot('before-import').catch(() => {});
  try {
    if (chosen === 'replace') {
      await db.clearAll();
      await db.putMany('documents', r.data.documents);
      await db.putMany('versions', r.data.versions);
      await db.putMany('brands', r.data.brands);
      await db.putMany('settings', Object.entries(r.data.settings).map(([key, value]) => ({ key, value })));
    } else {
      const plan = planMerge(await readAll(), r.data);
      await db.putMany('documents', plan.documents);
      await db.putMany('versions', plan.versions);
      await db.putMany('brands', plan.brands);
    }
  } catch (e) {
    notify(e instanceof QuotaError ? 'فضای ذخیره‌سازی مرورگر برای این پشتیبان کافی نیست.' : 'ورود پشتیبان انجام نشد.');
    return false;
  }
  if (chosen === 'replace') applyPrefs(r.data.settings);
  store.emit('backup:imported'); // brands reload from the database
  const docs = await library.list();
  await library.openFresh(docs[0]?.id ?? null);
  notify(`پشتیبان وارد شد: ${fa(r.counts.documents)} سند، ${fa(r.counts.versions)} نسخه.`);
  return true;
}

export function importBackup() {
  const input = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) return notify('فایل پشتیبان بزرگ‌تر از حد مجاز است.');
    importBackupText(await file.text());
  });
  document.body.append(input);
  input.click();
}
