"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  changePassword,
  updateProfile,
  type PasswordState,
  type ProfileState,
} from "./actions";

function SaveButton({ pendingLabel, label }: { pendingLabel: string; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="dt-btn dt-btn-primary"
      disabled={pending}
      style={{ marginTop: 4, alignSelf: "flex-start" }}
    >
      <span>{pending ? pendingLabel : label}</span>
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
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
      {message}
    </div>
  );
}

function OkBox({ message }: { message: string }) {
  return (
    <div
      style={{
        background: "rgba(16, 185, 129, 0.08)",
        color: "var(--dt-success)",
        padding: "10px 12px",
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      {message}
    </div>
  );
}

export function ProfileEditForm({
  initialFullName,
}: {
  initialFullName: string;
}) {
  const [state, formAction] = useActionState<ProfileState, FormData>(
    updateProfile,
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
          Full name <span style={{ color: "var(--dt-danger)" }}>*</span>
        </span>
        <input
          name="full_name"
          type="text"
          required
          defaultValue={initialFullName}
          autoComplete="name"
          maxLength={200}
          className="dt-filter-input"
        />
      </label>

      {state.error ? <ErrorBox message={state.error} /> : null}
      {state.ok ? <OkBox message={state.ok} /> : null}

      <SaveButton label="Save changes" pendingLabel="Saving…" />
    </form>
  );
}

export function PasswordChangeForm() {
  const [state, formAction] = useActionState<PasswordState, FormData>(
    changePassword,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  // On a successful password change, clear the three inputs so the
  // user's plaintext password isn't sitting in the DOM after the
  // round-trip completes.
  useEffect(() => {
    if (state.ok && formRef.current) {
      formRef.current.reset();
    }
  }, [state.ok]);

  return (
    <form
      ref={formRef}
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
          Current password <span style={{ color: "var(--dt-danger)" }}>*</span>
        </span>
        <input
          name="current_password"
          type="password"
          required
          autoComplete="current-password"
          className="dt-filter-input"
        />
      </label>

      <label className="dt-filter">
        <span className="dt-filter-label">
          New password <span style={{ color: "var(--dt-danger)" }}>*</span>
        </span>
        <input
          name="new_password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="dt-filter-input"
        />
      </label>

      <label className="dt-filter">
        <span className="dt-filter-label">
          Confirm new password{" "}
          <span style={{ color: "var(--dt-danger)" }}>*</span>
        </span>
        <input
          name="confirm_password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="dt-filter-input"
        />
      </label>

      {state.error ? <ErrorBox message={state.error} /> : null}
      {state.ok ? <OkBox message={state.ok} /> : null}

      <SaveButton label="Change password" pendingLabel="Saving…" />

      <p style={{ fontSize: 11.5, color: "var(--dt-warm-500)", margin: 0 }}>
        Pick something at least 8 characters long that you'll remember —
        nobody at Driven Talent can see your password, so a lost one means
        an admin has to reset it.
      </p>
    </form>
  );
}
