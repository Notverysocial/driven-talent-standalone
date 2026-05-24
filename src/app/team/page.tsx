import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { listTeamMembers } from "@/lib/team.server";
import {
  ROLE_LABEL,
  ROLE_TONE,
  TEAM_ROLES,
  type TeamMemberRole,
} from "@/lib/team";
import { TeamMemberRow } from "./TeamMemberRow";
import { createTeamMember } from "./actions";

export default async function TeamMembersPage() {
  const members = await listTeamMembers();

  const active = members.filter((m) => m.status === "active");
  const inactive = members.filter((m) => m.status === "inactive");
  const byRole = new Map<TeamMemberRole, number>();
  for (const r of TEAM_ROLES) byRole.set(r, 0);
  for (const m of active) byRole.set(m.role, (byRole.get(m.role) ?? 0) + 1);

  return (
    <Shell>
      <Topbar
        crumb="ADMIN / TEAM MEMBERS"
        scriptWord="Internal "
        title="Team"
        actions={
          <Link href="/team/terminated" className="dt-btn">
            Terminated / DNR →
          </Link>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <KPI label="Active" value={String(active.length)} sub="on the team" accent="var(--dt-success)" />
        <KPI
          label="Recruiters"
          value={String(byRole.get("recruiter") ?? 0)}
          sub="active"
        />
        <KPI
          label="Coordinators"
          value={String(byRole.get("onboarding_coordinator") ?? 0)}
          sub="onboarding"
        />
        <KPI
          label="Inactive"
          value={String(inactive.length)}
          sub="historical"
          accent={inactive.length > 0 ? "var(--dt-warm-500)" : "var(--dt-black)"}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: 22,
          alignItems: "start",
        }}
      >
        <div className="dt-card gold-edge">
          <div className="dt-card-head">
            <div>
              <h3>{active.length} active {active.length === 1 ? "member" : "members"}</h3>
              <div className="sub">Internal DT staff · roles drive picker defaults in other modules</div>
            </div>
          </div>
          <div className="dt-table-wrap">
            <table className="dt-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Member</th>
                  <th>Role</th>
                  <th>Title</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Started</th>
                  <th style={{ paddingRight: 22, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {active.map((m) => (
                  <TeamMemberRow key={m.id} member={m} />
                ))}
                {active.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        textAlign: "center",
                        padding: "48px 22px",
                        color: "var(--dt-warm-500)",
                        fontStyle: "italic",
                      }}
                    >
                      No team members yet — add one using the form on the right.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {inactive.length > 0 && (
            <>
              <div
                className="dt-card-head"
                style={{ borderTop: "1px solid var(--dt-warm-100)", marginTop: 0 }}
              >
                <div>
                  <h3>Inactive · {inactive.length}</h3>
                  <div className="sub">No longer on staff — kept for historical reference</div>
                </div>
              </div>
              <div className="dt-table-wrap">
                <table className="dt-table">
                  <thead>
                    <tr>
                      <th style={{ paddingLeft: 22 }}>Member</th>
                      <th>Role</th>
                      <th>Title</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Ended</th>
                      <th style={{ paddingRight: 22, textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inactive.map((m) => (
                      <TeamMemberRow key={m.id} member={m} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <aside className="dt-card" style={{ padding: 0 }}>
          <div className="dt-card-head">
            <div>
              <h3>Add Team Member</h3>
              <div className="sub">Internal staff only</div>
            </div>
          </div>
          <form
            action={createTeamMember}
            style={{
              padding: "18px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <Field label="Full name" name="full_name" required />
            <Field label="Title" name="title" placeholder="e.g. Lead Recruiter" />
            <Field label="Role">
              <select name="role" required defaultValue="staff" className="dt-filter-input">
                {TEAM_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </Field>
            <Field label="Email" name="email" type="email" />
            <Field label="Phone" name="phone" type="tel" placeholder="(555) 555-5555" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Start date" name="start_date" type="date" />
              <Field label="Initials" name="initials" placeholder="RV" />
            </div>
            <Field label="Notes">
              <textarea
                name="notes"
                rows={2}
                className="dt-filter-input"
                style={{ resize: "vertical", minHeight: 50 }}
              />
            </Field>
            <button type="submit" className="dt-btn dt-btn-primary" style={{ marginTop: 4 }}>
              <span>+ Add Member</span>
            </button>
          </form>
        </aside>
      </div>

      {/* Role legend */}
      <div className="dt-card" style={{ marginTop: 22, padding: "18px 22px" }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--dt-warm-500)",
            fontWeight: 400,
            marginBottom: 12,
          }}
        >
          Role Legend
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TEAM_ROLES.map((r) => (
            <Badge key={r} tone={ROLE_TONE[r]}>
              {ROLE_LABEL[r]} · {byRole.get(r) ?? 0}
            </Badge>
          ))}
        </div>
      </div>

    </Shell>
  );
}

function KPI({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="dt-card" style={{ padding: "18px 20px" }}>
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
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
        {sub && <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>{sub}</div>}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
  children,
}: {
  label: string;
  name?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <label className="dt-filter">
      <span className="dt-filter-label">
        {label}
        {required && <span style={{ color: "var(--dt-danger)" }}> *</span>}
      </span>
      {children ?? (
        <input
          name={name}
          type={type}
          placeholder={placeholder}
          required={required}
          className="dt-filter-input"
        />
      )}
    </label>
  );
}
