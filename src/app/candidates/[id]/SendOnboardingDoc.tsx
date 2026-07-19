"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sendOnboardingDoc,
  markOfferDocSentManually,
  uploadSignedOfferDoc,
  getSignedOfferDocUrl,
} from "../actions";

// "Send Onboarding Doc" widget. Renders on the candidate detail page when
// stage === 'offer'.
//
// PandaDoc is `status='disconnected'` with null tokens in production. This
// control previously fired into it anyway and returned an unexplained error, so
// a recruiter at the offer stage hit a dead end with no path forward.
//
// Now: when PandaDoc is not actually working (derived health, not the status
// column) the automated button is DISABLED with an honest reason, and a manual
// path is offered — record that the offer went out out-of-band and attach the
// counter-signed copy — so onboarding is not blocked while OAuth waits on a
// meeting. When PandaDoc is reconnected, `pandadocWorking` flips true and the
// automated button returns with no code change.

export function SendOnboardingDoc({
  candidateId,
  hasEmail,
  alreadySentDocId,
  pandadocWorking = true,
  manualSentAt = null,
  manualSentBy = null,
  signedDocPath = null,
}: {
  candidateId: string;
  hasEmail: boolean;
  alreadySentDocId: string | null;
  pandadocWorking?: boolean;
  manualSentAt?: string | null;
  manualSentBy?: string | null;
  signedDocPath?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { ok: true; document_id: string } | { ok: false; error: string } | null
  >(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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

  const openSigned = async () => {
    if (!signedDocPath) return;
    const url = await getSignedOfferDocUrl(signedDocPath);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setErr("Could not open the signed document.");
  };

  // ---- PandaDoc is not working: honest disable + a manual path -------------
  if (!pandadocWorking) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <button
          type="button"
          className="dt-btn"
          disabled
          title="PandaDoc is not connected"
          style={{ justifyContent: "center", opacity: 0.55, cursor: "not-allowed" }}
        >
          Send Onboarding Doc
        </button>

        <div
          style={{
            fontSize: 11.5,
            lineHeight: 1.5,
            color: "#9A5B00",
            background: "rgba(230,145,0,0.08)",
            border: "1px solid rgba(230,145,0,0.35)",
            borderRadius: 6,
            padding: "8px 10px",
          }}
        >
          <strong>Automatic sending is unavailable.</strong> PandaDoc is not
          connected, so this cannot send a document. Send the offer by email or in
          person, then record it here so onboarding is not held up.
        </div>

        {manualSentAt ? (
          <div style={{ fontSize: 11.5, color: "var(--dt-success)" }}>
            Recorded as sent manually
            {manualSentBy ? ` by ${manualSentBy}` : ""} on{" "}
            {new Date(manualSentAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            .
          </div>
        ) : (
          <button
            type="button"
            className="dt-btn"
            disabled={isPending}
            onClick={() => {
              setErr(null);
              startTransition(async () => {
                try {
                  await markOfferDocSentManually(candidateId);
                  setMsg("Recorded as sent manually.");
                  router.refresh();
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Could not record.");
                }
              });
            }}
            style={{ justifyContent: "center" }}
          >
            {isPending ? "Recording…" : "Mark as sent manually"}
          </button>
        )}

        {signedDocPath ? (
          <button
            type="button"
            className="dt-btn"
            onClick={openSigned}
            style={{ justifyContent: "center" }}
          >
            Open signed copy →
          </button>
        ) : (
          <form
            action={(fd) => {
              setErr(null);
              startTransition(async () => {
                try {
                  await uploadSignedOfferDoc(candidateId, fd);
                  setMsg("Signed copy attached.");
                  router.refresh();
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Upload failed.");
                }
              });
            }}
          >
            <label
              className="dt-btn"
              style={{ justifyContent: "center", width: "100%", cursor: "pointer" }}
            >
              <input
                type="file"
                name="signed_doc"
                accept=".pdf,.doc,.docx,image/*"
                onChange={(e) => {
                  if ((e.currentTarget.files?.length ?? 0) > 0) {
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                style={{ display: "none" }}
                disabled={isPending}
              />
              {isPending ? "Uploading…" : "Attach signed copy"}
            </label>
          </form>
        )}

        {msg && <div style={{ fontSize: 11.5, color: "var(--dt-success)" }}>{msg}</div>}
        {err && <div style={{ fontSize: 11.5, color: "var(--dt-danger)" }}>{err}</div>}
      </div>
    );
  }

  // ---- PandaDoc is working: the original automated path --------------------
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
              Connect PandaDoc in <a href="/integrations">/integrations</a> first.
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
