"use client";

import { useActionState, useState } from "react";
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
      <span>{pending ? "Creating…" : "+ Create Account"}</span>
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

      <label className="dt-filter">
        <span className="dt-filter-label">
          Custom password (leave blank to auto-generate)
        </span>
        <input
          name="password"
          type="text"
          autoComplete="off"
          placeholder="auto-generate"
          className="dt-filter-input"
        />
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

      {state.tempPassword && state.email ? (
        <CredentialPanel email={state.email} password={state.tempPassword} />
      ) : state.ok ? (
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
        Owner sets the initial password. No email is sent — share the temp
        password with the new user via Signal or text. They can change it
        from settings after first sign-in.
      </p>
    </form>
  );
}

export function CredentialPanel({
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
      // clipboard unavailable; user can still copy manually
    }
  }

  return (
    <div
      style={{
        background: "rgba(16, 185, 129, 0.08)",
        border: "1px solid rgba(16, 185, 129, 0.25)",
        borderRadius: 6,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--dt-success)" }}>
        Account created. Share these credentials with the user via Signal or
        text. They can change the password from settings after logging in.
      </div>
      <div
        style={{
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          background: "var(--dt-white, #fff)",
          border: "1px solid var(--dt-warm-200, rgba(0,0,0,0.08))",
          borderRadius: 4,
          padding: "8px 10px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        Email: {email}
        {"\n"}Password: {password}
      </div>
      <button
        type="button"
        onClick={copy}
        className="dt-btn"
        style={{
          alignSelf: "flex-start",
          padding: "6px 10px",
          fontSize: 11,
        }}
      >
        {copied ? "Copied!" : "Copy credentials"}
      </button>
    </div>
  );
}
