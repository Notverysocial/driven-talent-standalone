"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { inviteUser, type InviteState } from "./actions";

function SubmitButton({ canInviteOwner }: { canInviteOwner: boolean }) {
  const { pending } = useFormStatus();
  void canInviteOwner;
  return (
    <button
      type="submit"
      className="dt-btn dt-btn-primary"
      disabled={pending}
      style={{ marginTop: 4 }}
    >
      <span>{pending ? "Sending…" : "+ Send Invite"}</span>
    </button>
  );
}

export function InviteForm({ canInviteOwner }: { canInviteOwner: boolean }) {
  const [state, formAction] = useActionState<InviteState, FormData>(
    inviteUser,
    {},
  );

  return (
    <form
      action={formAction}
      style={{
        padding: "18px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <label className="dt-filter">
        <span className="dt-filter-label">
          Email <span style={{ color: "var(--dt-danger)" }}>*</span>
        </span>
        <input
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="name@example.com"
          className="dt-filter-input"
        />
      </label>

      <label className="dt-filter">
        <span className="dt-filter-label">Full name</span>
        <input
          name="full_name"
          type="text"
          placeholder="Jane Doe"
          className="dt-filter-input"
        />
      </label>

      <label className="dt-filter">
        <span className="dt-filter-label">Role</span>
        <select name="role" defaultValue="user" className="dt-filter-input">
          <option value="user">User</option>
          <option value="admin">Admin</option>
          {canInviteOwner && <option value="owner">Owner</option>}
        </select>
      </label>

      {state.error ? (
        <div
          role="alert"
          style={{
            background: "rgba(220, 38, 38, 0.08)",
            color: "var(--dt-danger)",
            padding: "10px 12px",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          {state.error}
        </div>
      ) : null}
      {state.ok ? (
        <div
          style={{
            background: "rgba(16, 185, 129, 0.08)",
            color: "var(--dt-success)",
            padding: "10px 12px",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          {state.ok}
        </div>
      ) : null}

      <SubmitButton canInviteOwner={canInviteOwner} />

      <p style={{ fontSize: 11.5, color: "var(--dt-warm-500)", margin: 0 }}>
        Supabase sends a one-time invite link. The invitee sets their own
        password on first sign-in.
      </p>
    </form>
  );
}
