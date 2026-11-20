// Environment variables were MD2HTML_* before the app became دیتاسیو / DataSave.
//
// New installs set DATASAVE_*, but the old names keep working: the LaunchAgent already installed on
// a machine sets MD2HTML_DATA and MD2HTML_PORT, and this server has to go on serving that user's
// library until they reinstall it. Renaming a variable must never be the reason a server starts up
// pointing at an empty data directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const APP = 'datasave';
export const LEGACY_APP = 'md2html';

/** `envVar('DATA')` → DATASAVE_DATA, else MD2HTML_DATA, else undefined. */
export const envVar = (name, env = process.env) => env[`DATASAVE_${name}`] ?? env[`MD2HTML_${name}`];

/**
 * Where the library lives. An explicit variable wins. Otherwise it is ~/Documents/DataSave — unless
 * that does not exist yet and the old ~/Documents/MD2Html does, in which case the user's existing
 * library is the answer and stays where it is. Moving 100+ MB of documents is the user's call, not
 * a side effect of an upgrade.
 */
export function defaultDataDir(env = process.env, home = os.homedir()) {
  const explicit = envVar('DATA', env);
  if (explicit) return explicit;
  const now = path.join(home, 'Documents', 'DataSave');
  const legacy = path.join(home, 'Documents', 'MD2Html');
  if (!exists(now) && exists(legacy)) return legacy;
  return now;
}

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}
