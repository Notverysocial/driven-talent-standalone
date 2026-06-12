"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Badge } from "@/components/Badge";
import type { AccessUser } from "@/lib/users.server";
import type { AppRole } from "@/lib/supabase/types";
import {
  changeUserRole,
  removeUser,
  resetPassword,
  type ResetState,
} from "./actions";

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

function ResetButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="dt-btn"
      style={{ padding: "6px 10px", fontSize: 11 }}
      disabled={pending}
      title="Generate a new temp password and share it manually"
    >
      {pending ? "Resetting…" : "Reset password"}
    </button>
  );
}

function ResetCredentialBox({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const [copied, setCopied] = useState(false);
  const blob = `Email: ${email}\nPassword: ${password}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(blob);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div
      style={{
        marginTop: 8,
        background: "rgba(16, 185, 129, 0.08)",
        border: "1px solid rgba(16, 185, 129, 0.25)",
        borderRadius: 6,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        textAlign: "left",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--dt-success)", fontWeight: 500 }}>
        New password — share with user via Signal/text
      </div>
      <div
        style={{
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 11.5,
          background: "var(--dt-white, #fff)",
          border: "1px solid var(--dt-warm-200, rgba(0,0,0,0.08))",
          borderRadius: 4,
          padding: "6px 8px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {password}
      </div>
      <button
        type="button"
        onClick={copy}
        className="dt-btn"
        style={{
          alignSelf: "flex-start",
          padding: "4px 8px",
          fontSize: 10.5,
        }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function ResetForm({ email }: { email: string }) {
  const [state, formAction] = useActionState<ResetState, FormData>(
    resetPassword,
    {},
  );
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 0 }}>
      <form action={formAction}>
        <input type="hidden" name="email" value={email} />
        <ResetButton />
      </form>
      {state.error ? (
        <div
          role="alert"
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "var(--dt-danger)",
          }}
        >
          {state.error}
        </div>
      ) : null}
      {state.tempPassword && state.email ? (
        <ResetCredentialBox email={state.email} password={state.tempPassword} />
      ) : null}
    </div>
  );
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
  // With Option A there is no separate "pending" state — accounts are
  // confirmed immediately when created. last_sign_in_at tells the story.
  const neverSignedIn = !user.last_sign_in_at;

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
        {neverSignedIn ? (
          <Badge tone="amber">Never signed in</Badge>
        ) : (
          <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role]}</Badge>
        )}
      </td>
      <td style={{ fontSize: 12 }}>{fmt(user.last_sign_in_at)}</td>
      <td style={{ fontSize: 12 }}>{fmt(user.created_at)}</td>
      <td style={{ paddingRight: 22, textAlign: "right" }}>
        <div
          style={{
            display: "inline-flex",
            gap: 6,
            justifyContent: "flex-end",
            alignItems: "flex-start",
          }}
        >
          {user.email ? <ResetForm email={user.email} /> : null}
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
