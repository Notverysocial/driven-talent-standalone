"use client";

import { Badge } from "@/components/Badge";
import type { AccessUser } from "@/lib/users.server";
import type { AppRole } from "@/lib/supabase/types";
import { changeUserRole, removeUser, resendInvite } from "./actions";

const ROLE_TONE: Record<AppRole, "warm" | "gold" | "green"> = {
  user: "warm",
  admin: "gold",
  owner: "green",
};

const ROLE_LABEL: Record<AppRole, string> = {
  user: "User",
  admin: "Admin",
  owner: "Owner",
};

function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function UserRow({
  user,
  viewerId,
  viewerRole,
}: {
  user: AccessUser;
  viewerId: string;
  viewerRole: AppRole;
}) {
  const isSelf = user.id === viewerId;
  const isOwnerViewer = viewerRole === "owner";
  const canChangeOwner = isOwnerViewer;
  const pending = !user.confirmed_at;

  return (
    <tr>
      <td style={{ paddingLeft: 22 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <strong>{user.full_name || user.email || "—"}</strong>
          <span style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>
            {user.email ?? "(no email on file)"}
          </span>
        </div>
      </td>
      <td>
        <form
          action={changeUserRole}
          style={{ display: "flex", gap: 6, alignItems: "center" }}
        >
          <input type="hidden" name="user_id" value={user.id} />
          <select
            name="role"
            defaultValue={user.role}
            className="dt-filter-input"
            style={{ minWidth: 110, padding: "6px 8px" }}
            disabled={!canChangeOwner && user.role === "owner"}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
            {(canChangeOwner || user.role === "owner") && (
              <option value="owner">Owner</option>
            )}
          </select>
          <button
            type="submit"
            className="dt-btn"
            style={{ padding: "6px 10px", fontSize: 11 }}
            disabled={!canChangeOwner && user.role === "owner"}
          >
            Save
          </button>
        </form>
      </td>
      <td>
        {pending ? (
          <Badge tone="amber">Pending invite</Badge>
        ) : (
          <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role]}</Badge>
        )}
      </td>
      <td style={{ fontSize: 12 }}>{fmt(user.last_sign_in_at)}</td>
      <td style={{ fontSize: 12 }}>{fmt(user.invited_at ?? user.created_at)}</td>
      <td style={{ paddingRight: 22, textAlign: "right" }}>
        <div
          style={{
            display: "inline-flex",
            gap: 6,
            justifyContent: "flex-end",
          }}
        >
          {user.email ? (
            <form action={resendInvite}>
              <input type="hidden" name="email" value={user.email} />
              <button
                type="submit"
                className="dt-btn"
                style={{ padding: "6px 10px", fontSize: 11 }}
                title="Send a password-reset / re-invite email"
              >
                Resend
              </button>
            </form>
          ) : null}
          {!isSelf && (canChangeOwner || user.role !== "owner") ? (
            <form
              action={removeUser}
              onSubmit={(e) => {
                if (
                  !confirm(
                    `Remove ${user.email ?? user.full_name ?? "this user"}? This deletes their auth account and revokes access.`,
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="user_id" value={user.id} />
              <button
                type="submit"
                className="dt-btn"
                style={{
                  padding: "6px 10px",
                  fontSize: 11,
                  color: "var(--dt-danger)",
                  borderColor: "var(--dt-danger)",
                }}
              >
                Remove
              </button>
            </form>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
