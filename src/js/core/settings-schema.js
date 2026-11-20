// Portable settings JSON: validation for schema v1/v2/v3 and v3 export. Pure.
import { THEME_IDS } from '../export/theme.js';

// The name written into an exported settings file. The old one is still accepted on import, so a
// settings JSON saved before the app was renamed to «DocLoom» keeps opening.
export const APP_NAME = 'DocLoom';
const KNOWN_APP_NAMES = [APP_NAME, 'DocLoom'];
const THEMES = THEME_IDS;
const ALIGNS = ['stretch', 'center', 'flex-start', 'flex-end'];
const APP_THEMES = ['light', 'dark', 'system'];
export const MAX_SETTINGS_BYTES = 32768;

const KEYS_V1 = ['schemaVersion', 'app', 'theme', 'fontSize', 'pageMarginMm', 'mastheadText'];
const KEYS_V2 = [
  ...KEYS_V1, 'footerText', 'showTitle', 'showHeader', 'showFooter', 'repeatHeader', 'repeatFooter',
  'headerAlign', 'headerWidth', 'headerHeight', 'footerAlign', 'footerWidth', 'footerHeight', 'uploadEndpoint', 'uploadField',
];
const KEYS_V3 = [...KEYS_V2, 'appTheme', 'embedFontInExport', 'openLinksInNewTab'];
const KEYS = { 1: KEYS_V1, 2: KEYS_V2, 3: KEYS_V3 };

const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const bool = (v) => typeof v === 'boolean';

/** @returns {{ok:true, version:number, patch:object} | {ok:false, error:string}} patch uses store key names. */
export function validateSettings(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return { ok: false, error: 'format' };
  const version = cfg.schemaVersion;
  if (![1, 2, 3].includes(version) || !KNOWN_APP_NAMES.includes(cfg.app)) return { ok: false, error: 'format' };
  if (Object.keys(cfg).some((k) => !KEYS[version].includes(k))) return { ok: false, error: 'format' };
  if (
    !THEMES.includes(cfg.theme) || !int(cfg.fontSize, 11, 23) || !int(cfg.pageMarginMm, 12, 28) ||
    typeof cfg.mastheadText !== 'string' || cfg.mastheadText.length > 160
  )
    return { ok: false, error: 'values' };
  const patch = { theme: cfg.theme, font: cfg.fontSize, margin: cfg.pageMarginMm, masthead: cfg.mastheadText };
  if (version >= 2) {
    const ok =
      typeof cfg.footerText === 'string' &&
      [cfg.showTitle, cfg.showHeader, cfg.showFooter, cfg.repeatHeader, cfg.repeatFooter].every(bool) &&
      ALIGNS.includes(cfg.headerAlign) && ALIGNS.includes(cfg.footerAlign) &&
      [cfg.headerWidth, cfg.footerWidth].every((v) => int(v, 40, 900)) &&
      [cfg.headerHeight, cfg.footerHeight].every((v) => int(v, 20, 240)) &&
      typeof cfg.uploadEndpoint === 'string' && cfg.uploadField === 'file';
    if (!ok) return { ok: false, error: 'values' };
    if (cfg.uploadEndpoint && !/^https:\/\//i.test(cfg.uploadEndpoint)) return { ok: false, error: 'endpoint' };
    Object.assign(patch, {
      footerText: cfg.footerText, showTitle: cfg.showTitle, showHeader: cfg.showHeader, showFooter: cfg.showFooter,
      repeatHeader: cfg.repeatHeader, repeatFooter: cfg.repeatFooter, headerAlign: cfg.headerAlign,
      headerWidth: cfg.headerWidth, headerHeight: cfg.headerHeight, footerAlign: cfg.footerAlign,
      footerWidth: cfg.footerWidth, footerHeight: cfg.footerHeight, uploadEndpoint: cfg.uploadEndpoint, uploadField: 'file',
    });
  }
  if (version >= 3) {
    if (!APP_THEMES.includes(cfg.appTheme) || !bool(cfg.embedFontInExport) || !bool(cfg.openLinksInNewTab))
      return { ok: false, error: 'values' };
    Object.assign(patch, {
      appTheme: cfg.appTheme, embedFontInExport: cfg.embedFontInExport, openLinksInNewTab: cfg.openLinksInNewTab,
    });
  }
  return { ok: true, version, patch };
}

/** Build the v3 export from store state (a superset of v2). Never includes document text, images or tokens. */
export function buildSettings(s) {
  return {
    schemaVersion: 3,
    app: APP_NAME,
    theme: s.theme,
    fontSize: s.font,
    pageMarginMm: s.margin,
    mastheadText: s.masthead,
    footerText: s.footerText,
    showTitle: s.showTitle,
    showHeader: s.showHeader,
    showFooter: s.showFooter,
    repeatHeader: s.repeatHeader,
    repeatFooter: s.repeatFooter,
    headerAlign: s.headerAlign,
    headerWidth: s.headerWidth,
    headerHeight: s.headerHeight,
    footerAlign: s.footerAlign,
    footerWidth: s.footerWidth,
    footerHeight: s.footerHeight,
    uploadEndpoint: s.uploadEndpoint,
    uploadField: s.uploadField,
    appTheme: s.appTheme,
    embedFontInExport: s.embedFontInExport,
    openLinksInNewTab: s.openLinksInNewTab,
  };
}
