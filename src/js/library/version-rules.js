// Version retention rules. Pure: no IndexedDB, no DOM.
export const MAX_VERSIONS = 30;
export const AUTO_INTERVAL_MS = 5 * 60 * 1000;
export const REASONS = ['auto', 'manual', 'before-cleanup', 'before-import'];
export const REASON_LABELS = {
  auto: 'خودکار',
  manual: 'دستی',
  'before-cleanup': 'پیش از پاک‌سازی',
  'before-import': 'پیش از وارد کردن',
};

// Lower rank is dropped first: automatic snapshots, then safety snapshots, then manual ones.
const RANK = { auto: 0, 'before-cleanup': 1, 'before-import': 1, manual: 2 };
const rank = (v) => RANK[v.reason] ?? 1;

/** Ids to delete so that at most `cap` versions of one document remain. Oldest auto first. */
export function pruneVersions(list, cap = MAX_VERSIONS) {
  const excess = list.length - cap;
  if (excess <= 0) return [];
  return list
    .slice()
    .sort((a, b) => rank(a) - rank(b) || a.savedAt - b.savedAt)
    .slice(0, excess)
    .map((v) => v.id);
}

/** Free space across ALL documents: the `count` oldest automatic versions. */
export function pickVersionsToFree(all, count) {
  return all
    .filter((v) => v.reason === 'auto')
    .sort((a, b) => a.savedAt - b.savedAt)
    .slice(0, count)
    .map((v) => v.id);
}

/** An auto version is due when there are unsaved-as-version changes and the interval elapsed. */
export function shouldAutoVersion({ lastAt, now, changed, interval = AUTO_INTERVAL_MS }) {
  if (!changed) return false;
  if (lastAt == null) return false; // first change only starts the clock
  return now - lastAt >= interval;
}

/** True when `candidate` carries the same content as the newest existing version. */
export function isDuplicateVersion(latest, candidate) {
  return !!latest && latest.source === candidate.source && latest.html === candidate.html && latest.title === candidate.title;
}
