"use client";

import { useState, useTransition } from "react";
import { sendOnboardingDoc } from "../actions";

// "Send Onboarding Doc" client widget. Renders on the candidate detail
// page when stage === 'offer'. Click → server action → PandaDoc creates +
// sends doc from the configured template. On success the document_id is
// stored on the candidate row; the webhook will flip the candidate to
// "hired" on completion.
//
// If PandaDoc isn't connected (the server action returns a not_connected
// error), we surface a tooltip-style helper pointing the operator to
// /integrations.

export function SendOnboardingDoc({
  candidateId,
  hasEmail,
  alreadySentDocId,
}: {
  candidateId: string;
  hasEmail: boolean;
  alreadySentDocId: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { ok: true; document_id: string } | { ok: false; error: string } | null
  >(null);

  const sent = alreadySentDocId || (result?.ok ? result.document_id : null);

  if (sent) {
    return (
      <div
        className="dt-card"
        style={{
          padding: "12px 16px",
          fontSize: 12,
          color: "var(--dt-success)",
          borderLeft: "3px solid var(--dt-success)",
        }}
      >
        Onboarding doc sent — awaiting candidate signature.
        <div
          className="muted"
          style={{ fontSize: 10.5, marginTop: 4, letterSpacing: "0.04em" }}
        >
          PandaDoc ID: <code>{sent}</code>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <button
        type="button"
        className="dt-btn dt-btn-gold"
        disabled={isPending || !hasEmail}
        title={
          !hasEmail
            ? "Candidate has no email on file"
            : "Send onboarding offer via PandaDoc"
        }
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const r = await sendOnboardingDoc(candidateId);
            setResult(r);
          });
        }}
      >
        <span>{isPending ? "Sending…" : "Send Onboarding Doc"}</span>
      </button>
      {result && !result.ok && (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--dt-danger)",
            lineHeight: 1.4,
          }}
        >
          {result.error === "not_connected" ? (
            <>
              Connect PandaDoc in <a href="/integrations">/integrations</a>{" "}
              first.
            </>
          ) : result.error === "missing_template_id_set_in_integrations_pandadoc" ? (
            <>
              Set the onboarding template ID on the PandaDoc card in{" "}
              <a href="/integrations">/integrations</a>.
            </>
          ) : (
            result.error
          )}
        </div>
      )}
    </div>
  );
}
