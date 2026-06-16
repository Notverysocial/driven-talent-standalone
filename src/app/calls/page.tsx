import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { StickyScrollTable } from "@/components/StickyScrollTable";
import { listInboundCalls } from "@/lib/recruiting.server";
import { CALL_STATUSES, type InboundCall, type InboundCallStatus } from "@/lib/recruiting";
import { logInboundCall } from "./actions";
import { CallRow } from "./CallRow";
import { getServerDictionary } from "@/lib/i18n/server";

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// YYYY-MM key + a human label for the month filter.
function monthKey(d: string): string {
  return d.slice(0, 7);
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export default async function InboundCallsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    month?: string;
    position?: string;
    status?: string;
    full?: string;
  }>;
}) {
  const sp = await searchParams;
  const search = (sp.q ?? "").trim();
  const filterMonth = (sp.month ?? "").trim();
  const filterPosition = (sp.position ?? "").trim();
  const filterStatus = (sp.status ?? "").trim();
  const fullView = sp.full === "1";

  const all = await listInboundCalls();

  // Build the filter option lists from the full (unfiltered) data set.
  const monthSet = new Set<string>();
  const positionSet = new Set<string>();
  for (const c of all) {
    if (c.called_at) monthSet.add(monthKey(c.called_at));
    if (c.position_of_interest) positionSet.add(c.position_of_interest);
  }
  const months = Array.from(monthSet).sort().reverse();
  const positions = Array.from(positionSet).sort();

  const validStatus = CALL_STATUSES.some((s) => s.id === filterStatus)
    ? (filterStatus as InboundCallStatus)
    : undefined;

  const searchLower = search.toLowerCase();
  const calls = all.filter((c) => {
    if (filterMonth && (!c.called_at || monthKey(c.called_at) !== filterMonth)) return false;
    if (filterPosition && c.position_of_interest !== filterPosition) return false;
    if (validStatus && c.follow_up_status !== validStatus) return false;
    if (searchLower) {
      const hay = `${c.caller_name} ${c.position_of_interest ?? ""}`.toLowerCase();
      if (!hay.includes(searchLower)) return false;
    }
    return true;
  });

  const anyFilter = Boolean(search || filterMonth || filterPosition || validStatus);

  // Status counts come from the full data set so the KPI strip is a constant
  // tally regardless of the active filter.
  const counts = new Map<InboundCallStatus, number>();
  for (const s of CALL_STATUSES) counts.set(s.id, 0);
  for (const c of all) counts.set(c.follow_up_status, (counts.get(c.follow_up_status) ?? 0) + 1);

  const tb = (await getServerDictionary()).topbar.calls;

  // Preserve the active filter querystring when toggling full-view.
  const baseParams = new URLSearchParams();
  if (search) baseParams.set("q", search);
  if (filterMonth) baseParams.set("month", filterMonth);
  if (filterPosition) baseParams.set("position", filterPosition);
  if (validStatus) baseParams.set("status", validStatus);
  const fullToggleParams = new URLSearchParams(baseParams);
  if (!fullView) fullToggleParams.set("full", "1");
  const fullToggleHref = `/calls${fullToggleParams.toString() ? `?${fullToggleParams}` : ""}`;

  return (
    <Shell>
      <Topbar
        crumb={tb.crumb}
        scriptWord={tb.scriptWord}
        title={tb.title}
        actions={
          <>
            <Link href={fullToggleHref} className="dt-btn">
              {fullView ? "Exit full view" : "Full view ⤢"}
            </Link>
            <Link href="/candidates" className="dt-btn">
              ← Pipeline
            </Link>
          </>
        }
      />

      {!fullView && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 12,
            marginBottom: 22,
          }}
        >
          {CALL_STATUSES.map((s) => {
            const params = new URLSearchParams(baseParams);
            params.delete("status");
            if (validStatus !== s.id) params.set("status", s.id);
            const active = validStatus === s.id;
            return (
              <Link
                key={s.id}
                href={`/calls${params.toString() ? `?${params}` : ""}`}
                className="dt-card"
                style={{
                  padding: "14px 16px",
                  textDecoration: "none",
                  color: "inherit",
                  outline: active ? "2px solid var(--dt-gold)" : "none",
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--dt-warm-500)",
                    fontWeight: 400,
                  }}
                >
                  {s.label}
                </div>
                <div
                  className="tab-num"
                  style={{
                    fontFamily: "var(--dt-display)",
                    fontSize: 26,
                    fontWeight: 300,
                    marginTop: 6,
                  }}
                >
                  {counts.get(s.id) ?? 0}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {!fullView && (
        <div className="dt-card" style={{ marginBottom: 22, padding: "20px 24px" }}>
          <div className="dt-card-head" style={{ padding: 0, marginBottom: 16, border: "none" }}>
            <div>
              <h3>Log a Call</h3>
              <div className="sub">No incoming candidate slips through.</div>
            </div>
          </div>

          <form action={logInboundCall}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              <Field label="Caller Name" name="caller_name" required />
              <Field label="Phone" name="caller_phone" type="tel" placeholder="(555) 555-5555" />
              <Field label="Email" name="caller_email" type="email" />
              <Field
                label="Position of Interest"
                name="position_of_interest"
                placeholder="e.g. Warehouse Associate"
              />
              <Field
                label="Taken By"
                name="taken_by"
                placeholder="Rocio · Leangel · Estefany"
              />
              <Field
                label="Called At"
                name="called_at"
                type="datetime-local"
                defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
                  .toISOString()
                  .slice(0, 16)}
              />
            </div>

            <div style={{ marginTop: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 10.5,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--dt-warm-500)",
                  fontWeight: 400,
                  marginBottom: 6,
                }}
              >
                Notes
              </label>
              <textarea
                name="notes"
                rows={3}
                placeholder="What did they ask about, when can they start, follow-up needed?"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: "var(--dt-warm-50)",
                  border: "1px solid var(--dt-warm-150)",
                  fontSize: 13,
                  fontFamily: "inherit",
                  resize: "vertical",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="dt-btn dt-btn-gold">
                <span>+ Log Call</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search + filter toolbar */}
      <form
        method="GET"
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        {fullView && <input type="hidden" name="full" value="1" />}
        <label className="dt-filter" style={{ flex: "1 1 260px", maxWidth: 380 }}>
          <span className="dt-filter-label">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Employee name or position…"
            className="dt-filter-input"
          />
        </label>
        <label className="dt-filter">
          <span className="dt-filter-label">Month</span>
          <select name="month" defaultValue={filterMonth} className="dt-filter-input">
            <option value="">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        </label>
        <label className="dt-filter">
          <span className="dt-filter-label">Position</span>
          <select name="position" defaultValue={filterPosition} className="dt-filter-input">
            <option value="">All positions</option>
            {positions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        {validStatus && <input type="hidden" name="status" value={validStatus} />}
        <button type="submit" className="dt-btn">
          <span>Apply</span>
        </button>
        {anyFilter && (
          <Link href={fullView ? "/calls?full=1" : "/calls"} className="dt-btn dt-btn-ghost">
            Clear
          </Link>
        )}
      </form>

      <div className="dt-card">
        <div className="dt-card-head">
          <div>
            <h3>Call Log</h3>
            <div className="sub">
              {calls.length} {calls.length === 1 ? "call" : "calls"}
              {anyFilter ? ` · filtered from ${all.length}` : " on record"}
            </div>
          </div>
          <Badge tone="gold">{anyFilter ? "Filtered" : "All inbound"}</Badge>
        </div>

        <StickyScrollTable>
          <table className="dt-table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Caller</th>
                <th>Position of Interest</th>
                <th>Called</th>
                <th>Taken By</th>
                <th>Status</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c: InboundCall) => (
                <CallRow key={c.id} call={c} fmt={fmtDateTime(c.called_at)} />
              ))}
            </tbody>
          </table>
        </StickyScrollTable>

        {calls.length === 0 && (
          <div
            style={{
              padding: "40px 24px",
              textAlign: "center",
              color: "var(--dt-warm-500)",
              fontSize: 13,
            }}
          >
            {anyFilter
              ? "No calls match the current filters."
              : "No inbound calls logged yet. Use the form above the next time the phone rings."}
          </div>
        )}
      </div>
    </Shell>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
        }}
      >
        {label}
        {required && <span style={{ color: "var(--dt-danger)" }}> *</span>}
      </span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        defaultValue={defaultValue}
        className="dt-filter-input"
      />
    </label>
  );
}
