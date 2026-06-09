import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { requireUser } from "@/lib/auth.server";
import { ProfileEditForm, PasswordChangeForm } from "./AccountForms";
import type { AppRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Owner",
  admin: "Admin",
  user: "User",
};

export default async function AccountPage() {
  const me = await requireUser();
  const fullName = me.profile.full_name ?? "";
  const email = me.email ?? me.profile.email ?? "";
  const role = me.profile.role;

  return (
    <Shell>
      <Topbar
        crumb="ACCOUNT / SETTINGS"
        scriptWord="Your "
        title="Account"
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 22,
          alignItems: "start",
        }}
      >
        {/* Profile card */}
        <section className="dt-card">
          <div className="dt-card-head">
            <div>
              <h3>Your profile</h3>
              <div className="sub">
                Update how your name shows up across Driven Talent
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "16px 22px 4px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              borderBottom: "1px solid var(--dt-warm-200, rgba(0,0,0,0.08))",
            }}
          >
            <ReadOnlyField label="Email" value={email || "—"} />
            <p
              style={{
                fontSize: 11.5,
                color: "var(--dt-warm-500)",
                margin: "-6px 0 0",
              }}
            >
              To change your email, contact your administrator.
            </p>
            <ReadOnlyField
              label="Role"
              value={
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 10px",
                    borderRadius: 999,
                    background:
                      role === "owner"
                        ? "rgba(16, 185, 129, 0.12)"
                        : role === "admin"
                        ? "rgba(212, 165, 76, 0.14)"
                        : "rgba(0,0,0,0.06)",
                    color:
                      role === "owner"
                        ? "var(--dt-success)"
                        : role === "admin"
                        ? "var(--dt-gold-deep)"
                        : "var(--dt-black)",
                    fontSize: 11,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  {ROLE_LABEL[role]}
                </span>
              }
            />
          </div>

          <ProfileEditForm initialFullName={fullName} />
        </section>

        {/* Password change card */}
        <section className="dt-card">
          <div className="dt-card-head">
            <div>
              <h3>Change password</h3>
              <div className="sub">
                Rotate off your temp password — pick something you'll
                remember
              </div>
            </div>
          </div>
          <PasswordChangeForm />
        </section>
      </div>
    </Shell>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="dt-filter">
      <span className="dt-filter-label">{label}</span>
      <div
        style={{
          padding: "8px 12px",
          fontSize: 13,
          color: "var(--dt-black)",
          background: "rgba(0,0,0,0.02)",
          border: "1px solid var(--dt-warm-200, rgba(0,0,0,0.08))",
          borderRadius: 6,
          minHeight: 36,
          display: "flex",
          alignItems: "center",
        }}
      >
        {value}
      </div>
    </div>
  );
}
