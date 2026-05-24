"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";
import { useT } from "@/lib/i18n/client";

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" className="dt-btn dt-btn-primary" disabled={pending}>
      {pending ? t("login.submitting") : t("login.submit")}
    </button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});
  const t = useT();

  return (
    <form action={formAction} className="dt-login-form">
      <input type="hidden" name="next" value={next} />

      <label>
        <span>{t("login.email")}</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />
      </label>

      <label>
        <span>{t("login.password")}</span>
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
