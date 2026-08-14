// Paging through the set you are reviewing, instead of going back to the list.
//
// Estefany's team works applicants in batches: filter the list down to the set
// they care about, open the first person, work through them. Returning to the
// full "All Applications" list between every single record is the step they
// asked us to remove.
//
// HOW THE SET SURVIVES THE NAVIGATION: the ordered set is NOT snapshotted into
// the URL. An id list would blow past sane URL lengths on a few hundred rows
// and would go stale the moment anybody edited a record. Instead the detail
// page carries forward the same filter querystring the list page had, and
// recomputes the same ordered set with the same pure functions the list itself
// uses (see application-queue.ts and candidate-queue.ts). One ordering,
// two callers — so "next" cannot silently mean a different set.

/** Marks a detail URL as "opened from a list", i.e. render the pager. Without
 *  it, a deep link / a link from another record shows no pager at all rather
 *  than inventing a set the reviewer never chose. */
export const QUEUE_FROM_PARAM = "from";
export const QUEUE_FROM_LIST = "list";

/** The record's slot in the set at the time the link was built. Only used as a
 *  fallback — see locateInQueue(). */
export const QUEUE_INDEX_PARAM = "i";

export type QueueNeighbor = { id: string; index: number };

export type QueuePosition = {
  /** Zero-based slot of the current record in the set. */
  index: number;
  total: number;
  prev: QueueNeighbor | null;
  next: QueueNeighbor | null;
  /** True when the current record is no longer in the set and the position
   *  came from the carried slot rather than from finding its id. */
  dropped: boolean;
};

/** Read the carried slot off a searchParams value. Anything that isn't a
 *  non-negative integer is treated as absent. */
export function readCarriedIndex(
  raw: string | string[] | undefined,
): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** True when this detail view was opened from a list and should page. */
export function cameFromList(raw: string | string[] | undefined): boolean {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === QUEUE_FROM_LIST;
}

/**
 * Where the current record sits in the recomputed set, and what Prev/Next
 * should point at. Returns null when there is nothing sane to page through.
 */
export function locateInQueue(
  ids: string[],
  currentId: string,
  carriedIndex: number | null,
): QueuePosition | null {
  if (ids.length === 0) return null;

  const index = ids.indexOf(currentId);
  if (index !== -1) {
    return {
      index,
      total: ids.length,
      prev: index > 0 ? { id: ids[index - 1], index: index - 1 } : null,
      next:
        index < ids.length - 1
          ? { id: ids[index + 1], index: index + 1 }
          : null,
      dropped: false,
    };
  }

  // The record is not in the set any more. The overwhelmingly common cause is
  // the reviewer acting on this very record: move a candidate's stage while
  // the list is filtered by stage and they drop straight out of it. Everyone
  // behind them shifted down one, so the slot they occupied now holds the NEXT
  // person — paging on from the carried slot keeps the walk going instead of
  // dead-ending the reviewer on the record they just finished.
  if (carriedIndex === null) return null;
  const slot = Math.min(carriedIndex, ids.length);
  return {
    index: slot,
    total: ids.length,
    prev: slot > 0 ? { id: ids[slot - 1], index: slot - 1 } : null,
    next: slot < ids.length ? { id: ids[slot], index: slot } : null,
    dropped: true,
  };
}

/** Detail URL for `id`, carrying the list context plus its slot in the set. */
export function queueDetailHref(
  basePath: string,
  id: string,
  context: URLSearchParams,
  index: number,
): string {
  const params = new URLSearchParams(context);
  params.set(QUEUE_FROM_PARAM, QUEUE_FROM_LIST);
  params.set(QUEUE_INDEX_PARAM, String(index));
  return `${basePath}/${id}?${params}`;
}
