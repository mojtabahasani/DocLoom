// Build identity. `build.mjs` replaces the two globals through esbuild's `define`, so the
// built file carries the version from package.json and the day it was produced. Importing a
// module straight from source — node tests, or serving `src/` by hand — gets 'dev' instead.
/* global __APP_VERSION__, __APP_BUILT__ */
export const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const BUILT_AT = typeof __APP_BUILT__ === 'string' ? __APP_BUILT__ : '';
export const isDev = () => VERSION === 'dev';
