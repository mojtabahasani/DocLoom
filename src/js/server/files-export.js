// Export destination: download (default) | beside the linked file | a chosen folder on the server.
import { store } from '../core/store.js';
import { $, $$ } from '../core/dom.js';
import { notify } from '../core/notify.js';
import { confirmDialog } from '../ui/modal.js';
import { setSaveSink, safeFilename } from '../export/files.js';
import { fapi, errorText } from './files-api.js';
import { WRITE_EXT, extOf, joinPath, besideTarget, baseName } from './files-core.js';
import { pickLocation } from './files-picker.js';
import { syncActive } from './sync.js';

let dest = 'download'; // download | beside | folder
let folder = '';

function paintMenu() {
  const group = $('#destGroup');
  if (!group) return;
  group.hidden = !syncActive();
  const linked = !!store.get('link');
  $$('[data-dest]', group).forEach((b) => {
    const on = b.dataset.dest === dest;
    b.setAttribute('aria-checked', String(on));
    b.classList.toggle('on', on);
    if (b.dataset.dest === 'beside') {
      b.disabled = !linked;
      b.title = linked ? '' : 'ابتدا فایلی را از «فایل‌ها» باز کنید یا «ذخیره به نام» بزنید';
    }
  });
  const hint = $('#destFolderHint');
  if (hint) hint.textContent = folder ? baseName(folder) : '';
}

async function chooseFolder() {
  const pick = await pickLocation({ title: 'پوشهٔ ذخیرهٔ خروجی‌ها', startDir: folder, submitLabel: 'انتخاب پوشه' });
  if (pick) {
    folder = pick.dir;
    dest = 'folder';
  } else if (!folder) dest = 'download';
  paintMenu();
}

async function put(path, body, overwrite) {
  const bytes = typeof body === 'string' ? body : body instanceof Uint8Array ? body : new Uint8Array(await new Blob([body]).arrayBuffer());
  try {
    return await fapi.write(path, bytes, { overwrite });
  } catch (e) {
    if (e.status === 409 && e.message === 'exists' && !overwrite) {
      const ok = await confirmDialog({ title: 'فایل از قبل هست', message: `«${baseName(path)}» از قبل کنار فایل یا در این پوشه وجود دارد. جایگزین شود؟`, confirmLabel: 'جایگزین کن', danger: true });
      return ok ? put(path, body, true) : null;
    }
    throw e;
  }
}

/** The sink used by export/files.js saveAs(): returns true when the export was stored on the server. */
async function sink(name, body) {
  if (dest === 'download' || !syncActive()) return false;
  if (!WRITE_EXT.has(extOf(name))) {
    notify('این نوع خروجی را نمی‌شود روی سرور ذخیره کرد؛ دانلود می‌شود.');
    return false;
  }
  const link = store.get('link');
  let target;
  if (dest === 'beside') {
    if (!link) {
      notify('سند به فایلی وصل نیست؛ خروجی دانلود می‌شود.');
      return false;
    }
    target = besideTarget({ linkPath: link.path, name, titleBase: safeFilename(store.get('title'), 'x').slice(0, -2) });
  } else {
    if (!folder) {
      await chooseFolder();
      if (dest !== 'folder') return false;
    }
    target = joinPath(folder, name);
  }
  try {
    const r = await put(target, body, false);
    if (!r) return true; // the user declined to overwrite: nothing more to do
    notify('ذخیره شد: ' + r.path, { duration: 6000 });
    return true;
  } catch (e) {
    notify(errorText(e) + ' خروجی دانلود می‌شود.');
    return false;
  }
}

export function initExportDest() {
  setSaveSink(sink);
  const group = $('#destGroup');
  if (!group) return;
  $$('[data-dest]', group).forEach((b) =>
    b.addEventListener('click', async () => {
      if (b.dataset.dest === 'folder') {
        $('#exportMenuBtn').click(); // close the menu, then pick
        await chooseFolder();
      } else {
        dest = b.dataset.dest;
        paintMenu();
      }
    }),
  );
  $('#exportMenuBtn')?.addEventListener('click', paintMenu);
  store.on('link', paintMenu);
  store.on('sync:active', paintMenu);
  paintMenu();
}
