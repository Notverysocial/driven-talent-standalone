import { Badge } from "@/components/Badge";
import { summariseSources } from "@/lib/markup";
import { backfillClientMarkup } from "../actions";
import type { ClientMarginAssignment } from "@/lib/clients.server";

// "Where do this client's rates come from?" — the header strip above the
// assignment roster. Its whole job is to make the fallback visible: a client
// where 30 of 32 people are on the default rate should look different at a
// glance from one where every rate was set deliberately.

export function MarkupSummary({
  assignments,
  slug,
  canEdit,
}: {
  assignments: ClientMarginAssignment[];
  slug: string;
  /** Admin-tier, matching the gate on the client's service-fee %. */
  canEdit: boolean;
}) {
  const counts = summariseSources(
    assignments.map((a) => ({ source: a.markup_source })),
  );
  const unset = counts.clientDefault + counts.missing;

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {counts.employee > 0 && (
        <Badge tone="green">{counts.employee} own rate</Badge>
      )}
      {counts.fixedRate > 0 && (
        <Badge tone="warm">{counts.fixedRate} fixed $/hr</Badge>
      )}
      {counts.clientDefault > 0 && (
        <Badge tone="warm">{counts.clientDefault} on client default</Badge>
      )}
      {counts.missing > 0 && (
        <Badge tone="red">{counts.missing} no markup — billed at cost</Badge>
      )}

      {canEdit && unset > 0 && (
        // Fill-the-blanks path: one rate onto everyone who has none. Never
        // overwrites a rate someone set deliberately.
        <form
          action={backfillClientMarkup.bind(null, slug)}
          style={{ display: "flex", gap: 4, alignItems: "center" }}
        >
          <input
            name="markup_percent"
            type="number"
            step="0.01"
            min="0"
            max="1000"
            placeholder="%"
            required
            aria-label="Markup percentage to apply to unset assignments"
            style={{
              width: 62,
              padding: "3px 6px",
              fontSize: 12,
              border: "1px solid var(--dt-warm-300)",
              borderRadius: 4,
            }}
          />
          <button
            type="submit"
            className="dt-btn dt-btn-ghost tiny"
            title={`Apply to the ${unset} assignment${unset === 1 ? "" : "s"} with no markup of their own. Existing per-employee rates are left alone.`}
          >
            Set for {unset} unset
          </button>
        </form>
      )}
    </div>
  );
}
