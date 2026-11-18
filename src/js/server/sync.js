// Library sync with the MD2Html server. Active ONLY when the page is served over http(s) and same-origin /api/health answers;
// on file:// nothing is fetched at all. IndexedDB stays the offline cache.
import { embedConfig } from '../core/embed-config.js';
import { db } from '../library/db.js';
import { store } from '../core/store.js';
import { library } from '../library/library.js';
import { isEmpty } from '../editor/preview.js';
import { applyPrefs } from '../library/prefs.js';
import { notify } from '../core/notify.js';
import { newId } from '../library/doc-model.js';
import { SYNC_STORES, keyOf, splitKey, isSynced, localTs, decide, conflictCopy } from './sync-core.js';

const STATE_KEY = 'md2html.sync';
const CLIENT = Math.random().toString(36).slice(2, 12);
const INTERVAL = 30000;
const PUSH_DELAY = 2000;

let state = { base: {}, lts: {}, tomb: {} };
let status = 'off'; // off | synced | syncing | offline | conflict | auth
let active = false;
let running = false;
let again = false;
let needFull = true;
let applying = false;
let timer = 0;
const dirty = new Set();

const setStatus = (s) => {
  if (s === status) return;
  status = s;
  store.emit('sync:status', s);
};

function loadState() {
  try {
    state = { base: {}, lts: {}, tomb: {}, ...JSON.parse(localStorage.getItem(STATE_KEY) || '{}') };
  } catch {
    /* private mode: sync state lives in memory only */
  }
}
function saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

async function req(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: { 'X-MD2Html': '1', 'X-MD2Html-Client': CLIENT, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (r.status === 401) throw Object.assign(new Error('auth'), { auth: true });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'http ' + r.status), { status: r.status });
  return j;
}

function onDbChange(e) {
  if (!active || applying || !SYNC_STORES.includes(e.store)) return;
  if (e.cleared) needFull = true;
  const idOf = (r) => (e.store === 'settings' ? r.key : r.id);
  for (const r of e.puts || []) {
    const id = idOf(r);
    if (!isSynced(e.store, id)) continue;
    if (e.store === 'brands' || e.store === 'settings') state.lts[keyOf(e.store, id)] = Date.now();
    delete state.tomb[keyOf(e.store, id)];
    dirty.add(keyOf(e.store, id));
  }
  for (const id of e.dels || []) {
    if (!isSynced(e.store, id)) continue;
    state.tomb[keyOf(e.store, id)] = Date.now();
    dirty.add(keyOf(e.store, id));
  }
  schedule(PUSH_DELAY);
}

function schedule(ms) {
  if (!active) return;
  clearTimeout(timer);
  timer = setTimeout(() => sync(), ms);
}

async function localEntry(s, id) {
  const rec = await db.get(s, id);
  if (rec) return { rec, entry: { ts: localTs(s, rec, state.lts) } };
  const k = keyOf(s, id);
  if (k in state.base) return { rec: null, entry: { ts: state.tomb[k] || (state.tomb[k] = Date.now()), deleted: true } };
  return { rec: null, entry: null };
}

async function candidateKeys(remote) {
  const out = new Set(dirty);
  dirty.clear();
  if (needFull) {
    needFull = false;
    for (const s of SYNC_STORES) {
      const ids = (await db.keys(s)).filter((id) => isSynced(s, id));
      const have = new Set(ids.map((id) => keyOf(s, id)));
      // Saved versions are immutable, so only unseen ones matter; everything else is compared by timestamp.
      for (const id of ids) if (s !== 'versions' || !(keyOf(s, id) in state.base)) out.add(keyOf(s, id));
      for (const k of Object.keys(state.base)) if (k.startsWith(s + '/') && !have.has(k)) out.add(k); // deleted while we were away
    }
  }
  for (const [k, r] of remote) {
    if (r.ts === state.base[k]) continue;
    if (r.deleted && !(k in state.base)) continue;
    out.add(k);
  }
  return out;
}

async function sync() {
  if (!active) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  clearTimeout(timer);
  let conflicts = 0;
  try {
    setStatus('syncing');
    const remote = new Map((await req('GET', '/api/sync/index')).items.map((r) => [keyOf(r.store, r.id), r]));
    const pulls = [];
    const pushes = [];
    const dels = [];
    for (const k of await candidateKeys(remote)) {
      const [s, id] = splitKey(k);
      if (!SYNC_STORES.includes(s) || !isSynced(s, id)) continue;
      const { rec, entry } = await localEntry(s, id);
      const r = remote.get(k);
      const d = decide({ store: s, local: entry, remote: r ? { ts: r.ts, deleted: r.deleted } : null, base: state.base[k] });
      if (d.act === 'noop') {
        if (entry && r && entry.deleted === !!r.deleted) {
          state.base[k] = r.ts;
          if (entry.deleted) delete state.tomb[k];
        }
      } else if (d.act === 'push') pushes.push({ s, id, rec, ts: entry.ts, ifTs: r ? r.ts : null });
      else if (d.act === 'pull' || d.act === 'pull-delete') pulls.push({ k, s, id, del: d.act === 'pull-delete', remoteTs: r.ts });
      else if (d.act === 'push-delete') dels.push({ k, s, id, ts: entry.ts });
      else if (d.act === 'conflict') {
        conflicts++;
        const copyId = newId();
        const row = d.winner === 'local' ? { s, id, rec, ts: entry.ts, ifTs: r.ts } : null;
        if (d.winner === 'local') {
          const theirs = (await req('GET', `/api/lib/${s}/${id}`)).data;
          await putLocal(s, [conflictCopy(theirs, copyId)]);
          pushes.push(row);
        } else {
          await putLocal(s, [conflictCopy(rec, copyId)]);
          pulls.push({ k, s, id, del: false, remoteTs: r.ts });
        }
        notify('سندی هم در این دستگاه و هم در سرور تغییر کرده بود؛ هر دو نگه داشته شد (نسخهٔ «تعارض»).', { duration: 6000 });
      }
    }
    await applyPulls(pulls);
    for (const p of pushes) {
      try {
        const body = { ts: p.ts, data: p.rec, ifTs: p.ifTs };
        await req('PUT', `/api/lib/${p.s}/${p.id}`, body);
        state.base[keyOf(p.s, p.id)] = p.ts;
      } catch (e) {
        if (e.status === 409) again = true;
        else if (e.status !== 413 && e.status !== 400) throw e; // an item the server refuses is skipped, not retried forever
      }
    }
    for (const d of dels) {
      await req('DELETE', `/api/lib/${d.s}/${d.id}?ts=${d.ts}`);
      state.base[d.k] = d.ts;
      delete state.tomb[d.k];
    }
    if (conflicts) again = true;
    saveState();
    setStatus(conflicts ? 'conflict' : 'synced');
    if (conflicts || pushes.length) store.emit('library:changed');
  } catch (e) {
    if (e.auth) {
      setStatus('auth');
      location.reload();
    } else setStatus('offline');
  } finally {
    running = false;
    if (again && active) {
      again = false;
      schedule(800);
    } else if (active) schedule(INTERVAL);
  }
}

async function putLocal(s, list) {
  applying = true;
  try {
    await db.putMany(s, list);
    for (const r of list) dirty.add(keyOf(s, s === 'settings' ? r.key : r.id));
  } finally {
    applying = false;
  }
}

async function applyPulls(pulls) {
  if (!pulls.length) return;
  const open = store.get('docId');
  let openChanged = false;
  let brandsChanged = false;
  for (let i = 0; i < pulls.length; i += 20) {
    const chunk = pulls.slice(i, i + 20);
    const fetchList = chunk.filter((p) => !p.del);
    const got = new Map();
    if (fetchList.length) for (const e of (await req('POST', '/api/lib/fetch', { keys: fetchList.map((p) => ({ store: p.s, id: p.id })) })).items) got.set(keyOf(e.store, e.id), e);
    applying = true;
    try {
      for (const p of chunk) {
        const e = got.get(p.k);
        if (p.del) await db.del(p.s, p.id);
        else if (e && !e.deleted) {
          await db.put(p.s, e.data);
          if (p.s === 'settings') applyPrefs({ [e.data.key]: e.data.value });
        } else continue;
        state.base[p.k] = e?.ts ?? p.remoteTs;
        delete state.tomb[p.k];
        if (p.s === 'brands' || p.s === 'settings') state.lts[p.k] = e?.ts ?? p.remoteTs;
        if (p.s === 'documents' && p.id === open) openChanged = true;
        if (p.s === 'brands') brandsChanged = true;
      }
    } finally {
      applying = false;
    }
  }
  if (brandsChanged) store.emit('backup:imported'); // brands module reloads from the database
  if (openChanged && !store.get('dirty')) await library.openFresh(open);
  else if (!store.get('dirty') && !store.get('title') && isEmpty()) {
    // A fresh device with an empty editor: show the newest pulled document instead of a blank page.
    const newest = (await library.list())[0];
    if (newest) await library.openFresh(newest.id);
  }
  store.emit('library:changed');
}

let readyResolve;
/** Resolves (true = server present, false = plain file/offline) once the one-time /api/health probe has finished. */
export const serverReady = new Promise((r) => (readyResolve = r));

export const syncStatus = () => status;
export const syncActive = () => active;
export const syncNow = () => (active ? sync() : Promise.resolve());

/** Probe same-origin /api/health once. Never touches the network on file:// or other non-web origins. */
export async function initSync() {
  const ok = embedConfig().server ? await probe() : false; // embed host without the MD2Html server: no probe at all
  readyResolve(ok);
  return ok;
}

async function probe() {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return false;
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    if (!j || j.app !== 'md2html') return false;
  } catch {
    return false;
  }
  active = true;
  loadState();
  db.onChange(onDbChange);
  setStatus('syncing');
  window.addEventListener('focus', () => schedule(300));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && schedule(300));
  window.addEventListener('online', () => schedule(300));
  if (typeof EventSource === 'function') {
    const es = new EventSource('/api/events');
    es.addEventListener('change', (ev) => {
      try {
        if (JSON.parse(ev.data).by === CLIENT) return;
      } catch {
        /* fall through: sync anyway */
      }
      schedule(400);
    });
    es.addEventListener('open', () => schedule(200));
  }
  store.emit('sync:active');
  sync();
  return true;
}
