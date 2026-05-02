import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { EMPLOYEES, getClient, type Employee } from "@/lib/data";

function progress(e: Employee) {
  const total = e.onboarding.checklist.length;
  const done = e.onboarding.checklist.filter((t) => t.done).length;
  const docsTotal = e.onboarding.documents.length;
  const docsDone = e.onboarding.documents.filter((d) => d.received).length;
  return { total, done, docsTotal, docsDone, pct: total ? Math.round((done / total) * 100) : 0 };
}

function ChecklistRow({
  label,
  done,
  doneOn,
  pending,
}: {
  label: string;
  done: boolean;
  doneOn?: string;
  pending?: boolean;
}) {
  return (
    <div className="dt-check-item">
      <div className={"dt-check-box" + (done ? " done" : "")} />
      <div>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 400,
            color: done ? "var(--dt-warm-500)" : "var(--dt-black)",
            textDecoration: done ? "line-through" : "none",
          }}
        >
          {label}
        </div>
        {doneOn && (
          <div
            style={{
              fontSize: 10,
              color: "var(--dt-warm-500)",
              marginTop: 2,
              letterSpacing: "0.14em",
            }}
          >
            COMPLETED{" "}
            {new Date(doneOn).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
        )}
      </div>
      {!done && pending && <Badge tone="amber">Pending</Badge>}
      {done && <Badge tone="green">Done</Badge>}
    </div>
  );
}

export default function OnboardingPage() {
  const onboarding = EMPLOYEES.filter((e) => e.status === "onboarding");
  const recentlyCompleted = EMPLOYEES.filter(
    (e) =>
      e.status === "active" &&
      new Date(e.hireDate).getTime() >
        new Date("2024-12-01").getTime()
  ).slice(0, 4);

  return (
    <Shell>
      <Topbar
        crumb="PEOPLE OPS / ONBOARDING"
        scriptWord="New Hire "
        title="Workflow"
        actions={
          <>
            <Link href="/roster" className="dt-btn">
              View Active Roster
            </Link>
            <button className="dt-btn dt-btn-gold">
              <span>+ Start Onboarding</span>
            </button>
          </>
        }
      />

      <div
        style={{
          display: "flex",
          gap: 14,
          marginBottom: 22,
          flexWrap: "wrap",
        }}
      >
        <Stat
          label="In Progress"
          value={String(onboarding.length)}
          accent="var(--dt-gold-deep)"
          sub="this month"
        />
        <Stat
          label="Avg Time to Place"
          value="9 days"
          sub="from app to first shift"
        />
        <Stat
          label="Completed YTD"
          value="42"
          accent="var(--dt-success)"
          sub="onboardings"
        />
        <Stat
          label="Required Docs"
          value="5"
          sub="per new hire"
        />
      </div>

      {onboarding.length === 0 ? (
        <div
          className="dt-card"
          style={{
            padding: "48px 22px",
            textAlign: "center",
            color: "var(--dt-warm-500)",
            fontStyle: "italic",
          }}
        >
          Nobody onboarding right now. Click <strong>+ Start Onboarding</strong>{" "}
          to bring in a new hire.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))",
            gap: 22,
            marginBottom: 28,
          }}
        >
          {onboarding.map((e) => {
            const p = progress(e);
            const client = getClient(e.assignments[0].client);
            return (
              <div key={e.id} className="dt-card gold-edge">
                <div
                  style={{
                    padding: "22px 24px 18px",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 14,
                    borderBottom: "1px solid var(--dt-warm-100)",
                  }}
                >
                  <div className="dt-person">
                    <Avatar name={e.name} size="lg" />
                    <div>
                      <div
                        style={{
                          fontFamily: "var(--dt-display)",
                          fontSize: 18,
                          fontWeight: 400,
                          letterSpacing: "0.02em",
                        }}
                      >
                        {e.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: "var(--dt-warm-500)",
                          marginTop: 4,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {e.assignments[0].position} → {client.name} ·{" "}
                        {e.assignments[0].shift}
                      </div>
                      <div
                        style={{
                          fontSize: 10.5,
                          color: "var(--dt-warm-700)",
                          marginTop: 6,
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                        }}
                      >
                        STARTS{" "}
                        {new Date(e.assignments[0].startDate).toLocaleDateString(
                          "en-US",
                          {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          }
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      className="tab-num"
                      style={{
                        fontFamily: "var(--dt-display)",
                        fontSize: 32,
                        fontWeight: 300,
                        color: "var(--dt-gold-deep)",
                        lineHeight: 1,
                      }}
                    >
                      {p.pct}%
                    </div>
                    <div
                      style={{
                        fontSize: 9.5,
                        color: "var(--dt-warm-500)",
                        letterSpacing: "0.22em",
                        textTransform: "uppercase",
                        marginTop: 4,
                      }}
                    >
                      {p.done} of {p.total} steps
                    </div>
                  </div>
                </div>

                <div
                  style={{ padding: "16px 24px 8px" }}
                >
                  <div className="dt-progress" style={{ marginBottom: 18 }}>
                    <div
                      className={"fill" + (p.pct === 100 ? " done" : "")}
                      style={{ width: p.pct + "%" }}
                    />
                  </div>

                  <div
                    style={{
                      fontSize: 9.5,
                      letterSpacing: "0.28em",
                      textTransform: "uppercase",
                      color: "var(--dt-warm-500)",
                      fontWeight: 400,
                      marginBottom: 8,
                      paddingLeft: "0.28em",
                    }}
                  >
                    Checklist
                  </div>
                  {e.onboarding.checklist.map((t) => (
                    <ChecklistRow
                      key={t.id}
                      label={t.label}
                      done={t.done}
                      doneOn={t.doneOn}
                      pending
                    />
                  ))}
                </div>

                <div style={{ padding: "8px 24px 22px" }}>
                  <div
                    style={{
                      fontSize: 9.5,
                      letterSpacing: "0.28em",
                      textTransform: "uppercase",
                      color: "var(--dt-warm-500)",
                      fontWeight: 400,
                      marginTop: 16,
                      marginBottom: 10,
                      paddingLeft: "0.28em",
                    }}
                  >
                    Documents · {p.docsDone}/{p.docsTotal}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 8,
                    }}
                  >
                    {e.onboarding.documents.map((d) => (
                      <div
                        key={d.name}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 12px",
                          border: "1px solid var(--dt-warm-150)",
                          background: d.received
                            ? "var(--dt-success-bg)"
                            : "var(--dt-warm-50)",
                          fontSize: 11.5,
                          fontWeight: 400,
                        }}
                      >
                        <span>{d.name}</span>
                        <span
                          style={{
                            fontSize: 9.5,
                            letterSpacing: "0.18em",
                            textTransform: "uppercase",
                            color: d.received
                              ? "var(--dt-success)"
                              : "var(--dt-warning)",
                            fontWeight: 400,
                          }}
                        >
                          {d.received ? "✓ On File" : "Pending"}
                        </span>
                      </div>
                    ))}
                  </div>

                  {e.notes && (
                    <div
                      style={{
                        marginTop: 18,
                        padding: "12px 14px",
                        background: "var(--dt-warm-50)",
                        borderLeft: "2px solid var(--dt-gold)",
                        fontSize: 12,
                        fontStyle: "italic",
                        color: "var(--dt-warm-700)",
                        lineHeight: 1.6,
                      }}
                    >
                      {e.notes}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      marginTop: 18,
                      flexWrap: "wrap",
                    }}
                  >
                    <Link
                      href={`/employees/${e.id}`}
                      className="dt-btn"
                    >
                      Open Profile
                    </Link>
                    <button className="dt-btn dt-btn-gold">
                      <span>Mark Step Done</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recently completed */}
      {recentlyCompleted.length > 0 && (
        <div className="dt-card">
          <div className="dt-card-head">
            <div>
              <h3>Recently Placed</h3>
              <div className="sub">Last 6 months · already on the floor</div>
            </div>
            <Badge tone="green">Onboarded</Badge>
          </div>
          <div className="dt-table-wrap">
            <table className="dt-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Employee</th>
                  <th>Hired</th>
                  <th>First Placement</th>
                  <th>Position</th>
                  <th style={{ paddingRight: 22, textAlign: "right" }}>
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentlyCompleted.map((e) => {
                  const a = e.assignments[0];
                  const client = getClient(a.client);
                  return (
                    <tr key={e.id}>
                      <td style={{ paddingLeft: 22 }}>
                        <Link
                          href={`/employees/${e.id}`}
                          className="dt-person dt-person-link"
                        >
                          <Avatar name={e.name} />
                          <div>
                            <div className="name">{e.name}</div>
                            <div className="meta">{e.city}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="tab-num" style={{ fontFamily: "var(--dt-mono)", fontSize: 12 }}>
                        {new Date(e.hireDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td>{client.name}</td>
                      <td>
                        {a.position} · {a.shift}
                      </td>
                      <td
                        className="tab-num"
                        style={{
                          textAlign: "right",
                          paddingRight: 22,
                          fontWeight: 400,
                          color:
                            e.score >= 85
                              ? "var(--dt-success)"
                              : e.score >= 70
                              ? "var(--dt-warning)"
                              : "var(--dt-danger)",
                        }}
                      >
                        {e.score}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Stat({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <div
      className="dt-card"
      style={{ padding: "18px 20px", flex: 1, minWidth: 180 }}
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
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginTop: 8,
        }}
      >
        <div
          className="tab-num"
          style={{
            fontFamily: "var(--dt-display)",
            fontSize: 28,
            fontWeight: 300,
            color: accent || "var(--dt-black)",
            letterSpacing: "-0.01em",
          }}
        >
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
