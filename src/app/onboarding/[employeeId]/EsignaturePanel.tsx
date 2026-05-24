"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import {
  DOCUMENT_KINDS,
  ESIGN_STATUS_LABEL,
  ESIGN_STATUS_TONE,
  PROVIDER_LABEL,
  fmtDateTime,
  type EsignProvider as ProviderKey,
  type EsignatureRequest,
} from "@/lib/team";
import {
  cancelEsignatureRequest,
  markEsignatureSigned,
  sendEsignatureRequest,
} from "../esign-actions";

type ProviderInfo = {
  key: ProviderKey;
  label: string;
  status: "configured" | "missing_credentials" | "stub";
};

export function EsignaturePanel({
  employeeId,
  recipientName,
  recipientEmail,
  requests,
  provider,
}: {
  employeeId: string;
  recipientName: string;
  recipientEmail: string;
  requests: EsignatureRequest[];
  provider: ProviderInfo;
}) {
  const [isPending, startTransition] = useTransition();
  const [documentKind, setDocumentKind] = useState<string>("welcome_letter");

  const onSend = (formData: FormData) => {
    startTransition(async () => {
      await sendEsignatureRequest(employeeId, formData);
    });
  };

  const isStub = provider.key === "manual" || provider.status !== "configured";

  return (
    <div className="dt-card" style={{ marginTop: 22 }}>
      <div className="dt-card-head">
        <div>
          <h3>E-Signature Requests</h3>
          <div className="sub">
            Send Welcome Letter + Agreement via{" "}
            <strong style={{ fontWeight: 500 }}>{PROVIDER_LABEL[provider.key]}</strong>
            {isStub && " · running in manual / stub mode"}
          </div>
        </div>
        <Badge tone={provider.status === "configured" && !isStub ? "green" : "amber"}>
          {provider.label}
        </Badge>
      </div>

      {isStub && (
        <div
          style={{
            margin: "0 22px",
            padding: "10px 14px",
            background: "var(--dt-warm-50)",
            border: "1px solid var(--dt-warm-150)",
            borderLeft: "3px solid var(--dt-gold)",
            fontSize: 11.5,
            color: "var(--dt-warm-700)",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ fontWeight: 500 }}>Stub mode:</strong>{" "}
          set <code>ESIGN_PROVIDER=documenso</code> and{" "}
          <code>DOCUMENSO_API_URL</code> + <code>DOCUMENSO_API_TOKEN</code>{" "}
          in env to send real requests. PandaDocs has been retired in favor of
          Documenso (open-source, ~10× cheaper, self-hostable). DocuSeal and a
          manual flow are also available via <code>ESIGN_PROVIDER</code>.
        </div>
      )}

      <div style={{ padding: "16px 22px 4px" }}>
        <form
          action={onSend}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <label className="dt-filter">
            <span className="dt-filter-label">Document</span>
            <select
              name="document_kind"
              value={documentKind}
              onChange={(e) => setDocumentKind(e.target.value)}
              className="dt-filter-input"
            >
              {DOCUMENT_KINDS.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
          </label>
          <label className="dt-filter">
            <span className="dt-filter-label">Recipient email</span>
            <input
              name="recipient_email"
              type="email"
              required
              defaultValue={recipientEmail}
              className="dt-filter-input"
            />
          </label>
          <button
            type="submit"
            className="dt-btn dt-btn-gold"
            disabled={isPending || !recipientEmail}
          >
            <span>{isPending ? "Sending…" : "Send for signature"}</span>
          </button>
          <input type="hidden" name="recipient_name" value={recipientName} />
        </form>
        {!recipientEmail && (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--dt-warning)" }}>
            Add an email to the employee profile before sending an e-sign request.
          </div>
        )}
      </div>

      <div style={{ padding: "10px 0 0" }}>
        {requests.length === 0 ? (
          <div
            style={{
              padding: "24px 22px",
              fontSize: 12,
              color: "var(--dt-warm-500)",
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            No e-signature requests yet for this employee.
          </div>
        ) : (
          requests.map((r, i) => (
            <RequestRow
              key={r.id}
              request={r}
              employeeId={employeeId}
              isLast={i === requests.length - 1}
            />
          ))
        )}
      </div>
    </div>
  );
}

function RequestRow({
  request,
  employeeId,
  isLast,
}: {
  request: EsignatureRequest;
  employeeId: string;
  isLast: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const onMarkSigned = () => {
    if (!confirm("Mark this request as signed?")) return;
    startTransition(async () => {
      await markEsignatureSigned(request.id, employeeId);
    });
  };
  const onCancel = () => {
    if (!confirm("Cancel this request?")) return;
    startTransition(async () => {
      await cancelEsignatureRequest(request.id, employeeId);
    });
  };

  const isDone = request.status === "signed";
  const isCancelled = request.status === "cancelled";

  return (
    <div
      style={{
        padding: "14px 22px",
        borderTop: "1px solid var(--dt-warm-100)",
        borderBottom: isLast ? "none" : undefined,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 12,
        opacity: isPending ? 0.55 : isCancelled ? 0.6 : 1,
        transition: "opacity 120ms",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{request.document_title}</div>
          <Badge tone={ESIGN_STATUS_TONE[request.status]}>
            {ESIGN_STATUS_LABEL[request.status]}
          </Badge>
          <Badge tone="dark">{PROVIDER_LABEL[request.provider]}</Badge>
        </div>
        <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--dt-warm-500)" }}>
          to {request.recipient_email}
          {request.sent_at && ` · sent ${fmtDateTime(request.sent_at)}`}
          {request.signed_at && ` · signed ${fmtDateTime(request.signed_at)}`}
        </div>
        {request.signing_url && (
          <div style={{ marginTop: 6 }}>
            <a
              href={request.signing_url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 11.5, color: "var(--dt-gold-deep)" }}
            >
              Open signing link →
            </a>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {!isDone && !isCancelled && (
          <>
            <button
              type="button"
              className="dt-btn"
              onClick={onMarkSigned}
              disabled={isPending}
              style={{ padding: "4px 10px", fontSize: 9.5, letterSpacing: "0.14em" }}
            >
              <span>Mark Signed</span>
            </button>
            <button
              type="button"
              className="dt-btn dt-btn-ghost"
              onClick={onCancel}
              disabled={isPending}
              style={{ padding: "4px 10px", fontSize: 9.5, letterSpacing: "0.14em" }}
            >
              <span>Cancel</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
