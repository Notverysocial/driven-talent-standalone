"use client";

import { useActionState, useState } from "react";
import { saveApiKeyAction, type IntegrationActionState } from "./actions";
import type { IntegrationProvider } from "@/lib/integrations/types";

// API-key paste modal for providers whose auth mode is "api_key"
// (Indeed, uAttend). The form is collapsed by default; clicking
// "Connect" expands it inline inside the card.

const initial: IntegrationActionState = {};

export function ApiKeyForm({
  provider,
  displayName,
}: {
  provider: IntegrationProvider;
  displayName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(saveApiKeyAction, initial);

  if (!open) {
    return (
      <button
        type="button"
        className="dt-btn dt-btn-gold"
        onClick={() => setOpen(true)}
      >
        Connect
      </button>
    );
  }

  return (
    <form action={formAction} style={{ display: "grid", gap: 8 }}>
      <input type="hidden" name="provider" value={provider} />
      <label style={{ fontSize: 11, color: "var(--dt-warm-500)" }}>
        {displayName} API key
      </label>
      <input
        type="password"
        name="api_key"
        autoComplete="off"
        placeholder="Paste API key"
        required
        className="dt-input"
        style={{
          padding: "8px 10px",
          border: "1px solid var(--dt-warm-200)",
          borderRadius: 4,
          fontFamily: "var(--dt-mono, monospace)",
          fontSize: 12,
        }}
      />
      <input
        type="email"
        name="account_email"
        placeholder="Account email (optional)"
        className="dt-input"
        style={{
          padding: "8px 10px",
          border: "1px solid var(--dt-warm-200)",
          borderRadius: 4,
          fontSize: 12,
        }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button type="submit" className="dt-btn dt-btn-gold">
          Save
        </button>
        <button
          type="button"
          className="dt-btn"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
      {state.error && (
        <div style={{ color: "var(--dt-danger)", fontSize: 11.5 }}>
          {state.error}
        </div>
      )}
      {state.ok && (
        <div style={{ color: "var(--dt-success)", fontSize: 11.5 }}>
          {state.ok}
        </div>
      )}
    </form>
  );
}
