"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Badge } from "@/components/Badge";
import { CALL_STATUSES, type InboundCall, type InboundCallStatus } from "@/lib/recruiting";
import { convertCallToCandidate, setCallStatus } from "./actions";

export function CallRow({ call, fmt }: { call: InboundCall; fmt: string }) {
  const [pending, startTransition] = useTransition();
  const tone =
    CALL_STATUSES.find((s) => s.id === call.follow_up_status)?.tone ?? "warm";
  const label =
    CALL_STATUSES.find((s) => s.id === call.follow_up_status)?.label ??
    call.follow_up_status;

  return (
    <tr>
      <td style={{ paddingLeft: 22 }}>
        <div style={{ fontWeight: 500 }}>{call.caller_name}</div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
          {call.caller_phone ?? "—"}
          {call.caller_email ? ` · ${call.caller_email}` : ""}
        </div>
        {call.notes && (
          <div
            className="muted"
            style={{
              fontSize: 11.5,
              marginTop: 4,
              maxWidth: 380,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {call.notes}
          </div>
        )}
      </td>
      <td>{call.position_of_interest ?? "—"}</td>
      <td className="tab-num" style={{ fontSize: 12 }}>{fmt}</td>
      <td className="muted" style={{ fontSize: 12 }}>{call.taken_by ?? "—"}</td>
      <td>
        <select
          value={call.follow_up_status}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as InboundCallStatus;
            startTransition(async () => {
              await setCallStatus(call.id, next);
            });
          }}
          className="dt-filter-input"
          style={{ fontSize: 11.5, padding: "4px 8px" }}
        >
          {CALL_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <div style={{ marginTop: 6 }}>
          <Badge tone={tone}>{label}</Badge>
        </div>
      </td>
      <td style={{ textAlign: "right", paddingRight: 22 }}>
        {call.converted_candidate_id ? (
          <Link
            href={`/candidates/${call.converted_candidate_id}`}
            className="dt-btn"
            style={{ fontSize: 11.5, padding: "4px 10px" }}
          >
            View Candidate →
          </Link>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await convertCallToCandidate(call.id);
              });
            }}
            className="dt-btn dt-btn-gold"
            style={{ fontSize: 11.5, padding: "4px 10px" }}
          >
            <span>→ Candidate</span>
          </button>
        )}
      </td>
    </tr>
  );
}
