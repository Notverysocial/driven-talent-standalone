import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { listInboundCalls } from "@/lib/recruiting.server";
import { CALL_STATUSES, type InboundCallStatus } from "@/lib/recruiting";
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

export default async function InboundCallsPage() {
  const calls = await listInboundCalls();

  const counts = new Map<InboundCallStatus, number>();
  for (const s of CALL_STATUSES) counts.set(s.id, 0);
  for (const c of calls) counts.set(c.follow_up_status, (counts.get(c.follow_up_status) ?? 0) + 1);
  const tb = (await getServerDictionary()).topbar.calls;

  return (
    <Shell>
      <Topbar
        crumb={tb.crumb}
        scriptWord={tb.scriptWord}
        title={tb.title}
        actions={
          <Link href="/candidates" className="dt-btn">
            ← Pipeline
          </Link>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
          marginBottom: 22,
        }}
      >
        {CALL_STATUSES.map((s) => (
          <div key={s.id} className="dt-card" style={{ padding: "14px 16px" }}>
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
          </div>
        ))}
      </div>

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

      <div className="dt-card">
        <div className="dt-card-head">
          <div>
            <h3>Call Log</h3>
            <div className="sub">
              {calls.length} {calls.length === 1 ? "call" : "calls"} on record
            </div>
          </div>
          <Badge tone="gold">All inbound</Badge>
        </div>

        <div className="dt-table-wrap">
          <table className="dt-table">
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
              {calls.map((c) => (
                <CallRow key={c.id} call={c} fmt={fmtDateTime(c.called_at)} />
              ))}
            </tbody>
          </table>
        </div>

        {calls.length === 0 && (
          <div
            style={{
              padding: "40px 24px",
              textAlign: "center",
              color: "var(--dt-warm-500)",
              fontSize: 13,
            }}
          >
            No inbound calls logged yet. Use the form above the next time the phone rings.
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
