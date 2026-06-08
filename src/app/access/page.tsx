import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { AUTH_ENABLED, requireRole } from "@/lib/auth.server";
import { listAccessUsers } from "@/lib/users.server";
import { UserRow } from "./UserRow";
import { InviteForm } from "./InviteForm";

export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const me = await requireRole("admin");

  // When AUTH_ENABLED is off, the proxy is a pass-through and the
  // service-role list call still works, but the page is a placeholder.
  // Show a banner so admins understand the state.
  const authOff = !AUTH_ENABLED;

  let users: Awaited<ReturnType<typeof listAccessUsers>> = [];
  let listError: string | null = null;
  try {
    users = await listAccessUsers();
  } catch (e) {
    listError = e instanceof Error ? e.message : "Failed to load users";
  }

  const owners = users.filter((u) => u.role === "owner").length;
  const admins = users.filter((u) => u.role === "admin").length;
  const usersCount = users.filter((u) => u.role === "user").length;
  const pending = users.filter((u) => !u.confirmed_at).length;

  return (
    <Shell>
      <Topbar
        crumb="ADMIN · ACCESS"
        scriptWord="Access"
        title="App Users & Roles"
      />

      {authOff && (
        <div
          className="dt-card"
          style={{
            padding: "16px 22px",
            marginBottom: 18,
            borderLeft: "3px solid var(--dt-gold-deep)",
            background: "rgba(212, 165, 76, 0.06)",
          }}
        >
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <strong>Auth is currently OFF.</strong> The app runs as a synthetic
            Owner regardless of who hits the URL. You can still invite users
            here so they exist when you flip auth on. To enable secure access,
            set <code>AUTH_ENABLED=true</code> in Vercel env vars and redeploy.
            Users you invite below will receive their setup email once the
            redeploy is live.
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <KPI label="Owners" value={String(owners)} sub="full access" accent="var(--dt-success)" />
        <KPI label="Admins" value={String(admins)} sub="manage team + settings" />
        <KPI label="Users" value={String(usersCount)} sub="standard access" />
        <KPI
          label="Pending"
          value={String(pending)}
          sub="invited, not signed in yet"
          accent={pending > 0 ? "var(--dt-warm-500)" : "var(--dt-black)"}
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
              <h3>{users.length} {users.length === 1 ? "user" : "users"}</h3>
              <div className="sub">
                Sign-in access · roles control which admin pages are visible
              </div>
            </div>
          </div>
          {listError ? (
            <div
              role="alert"
              style={{
                padding: "16px 22px",
                color: "var(--dt-danger)",
                fontSize: 13,
              }}
            >
              {listError}
              <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--dt-warm-500)" }}>
                Make sure <code>SUPABASE_SERVICE_ROLE_KEY</code> is set in the
                environment.
              </div>
            </div>
          ) : (
            <div className="dt-table-wrap">
              <table className="dt-table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 22 }}>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last sign-in</th>
                    <th>Invited</th>
                    <th style={{ paddingRight: 22, textAlign: "right" }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      viewerId={me.id}
                      viewerRole={me.profile.role}
                    />
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          textAlign: "center",
                          padding: "48px 22px",
                          color: "var(--dt-warm-500)",
                          fontStyle: "italic",
                        }}
                      >
                        No users yet — invite the first one using the form on
                        the right.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="dt-card" style={{ padding: 0 }}>
          <div className="dt-card-head">
            <div>
              <h3>Invite User</h3>
              <div className="sub">Send a one-time setup email</div>
            </div>
          </div>
          <InviteForm canInviteOwner={me.profile.role === "owner"} />
        </aside>
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
