// The decision behind scripts/publish-storyblok.mjs, kept pure so it is tested.
//
// WHY. Publishing a story fires the rebuild webhook, which deploys main's head
// against the copy published at that moment. With translation off, that build
// is cache-only and fails on any string main's committed cache cannot answer.
// So a publish passes the same gate as a merge: the drafts it is about to make
// live must be answered by the cache of the commit that will build them. On
// 2026-10-21 a publish ran ahead of its cache and turned main's deploy red.

/**
 * The deploy runs that have not finished, from ONE listing of recent runs.
 * Anything not `completed` counts (queued, in_progress, pending, waiting,
 * requested, and any state GitHub adds later). Asking once per state does not
 * work: a run flips between in_progress and queued between its jobs, so it can
 * be missed by every one of the five queries. That let a publish through on
 * 2026-10-23 while a deploy was running.
 */
export function activeRuns(runs) {
  return runs.filter((r) => r.status !== "completed");
}

/** Count the article variants fetch-blog dropped for a stale approval hash. */
export function staleApprovals(output) {
  let n = 0;
  for (const m of output.matchAll(/::warning title=Stale translation approval::(\d+) /g)) n += Number(m[1]);
  return n;
}

/**
 * Every reason the publish must not happen. An empty list means go.
 * @param {{ head: string, originMain: string, dirty: string[], misses: {locale: string, source: string}[],
 *           stale: number, activeRuns: {databaseId: number, status: string}[] }} s
 */
export function refusals({ head, originMain, dirty, misses, stale, activeRuns }) {
  const out = [];
  if (!head || head !== originMain) {
    out.push(`HEAD ${head?.slice(0, 7) || "?"} is not origin/main ${originMain?.slice(0, 7) || "?"}: the deploy builds main, so measure main`);
  }
  if (dirty.length) out.push(`working tree has ${dirty.length} uncommitted change(s), so this is not main's cache: ${dirty.slice(0, 5).join(", ")}`);
  if (misses.length) {
    const byLocale = new Map();
    for (const m of misses) byLocale.set(m.locale, (byLocale.get(m.locale) ?? 0) + 1);
    const split = [...byLocale].sort().map(([l, n]) => `${l} ${n}`).join(", ");
    out.push(`${misses.length} draft string(s) are missing from main's cache (${split}); fill the cache and merge it first`);
  }
  if (stale) out.push(`${stale} reviewed DE/ES article variant(s) have a stale approval hash and would drop off the site`);
  for (const r of activeRuns) out.push(`deploy run ${r.databaseId} is ${r.status}; wait for the queue to drain`);
  return out;
}
