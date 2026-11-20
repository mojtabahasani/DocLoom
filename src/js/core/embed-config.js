// Embed mode configuration. A host page opts in by defining `window.DOCLOOM_EMBED` before the app's
// <script>; without it every flag keeps its normal value and the app behaves exactly as before.
// Pure: parseEmbedConfig() is tested in node; embedConfig() reads the global once.
//
// `window.MD2HTML_EMBED` is the name host pages used before the app was renamed. Those pages are
// out there and we do not control them, so it is still accepted.

export const NORMAL = Object.freeze({ active: false, host: '', digits: 'fa', upload: true, library: true, server: true, brand: null });

/** Normalise a raw `DOCLOOM_EMBED` value. Anything that is not a plain object means "not embedded". */
export function parseEmbedConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return NORMAL;
  return Object.freeze({
    active: true,
    host: typeof raw.host === 'string' ? raw.host.slice(0, 60) : '',
    digits: raw.digits === 'en' ? 'en' : 'fa',
    // A capability is switched off only by an explicit `false`: a missing key keeps the normal feature.
    upload: raw.upload !== false,
    library: raw.library !== false,
    server: raw.server !== false,
    brand: raw.brand && typeof raw.brand === 'object' && !Array.isArray(raw.brand) ? raw.brand : null,
  });
}

let current;
/** The configuration of this page (read from the global on first use). */
export function embedConfig() {
  current ??= parseEmbedConfig(typeof window === 'undefined' ? undefined : (window.DOCLOOM_EMBED ?? window.MD2HTML_EMBED));
  return current;
}
