import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { getOnboardingDetail } from "@/lib/onboarding.server";
import type { OnboardingCategory } from "@/lib/supabase/types";
import { CheckRow } from "./CheckRow";
import { addChecklistItem, addDocument } from "../actions";

const CATEGORY_ORDER: OnboardingCategory[] = [
  "Documentation",
  "Compliance",
  "Training",
  "Equipment",
  "Review",
];

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

export default async function OnboardingDetailPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  const detail = await getOnboardingDetail(employeeId);
  if (!detail) notFound();
  const { employee, checklist, documents } = detail;

  const byCategory = new Map<OnboardingCategory, typeof checklist>();
  for (const i of checklist) {
    const arr = byCategory.get(i.category) ?? [];
    arr.push(i);
    byCategory.set(i.category, arr);
  }

  const stepsDone = checklist.filter((i) => i.done).length;
  const docsDone = documents.filter((d) => d.received).length;
  const allReady =
    checklist.length > 0 &&
    stepsDone === checklist.length &&
    documents.length > 0 &&
    docsDone === documents.length;

  return (
    <Shell>
      <Topbar
        crumb={`PEOPLE OPS / ONBOARDING / ${employee.full_name.toUpperCase()}`}
        scriptWord="Onboarding "
        title="Checklist"
        actions={
          <>
            <Link href="/onboarding" className="dt-btn">
              ← All Onboarding
            </Link>
            <Link href={`/employees/${employee.id}`} className="dt-btn">
              Profile
            </Link>
          </>
        }
      />

      {/* Header */}
      <div
        className="dt-card gold-edge"
        style={{
          padding: "22px 26px",
          marginBottom: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 18,
        }}
      >
        <div className="dt-person">
          <Avatar name={employee.full_name} size="lg" />
          <div>
            <div style={{ fontFamily: "var(--dt-display)", fontSize: 22, fontWeight: 300 }}>
              {employee.full_name}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--dt-warm-500)", marginTop: 3 }}>
              {employee.city ?? "—"}
              {employee.hire_date &&
                ` · Hired ${new Date(employee.hire_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right", display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div className="tiny muted" style={{ letterSpacing: "0.16em", textTransform: "uppercase" }}>
              Steps
            </div>
            <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 24, fontWeight: 300, marginTop: 4 }}>
              {stepsDone}<span style={{ color: "var(--dt-warm-400)" }}>/{checklist.length}</span>{" "}
              <span style={{ fontSize: 12, color: "var(--dt-warm-500)" }}>{pct(stepsDone, checklist.length)}%</span>
            </div>
          </div>
          <div>
            <div className="tiny muted" style={{ letterSpacing: "0.16em", textTransform: "uppercase" }}>
              Documents
            </div>
            <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 24, fontWeight: 300, marginTop: 4 }}>
              {docsDone}<span style={{ color: "var(--dt-warm-400)" }}>/{documents.length}</span>{" "}
              <span style={{ fontSize: 12, color: "var(--dt-warm-500)" }}>{pct(docsDone, documents.length)}%</span>
            </div>
          </div>
          <Badge tone={allReady ? "green" : "amber"}>
            {allReady ? "Ready to activate" : "In progress"}
          </Badge>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 22 }}>
        {/* Checklist */}
        <div className="dt-card">
          <div className="dt-card-head">
            <div>
              <h3>Checklist</h3>
              <div className="sub">15-step onboarding · click to toggle</div>
            </div>
          </div>
          <div style={{ padding: "8px 12px 18px" }}>
            {CATEGORY_ORDER.map((cat) => {
              const items = byCategory.get(cat) ?? [];
              if (items.length === 0) return null;
              return (
                <div key={cat} style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      fontSize: 9.5,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "var(--dt-warm-500)",
                      fontWeight: 400,
                      padding: "10px 12px",
                    }}
                  >
                    {cat}
                  </div>
                  {items.map((i) => (
                    <CheckRow
                      key={i.id}
                      itemId={i.id}
                      employeeId={employee.id}
                      label={i.label}
                      detail={i.detail}
                      done={i.done}
                      doneOn={i.done_on}
                      kind="checklist"
                    />
                  ))}
                </div>
              );
            })}

            <form
              action={addChecklistItem.bind(null, employee.id)}
              style={{
                marginTop: 18,
                padding: "14px 16px",
                background: "var(--dt-warm-50)",
                border: "1px dashed var(--dt-warm-200)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--dt-warm-500)",
                  fontWeight: 400,
                  marginBottom: 10,
                }}
              >
                Add a checklist item
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8 }}>
                <input name="label" placeholder="Step label" className="dt-filter-input" required />
                <select name="category" className="dt-filter-input" defaultValue="Documentation">
                  {CATEGORY_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button type="submit" className="dt-btn">
                  Add
                </button>
              </div>
              <input
                name="detail"
                placeholder="Optional detail / instructions"
                className="dt-filter-input"
                style={{ width: "100%", marginTop: 8 }}
              />
            </form>
          </div>
        </div>

        {/* Documents */}
        <div className="dt-card">
          <div className="dt-card-head">
            <div>
              <h3>Documents</h3>
              <div className="sub">Click to mark received</div>
            </div>
          </div>
          <div style={{ padding: "8px 0 12px" }}>
            {documents.map((d) => (
              <CheckRow
                key={d.id}
                itemId={d.id}
                employeeId={employee.id}
                label={d.name}
                detail={null}
                done={d.received}
                doneOn={d.received_on}
                kind="document"
              />
            ))}
            {documents.length === 0 && (
              <div
                style={{
                  padding: "20px 12px",
                  fontSize: 12,
                  color: "var(--dt-warm-500)",
                  fontStyle: "italic",
                  textAlign: "center",
                }}
              >
                No documents required.
              </div>
            )}
          </div>

          <form
            action={addDocument.bind(null, employee.id)}
            style={{
              margin: "0 14px 14px",
              padding: "12px 14px",
              background: "var(--dt-warm-50)",
              border: "1px dashed var(--dt-warm-200)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                fontWeight: 400,
                marginBottom: 8,
              }}
            >
              Add document
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              <input name="name" placeholder="Document name" className="dt-filter-input" required />
              <button type="submit" className="dt-btn">
                Add
              </button>
            </div>
          </form>
        </div>
      </div>
    </Shell>
  );
}
