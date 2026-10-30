// Document colours and the base stylesheet of standalone exports (pure data; shared by html.js and interactive.js).
export const THEME_COLORS = {
  navy: ['#1c5263', '#edf3f2'],
  green: ['#286b57', '#edf5ee'],
  warm: ['#925f37', '#f8efdf'],
  mono: ['#353b40', '#f0f1f1'],
};

export const FONT_STACK = "Vazirmatn,'Segoe UI',Tahoma,Arial,sans-serif";

/** [accent, tint] for the current settings snapshot (custom brand colours win when the brand theme is on). */
export function themeColors(s) {
  const custom = s.theme === 'brand' && s.brandColors?.primary ? [s.brandColors.primary, s.brandColors.accent || s.brandColors.primary] : null;
  return custom || THEME_COLORS[s.theme] || THEME_COLORS.navy;
}
