// PNG page splitting (pure). Atoms are the smallest unsplittable blocks of the rendered document, in px from its top:
// [{top, bottom, keepNext?}] sorted by top. Pages never cut an atom; an atom taller than a page is split as a last resort.
export const PAGE_W = 1240;
export const PAGE_H = 1754; // A4 at 150 dpi
export const PAGE_MARGIN_Y = 70;

/** -> [{start, end}] source ranges (px) covering the document, one per page. contentH = usable height per page. */
export function paginate(atoms, contentH, totalH) {
  const pages = [];
  const n = atoms.length;
  if (!(contentH > 0) || !(totalH > 0)) return pages;
  let start = 0;
  let i = 0;
  let guard = 0;
  while (i < n && guard++ < 10000) {
    const limit = start + contentH;
    let last = -1;
    for (let j = i; j < n && atoms[j].bottom <= limit + 0.5; j++) last = j;
    if (last < i) {
      // the next atom does not fit even at the top of a page: hard split
      const end = Math.min(limit, totalH);
      pages.push({ start, end });
      start = end;
      if (start >= totalH) return pages;
      // skip atoms fully consumed by the hard split
      while (i < n && atoms[i].bottom <= start + 0.5) i++;
      continue;
    }
    while (last > i && atoms[last].keepNext) last--; // keep a heading with what follows
    i = last + 1;
    const end = i >= n ? Math.min(totalH, limit) : atoms[last].bottom;
    pages.push({ start, end });
    start = i < n ? Math.max(end, atoms[i].top) : end;
    if (i < n && atoms[i].top < end) start = end; // overlapping atoms: never go backwards
  }
  if (!pages.length) pages.push({ start: 0, end: Math.min(totalH, contentH) });
  else if (start < totalH - 1 && i >= n && pages[pages.length - 1].end < totalH - 1) {
    // leftover tail (bottom padding / hard-split remainder)
    const tail = totalH - pages[pages.length - 1].end;
    if (tail > 150) pages.push({ start: pages[pages.length - 1].end, end: totalH });
  }
  return pages;
}
