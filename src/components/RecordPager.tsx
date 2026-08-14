import Link from "next/link";
import { queueDetailHref, type QueuePosition } from "@/lib/review-queue";

/**
 * Previous / position / Next for a detail view opened from a list.
 *
 * Lives in the Topbar actions row next to the "← All …" link, so a reviewer
 * working a filtered set never has to go back to the list between records.
 * Both ends are wrapped, not wrapped-around: the first record has no Previous
 * and the last has no Next, and those read as visibly inert controls rather
 * than disappearing (a control that vanishes makes people wonder if they broke
 * something).
 */
export function RecordPager({
  basePath,
  position,
  context,
  noun = "record",
}: {
  /** Detail route prefix, e.g. "/candidates". */
  basePath: string;
  position: QueuePosition;
  /** The list filters that define the set, carried on every pager link. */
  context: URLSearchParams;
  noun?: string;
}) {
  const { prev, next, index, total, dropped } = position;

  return (
    <div
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      aria-label={`${noun} navigation within the filtered set`}
    >
      <PagerLink
        basePath={basePath}
        context={context}
        target={prev}
        label="← Prev"
        disabledTitle={`First ${noun} in this set`}
      />
      <span
        className="tab-num"
        title={
          dropped
            ? `This ${noun} no longer matches the filters you came from.`
            : `Position in the ${total} ${noun}${total === 1 ? "" : "s"} you filtered to`
        }
        style={{
          fontSize: 11.5,
          color: "var(--dt-warm-500)",
          whiteSpace: "nowrap",
          padding: "0 2px",
          minWidth: 58,
          textAlign: "center",
        }}
      >
        {dropped ? `${total} in set` : `${index + 1} of ${total}`}
      </span>
      <PagerLink
        basePath={basePath}
        context={context}
        target={next}
        label="Next →"
        disabledTitle={`Last ${noun} in this set`}
      />
    </div>
  );
}

function PagerLink({
  basePath,
  context,
  target,
  label,
  disabledTitle,
}: {
  basePath: string;
  context: URLSearchParams;
  target: { id: string; index: number } | null;
  label: string;
  disabledTitle: string;
}) {
  if (!target) {
    return (
      <span
        className="dt-btn dt-btn-ghost"
        aria-disabled="true"
        title={disabledTitle}
        style={{ opacity: 0.4, cursor: "default", pointerEvents: "none" }}
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={queueDetailHref(basePath, target.id, context, target.index)}
      className="dt-btn"
    >
      {label}
    </Link>
  );
}
