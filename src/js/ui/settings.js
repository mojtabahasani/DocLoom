// Portable settings JSON: export (schema v3) and import (v1, v2, v3).
import { store } from '../core/store.js';
import { $ } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { validateSettings, buildSettings, MAX_SETTINGS_BYTES } from '../core/settings-schema.js';
import { downloadFile } from '../export/files.js';
import { refreshFurniture } from '../editor/preview.js';

export function exportSettings() {
  downloadFile('docloom-settings.json', JSON.stringify(buildSettings(store.snapshot()), null, 2), 'application/json;charset=utf-8');
  notify('تنظیمات ذخیره شد؛ متن سند، تصویرها و توکن‌ها داخل JSON نیستند.');
}

export function applySettingsText(text) {
  let cfg;
  try {
    cfg = JSON.parse(text);
  } catch {
    return false;
  }
  const result = validateSettings(cfg);
  if (!result.ok) return false;
  store.patch(result.patch);
  refreshFurniture();
  return true;
}

export function initSettings() {
  $('#exportSettings').addEventListener('click', exportSettings);
  $('#importSettings').addEventListener('click', () => $('#settingsFile').click());
  $('#settingsFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_SETTINGS_BYTES) {
      notify('فایل تنظیمات بزرگ‌تر از حد مجاز است.');
      return;
    }
    if (applySettingsText(await file.text())) notify('تنظیمات JSON بارگذاری و اعمال شد.');
    else notify('فایل تنظیمات معتبرِ DocLoom نیست یا مقدارهای آن خارج از محدوده‌اند.');
  });
}
