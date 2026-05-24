"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="dt-btn dt-btn-primary" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="dt-login-form">
      <input type="hidden" name="next" value={next} />

      <label>
        <span>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />
      </label>

      <label>
        <span>Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>

      {state.error ? (
        <div className="dt-login-error" role="alert">
          {state.error}
        </div>
      ) : null}

      <SubmitButton />
    </form>
  );
}
