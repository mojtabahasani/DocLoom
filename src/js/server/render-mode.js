// "Render mode": the app loaded by the server's headless Chrome at /render. No UI work: it fetches the document and brand
// from the server, rebuilds the exported page and signals readiness (window.__datasaveReady) so Chrome can print it.
import { store } from '../core/store.js';
import { sanitizeToFragment } from '../content/sanitize.js';
import { cleanMarkdown, defaultRules } from '../content/cleanup.js';
import { cleanDOM } from '../content/cleanup-dom.js';
import { preview, renderFromSource, applyLook } from '../editor/preview.js';
import { loadHTMLContent } from '../editor/files.js';
import { docToPatch } from '../library/doc-model.js';
import { brands, applyBrand } from '../brand/brands.js';
import { buildExportHTML } from '../export/html.js';
import { kindOfPath, stemOf } from './files-core.js';

export const isRenderMode = () => location.pathname === '/render';

const getJSON = async (url) => {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url.split('?')[0]} ${r.status}`);
  return r.json();
};

async function loadBrand(id) {
  const e = await getJSON('/api/lib/brands/' + encodeURIComponent(id));
  if (!e?.data) throw new Error('brand-not-found');
  await brands.save(e.data);
  return id;
}

async function defaultBrand() {
  try {
    const e = await getJSON('/api/lib/settings/defaultBrandId');
    return e?.data?.value || null;
  } catch {
    return null;
  }
}

export async function runRender() {
  try {
    const q = new URLSearchParams(location.search);
    const brandParam = q.get('brand');
    const cleanup = q.get('cleanup') === '1';
    if (q.get('doc')) {
      const e = await getJSON('/api/lib/documents/' + encodeURIComponent(q.get('doc')));
      const doc = e.data;
      if (!doc) throw new Error('doc-not-found');
      const id = brandParam || doc.brandId;
      if (id) await loadBrand(id).catch(() => {});
      // The brand was loaded just above, so images the document references (rather than carries)
      // resolve here — without this the letterhead would be missing from every rendered PDF.
      store.patch(docToPatch(doc, brands.any(doc.brandId)));
      preview.replaceChildren(sanitizeToFragment(doc.html || ''));
      applyLook();
      if (brandParam) applyBrand(brandParam, { refresh: true });
    } else if (q.get('path')) {
      const f = await getJSON('/api/files/read?' + new URLSearchParams({ path: q.get('path') }));
      const id = brandParam || (await defaultBrand());
      if (id) await loadBrand(id).catch((err) => { if (brandParam) throw err; });
      if (id && brands.get(id)) applyBrand(id, { refresh: false });
      if (kindOfPath(f.path) === 'html') {
        loadHTMLContent(f.content, { quiet: true });
        if (!store.get('title')) store.set('title', stemOf(f.name));
        if (cleanup) cleanDOM(preview, defaultRules());
      } else {
        store.set('title', stemOf(f.name));
        store.set('source', cleanup ? cleanMarkdown(f.content, defaultRules()).text : f.content);
        renderFromSource();
      }
    } else throw new Error('no-document');

    const html = buildExportHTML();
    window.__datasaveHTML = html;
    document.open();
    document.write(html);
    document.close();
    await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 4000))]);
    await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
    window.__datasaveReady = true;
  } catch (e) {
    window.__datasaveError = String(e?.message || e);
  }
}
