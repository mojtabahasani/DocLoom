import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSettings, buildSettings } from '../src/js/core/settings-schema.js';
import { DEFAULTS } from '../src/js/core/store.js';

const v1 = { schemaVersion: 1, app: 'DataSave', theme: 'green', fontSize: 17, pageMarginMm: 20, mastheadText: 'شرکت' };
const v2 = JSON.parse(readFileSync(new URL('../datasave-settings.example.json', import.meta.url), 'utf8'));
const v3 = { ...v2, schemaVersion: 3, appTheme: 'dark', embedFontInExport: false, openLinksInNewTab: true };

test('example file is a valid v2 fixture', () => {
  assert.equal(v2.schemaVersion, 2);
  const r = validateSettings(v2);
  assert.equal(r.ok, true);
  assert.equal(r.version, 2);
  assert.equal(r.patch.theme, 'navy');
  assert.equal(r.patch.font, 15);
  assert.equal(r.patch.uploadEndpoint, 'https://zi2.ir/api/v1/upload.php');
});

test('v1 is accepted and only carries v1 fields', () => {
  const r = validateSettings(v1);
  assert.equal(r.ok, true);
  assert.deepEqual(r.patch, { theme: 'green', font: 17, margin: 20, masthead: 'شرکت' });
});

test('v3 is accepted and carries app-level fields', () => {
  const r = validateSettings(v3);
  assert.equal(r.ok, true);
  assert.equal(r.version, 3);
  assert.equal(r.patch.appTheme, 'dark');
  assert.equal(r.patch.embedFontInExport, false);
  assert.equal(r.patch.headerWidth, 220);
});

test('export is schemaVersion 3, superset of v2, and round-trips through validation', () => {
  const out = buildSettings({ ...DEFAULTS, masthead: 'x', font: 19, appTheme: 'light' });
  assert.equal(out.schemaVersion, 3);
  for (const k of Object.keys(v2)) assert.ok(k in out, 'missing v2 key ' + k);
  const r = validateSettings(JSON.parse(JSON.stringify(out)));
  assert.equal(r.ok, true);
  assert.equal(r.patch.font, 19);
  assert.equal(r.patch.appTheme, 'light');
  assert.ok(!('source' in out) && !('mastheadImage' in out) && !('pendingUpload' in out));
});

test('default state exports valid settings', () => {
  assert.equal(validateSettings(buildSettings(DEFAULTS)).ok, true);
});

const bad = (cfg, label) => test('rejects ' + label, () => assert.equal(validateSettings(cfg).ok, false));
bad(null, 'null');
bad([], 'array');
bad({ ...v1, app: 'Other' }, 'wrong app');
bad({ ...v1, schemaVersion: 4 }, 'unknown version');
bad({ ...v1, schemaVersion: 0 }, 'version 0');
bad({ ...v1, extra: 1 }, 'unknown key in v1');
bad({ ...v1, footerText: 'x' }, 'v2 key inside v1');
bad({ ...v2, appTheme: 'dark' }, 'v3 key inside v2');
bad({ ...v1, theme: 'purple' }, 'bad theme');
bad({ ...v1, fontSize: 10 }, 'font too small');
bad({ ...v1, fontSize: 24 }, 'font too large');
bad({ ...v1, fontSize: 15.5 }, 'non-integer font');
bad({ ...v1, pageMarginMm: 11 }, 'margin too small');
bad({ ...v1, pageMarginMm: 29 }, 'margin too large');
bad({ ...v1, mastheadText: 'x'.repeat(161) }, 'masthead too long');
bad({ ...v1, mastheadText: 5 }, 'masthead not string');
bad({ ...v2, showFooter: 'yes' }, 'v2 non-boolean');
bad({ ...v2, headerAlign: 'left' }, 'v2 bad align');
bad({ ...v2, headerWidth: 39 }, 'v2 width low');
bad({ ...v2, footerHeight: 241 }, 'v2 height high');
bad({ ...v2, uploadField: 'image' }, 'v2 uploadField');
bad({ ...v2, uploadEndpoint: 'http://zi2.ir/x' }, 'v2 non-https endpoint');
bad({ ...v2, footerText: undefined }, 'v2 missing field');
bad({ ...v3, appTheme: 'sepia' }, 'v3 bad appTheme');
bad({ ...v3, embedFontInExport: 1 }, 'v3 non-boolean embed');

test('empty endpoint is allowed', () => {
  assert.equal(validateSettings({ ...v2, uploadEndpoint: '' }).ok, true);
});
