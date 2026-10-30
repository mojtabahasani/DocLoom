// The ONLY place that holds application state. Everything else uses store.get / set / patch / on / emit.
export const DOC_DEFAULTS = {
  title: '',
  subtitle: '',
  source: '',
  masthead: '',
  mastheadImage: '',
  footerText: '',
  footerImage: '',
  showTitle: true,
  showHeader: true,
  showFooter: true,
  repeatHeader: false,
  repeatFooter: false,
  webLayout: false,
};

export const DEFAULTS = {
  ...DOC_DEFAULTS,
  headerAlign: 'stretch',
  headerWidth: 220,
  headerHeight: 58,
  footerAlign: 'stretch',
  footerWidth: 220,
  footerHeight: 55,
  theme: 'navy', // document colour theme: navy | green | warm | mono
  font: 15,
  margin: 18,
  uploadEndpoint: 'https://zi2.ir/api/upload/upload.php',
  uploadField: 'file',
  openLinksInNewTab: true,
  embedFontInExport: true,
  appTheme: 'system', // light | dark | system
  autosave: true,
  docId: null, // id of the library document being edited
  dirty: false,
  sourceMode: false,
  pendingUpload: null,
  imageTarget: 'inline', // inline | masthead | footer | upload (what the next chosen image is for)
  savedRange: null, // last selection range inside the preview
};

export function createStore(initial = DEFAULTS) {
  const state = { ...initial };
  const subs = new Map(); // key -> Set<fn>
  const fire = (key, ...args) => subs.get(key)?.forEach((fn) => fn(...args));
  return {
    get: (key) => state[key],
    snapshot: () => ({ ...state }),
    set(key, value) {
      if (Object.is(state[key], value)) return;
      const prev = state[key];
      state[key] = value;
      fire(key, value, prev);
      fire('*', key, value, prev);
    },
    patch(obj) {
      for (const [k, v] of Object.entries(obj)) this.set(k, v);
    },
    /** Subscribe to a state key, '*' (any key) or a custom event name. Returns unsubscribe. */
    on(key, fn) {
      if (!subs.has(key)) subs.set(key, new Set());
      subs.get(key).add(fn);
      return () => subs.get(key).delete(fn);
    },
    emit: (event, ...args) => fire(event, ...args),
  };
}

export const store = createStore();
