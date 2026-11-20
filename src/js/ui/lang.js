// Live bilingual EN/FA language switcher and DOM localization binder.
import { $, $$ } from '../core/dom.js';
import { store } from '../core/store.js';
import { embedConfig } from '../core/embed-config.js';
import { setDigitMode } from '../core/digits.js';
import { normalizeLang, dirForLang, t, GROUP_I18N, TOOL_I18N } from '../core/i18n.js';
import { DOC_THEMES } from '../export/theme.js';
import { faPercent } from '../content/persian.js';
import { refreshDrawers } from './drawer.js';
import { palette } from './palette.js';

/** Update only the text label inside an element while keeping child SVG/em/input elements intact. */
function setTextPreservingChildren(el, text) {
  if (!el) return;
  const kids = [...el.childNodes].filter((n) => n.nodeType === 3 && n.nodeValue.trim() !== '');
  if (kids.length) {
    kids[0].nodeValue = (el.querySelector('input, svg') ? ' ' : '') + text;
    for (let i = 1; i < kids.length; i++) kids[i].nodeValue = '';
  } else if (!el.children.length) {
    el.textContent = text;
  } else {
    el.append(document.createTextNode(' ' + text));
  }
}

const TEXT_SELECTORS = [
  ['aside[aria-label="محتوا"] .heading h2, aside[aria-label="Content"] .heading h2', 'contentPanel'],
  ['aside[aria-label="محتوا"] .heading .step, aside[aria-label="Content"] .heading .step', 'contentStep'],
  ['aside[aria-label="طراحی"] .heading h2, aside[aria-label="Design"] .heading h2', 'designPanel'],
  ['aside[aria-label="طراحی"] .heading .step, aside[aria-label="Design"] .heading .step', 'designStep'],
  ['#paletteHint .lbl', 'commands'],
  ['#quickHtml .lbl', 'exportHtml'],
  ['#clear .lbl', 'newDoc'],
  ['label[for="title"]', 'docTitleLabel'],
  ['[data-tool-id="brand"] > .label', 'docBrandLabel'],
  ['#libraryBtn .lbl', 'library'],
  ['#filesBtn .lbl', 'files'],
  ['#serverBtn .lbl', 'server'],
  ['#exportMenuBtn > span', 'moreExports'],
  ['#drop b', 'dropTitle'],
  ['#drop small', 'dropHint'],
  ['#pasteZone b', 'pasteTitle'],
  ['#dg-input .or', 'orText'],
  ['label[for="source"]', 'sourceLabel'],
  ['#cleanupBtn', 'cleanupBtn'],
  ['label[for="subtitle"]', 'subtitleLabel'],
  ['#tocInsert', 'tocInsert'],
  ['#dg-files > .muted', 'filesNote'],
  ['#dg-out > .muted', 'outNote'],
  ['[data-tool-id="appTheme"] > .label', 'appTheme'],
  ['[data-tool-id="portable"] > .label', 'portableSettings'],
  ['#exportSettings', 'saveJson'],
  ['#importSettings', 'loadJson'],
  ['#glyphLabel', 'groupGlyphs'],
  ['[data-glyph="icon"]', 'glyphIcon'],
  ['[data-glyph="emoji"]', 'glyphEmoji'],
  ['[data-tool-id="embedFont"]', 'embedFont'],
  ['[data-tool-id="autosave"]', 'autosave'],
  ['#dg-prefs > .muted', 'prefsNote'],
  ['#centerTitle', 'centerTitle'],
  ['#modeLabel', 'modeLive'],
  ['#readBtn > span', 'readMode'],
  ['#sourceToggle > span', 'htmlSource'],
  ['#refreshSource', 'refreshSource'],
  ['#formatSource', 'formatSource'],
  ['#applySource', 'applySource'],
  ['#sourcePane > .note', 'sourceNote'],
  ['.stage > .foot', 'stageFoot'],
  ['[data-tool-id="colorTheme"] > .label', 'colorTheme'],
  ['label[for="fontSelect"]', 'fontSize'],
  ['#fontSelect option[value="14"]', 'fontSmall'],
  ['#fontSelect option[value="15"]', 'fontNormal'],
  ['#fontSelect option[value="17"]', 'fontLarge'],
  ['#fontSelect option[value="19"]', 'fontXLarge'],
  ['label[for="margin"]', 'marginA4'],
  ['#dg-blocks > .label', 'addToDoc'],
  ['[data-block="heading"]', 'blockHeading'],
  ['[data-block="card"]', 'blockCard'],
  ['[data-block="quote"]', 'blockQuote'],
  ['[data-block="hr"]', 'blockHr'],
  ['#addImage', 'blockImage'],
  ['#addLink', 'blockLink'],
  ['#dg-blocks label.check', 'openNewTab'],
  ['label.check:has(#showTitle)', 'showTitle'],
  ['label.check:has(#showHeader)', 'showHeader'],
  ['label[for="masthead"]', 'mastheadLabel'],
  ['#mastheadImage', 'mastheadImageBtn'],
  ['#clearHeaderImage', 'clearImg'],
  ['#headerPaste', 'pasteImg'],
  ['label[for="headerAlign"]', 'headerAlign'],
  ['label[for="footerAlign"]', 'footerAlign'],
  ['label[for="headerWidth"]', 'widthPx'],
  ['label[for="headerHeight"]', 'heightPx'],
  ['label[for="footerWidth"]', 'widthPx'],
  ['label[for="footerHeight"]', 'heightPx'],
  ['label.check:has(#repeatHeader)', 'repeatPrint'],
  ['label.check:has(#showFooter)', 'showFooter'],
  ['label[for="footerText"]', 'footerLabel'],
  ['#footerImage', 'footerImageBtn'],
  ['#clearFooterImage', 'clearImg'],
  ['#footerPaste', 'pasteImg'],
  ['label.check:has(#repeatFooter)', 'repeatPrint'],
  ['label.check:has(#letterMode)', 'letterMode'],
  ['label[for="letterDate"]', 'letterDate'],
  ['#letterToday', 'todayBtn'],
  ['label[for="letterNumber"]', 'letterNumber'],
  ['#letterTake', 'takeNumber'],
  ['label[for="letterAttach"]', 'letterAttach'],
  ['label[for="letterTo"]', 'letterTo'],
  ['label[for="letterSubject"]', 'letterSubject'],
  ['label.check:has(#letterGreeting)', 'letterGreeting'],
  ['label[for="letterSigner"]', 'letterSigner'],
  ['label[for="letterRole"]', 'letterRole'],
  ['#letterResetSign', 'resetSign'],
  ['#letterFields > .muted', 'letterNote'],
  ['label[for="wmPreset"]', 'wmLabel'],
  ['label[for="wmText"]', 'wmTextLabel'],
  ['label.check:has(#qrOn)', 'qrToggle'],
  ['label[for="qrKind"]', 'qrKindLabel'],
  ['#qrValueLabel', 'qrValLabel'],
  ['label[for="qrPos"]', 'qrPosLabel'],
  ['label[for="qrSize"]', 'qrSizeLabel'],
  ['label[for="uploadEndpoint"]', 'uploadEndpointLabel'],
  ['#uploadImage', 'uploadBtn'],
  ['#dg-layers-upload > .muted', 'uploadNote'],
  ['#dg-insight h3', 'insightHeading'],
  ['#destGroup .menu-label', 'destGroup'],
  ['[data-dest="download"] > span', 'destDownload'],
  ['[data-dest="beside"] > span', 'destBeside'],
  ['[data-dest="folder"] > span', 'destFolder'],
  ['[data-export="html"] > span', 'expHtml'],
  ['[data-export="interactive"] > span', 'expInteractive'],
  ['[data-export="markdown"] > span', 'expMarkdown'],
  ['[data-export="docx"] > span', 'expDocx'],
  ['[data-export="png"] > span', 'expPng'],
  ['[data-export="present"] > span', 'expPresent'],
  ['[data-export="present-file"] > span', 'expPresentFile'],
  ['[data-export="pdf-direct"] > span', 'expPdfDirect'],
  ['#pdfNumbers > span', 'pdfNumbers'],
  ['[data-export="batch"] > span', 'expBatch'],
  ['[data-export="share"] > span', 'expShare'],
  ['[data-export="pdf"] > span', 'expPdf'],
  ['[data-export="email"] > span', 'expEmail'],
  ['#selectionToolbar [data-format="justifyRight"]', 'alignRightBtn'],
  ['#selectionToolbar [data-format="justifyCenter"]', 'alignCenterBtn'],
  ['#selectionToolbar [data-format="justifyLeft"]', 'alignLeftBtn'],
  ['#selectionToolbar [data-format="removeFormat"]', 'clearFormatBtn'],
];

const PLACEHOLDER_SELECTORS = [
  ['#title', 'docTitlePlaceholder'],
  ['#source', 'sourcePlaceholder'],
  ['#subtitle', 'subtitlePlaceholder'],
  ['#masthead', 'mastheadPlaceholder'],
  ['#footerText', 'footerPlaceholder'],
  ['#letterAttach', 'letterAttachPh'],
  ['#letterTo', 'letterToPh'],
];

const DRAWER_NAV_KEYS = {
  content: 'navContent',
  design: 'navDesign',
  office: 'navOffice',
  layers: 'navLayers',
};

const TOOL_MAP = [
  ['[data-move="clear"]', 'clear'],
  ['.field:has([data-move="title"])', 'title'],
  ['.field:has([data-move="brandWrap"])', 'brand'],
  ['#drop', 'file'],
  ['#pasteZone', 'paste'],
  ['.field:has(#source)', 'source'],
  ['#cleanupBtn', 'cleanup'],
  ['.field:has(#subtitle)', 'subtitle'],
  ['#tocList', 'toc'],
  ['[data-move="libraryBtn"]', 'library'],
  ['[data-move="filesBtn"]', 'files'],
  ['[data-move="serverBtn"]', 'server'],
  ['[data-move="exportWrap"]', 'exports'],
  ['.field:has([data-move="appTheme"])', 'appTheme'],
  ['#dg-prefs .field:has(#exportSettings)', 'portable'],
  ['#dg-prefs .field:has(#glyphLabel)', 'glyph'],
  ['label.check:has(#embedFont)', 'embedFont'],
  ['label.check:has(#autosave)', 'autosave'],
  ['.field:has(#themeSwatches)', 'colorTheme'],
  ['.field:has(#fontSelect)', 'fontSize'],
  ['.field:has(#margin)', 'margin'],
  ['[data-block="heading"]', 'heading'],
  ['[data-block="card"]', 'card'],
  ['[data-block="quote"]', 'quote'],
  ['[data-block="hr"]', 'hr'],
  ['#addImage', 'image'],
  ['#addLink', 'link'],
  ['#dg-office-mast', 'mast'],
  ['#dg-office-letter', 'letter'],
  ['#dg-layers-wm', 'wm'],
  ['#dg-layers-upload', 'upload'],
  ['#dg-insight .analytics', 'insight'],
];

function tagToolIds() {
  for (const [sel, key] of TOOL_MAP) {
    const node = $(sel);
    if (node && !node.dataset.toolId) node.dataset.toolId = key;
  }
}

/** Apply active UI language ('en' or 'fa') to DOM attributes, labels, drawers, and digits. */
export function applyLang(rawLang) {
  const lang = normalizeLang(rawLang);
  tagToolIds();

  document.documentElement.lang = lang;
  document.documentElement.dir = dirForLang(lang);
  document.title = t('pageTitle', lang);

  if (embedConfig().digits !== 'en') setDigitMode(lang === 'en' ? 'en' : 'fa');
  const zoom = $('#zoom');
  if (zoom) zoom.textContent = faPercent((store.get('font') / 15) * 100);

  for (const [sel, key] of TEXT_SELECTORS) setTextPreservingChildren($(sel), t(key, lang));
  for (const [sel, key] of PLACEHOLDER_SELECTORS) {
    const el = $(sel);
    if (el) el.placeholder = t(key, lang);
  }
  const preview = $('#preview');
  if (preview) preview.dataset.placeholder = t('previewPh', lang);

  for (const sel of ['#headerAlign', '#footerAlign']) {
    const s = $(sel);
    if (!s) continue;
    for (const [val, key] of [['stretch', 'alignStretch'], ['center', 'alignCenter'], ['flex-start', 'alignStart'], ['flex-end', 'alignEnd']]) {
      const opt = $(`option[value="${val}"]`, s);
      if (opt) opt.textContent = t(key, lang);
    }
  }

  for (const [drawerName, key] of Object.entries(DRAWER_NAV_KEYS)) {
    const root = $(`[data-drawer="${drawerName}"]`);
    if (root) root.dataset.navLabel = t(key, lang);
  }

  for (const section of $$('.dgroup[data-group]')) {
    const entry = GROUP_I18N[section.dataset.group]?.[lang];
    if (entry) {
      section.dataset.name = entry.name;
      section.dataset.short = entry.short;
    }
  }

  for (const node of $$('[data-tool-id]')) {
    const entry = TOOL_I18N[node.dataset.toolId]?.[lang];
    if (entry) node.dataset.tool = entry;
  }

  for (const th of DOC_THEMES) {
    const btn = $(`.theme[data-theme="${th.id}"]`);
    if (!btn) continue;
    const label = lang === 'en' ? th.labelEn || th.label : th.label;
    const span = $('span', btn);
    if (span) span.textContent = label;
    btn.title = lang === 'en' ? `Document theme: ${label}` : `قالب رنگی سند: ${label}`;
  }

  refreshDrawers();

  const toggle = $('#langToggle');
  const lbl = $('#langLabel');
  if (toggle) toggle.title = t('langToggleTitle', lang);
  if (lbl) lbl.textContent = t('langButton', lang);
}

/** Wire the topbar language toggle, command palette actions, and store listener. */
export function initLang() {
  const toggle = $('#langToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = store.get('lang') === 'fa' ? 'en' : 'fa';
      store.set('lang', next);
    });
  }

  palette.register({
    id: 'lang-en',
    title: 'Switch Language to English / تغییر زبان به انگلیسی',
    group: 'Language',
    keywords: 'language english en ltr زبان انگلیسی',
    run: () => store.set('lang', 'en'),
  });
  palette.register({
    id: 'lang-fa',
    title: 'Switch Language to Persian / تغییر زبان به فارسی',
    group: 'Language',
    keywords: 'language persian farsi fa rtl زبان فارسی',
    run: () => store.set('lang', 'fa'),
  });

  store.on('lang', applyLang);
  applyLang(store.get('lang'));
}
