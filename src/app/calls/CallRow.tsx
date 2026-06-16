"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CALL_STATUSES, type InboundCall, type InboundCallStatus } from "@/lib/recruiting";
import {
  convertCallToCandidate,
  deleteCall,
  setCallStatus,
  updateCall,
} from "./actions";

function datetimeLocal(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function CallRow({ call, fmt }: { call: InboundCall; fmt: string }) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const tone =
    CALL_STATUSES.find((s) => s.id === call.follow_up_status)?.tone ?? "warm";
  const label =
    CALL_STATUSES.find((s) => s.id === call.follow_up_status)?.label ??
    call.follow_up_status;

  const hasRcDetails =
    call.ringcentral_id != null ||
    call.recording_url != null ||
    call.voicemail_transcription != null ||
    call.call_duration_seconds != null;

  const durationText = formatDuration(call.call_duration_seconds ?? null);

  // Display cells link to the drill-in; the RingCentral toggle, status select,
  // and action button stay outside the link so they remain interactive (no
  // nested anchors/buttons).
  const href = `/calls/${call.id}`;
  const cellLink = (children: ReactNode) => (
    <Link
      href={href}
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
    >
      {children}
    </Link>
  );

  return (
    <>
      <tr className="dt-row-clickable">
        <td style={{ paddingLeft: 22 }}>
          {cellLink(
            <>
              <div style={{ fontWeight: 500 }}>{call.caller_name}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                {call.caller_phone ?? "—"}
                {call.caller_email ? ` · ${call.caller_email}` : ""}
                {durationText ? ` · ${durationText}` : ""}
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
            </>,
          )}
          {hasRcDetails && (
            <button
              type="button"
              onClick={() => setExpanded((x) => !x)}
              style={{
                marginTop: 6,
                fontSize: 10.5,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              {expanded ? "Hide RingCentral details ▴" : "Show RingCentral details ▾"}
            </button>
          )}
        </td>
        <td>{cellLink(<>{call.position_of_interest ?? "—"}</>)}</td>
        <td className="tab-num" style={{ fontSize: 12 }}>
          {cellLink(<>{fmt}</>)}
        </td>
        <td className="muted" style={{ fontSize: 12 }}>
          {cellLink(<>{call.taken_by ?? "—"}</>)}
        </td>
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
        <td style={{ paddingRight: 22 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              alignItems: "flex-end",
            }}
          >
            {call.converted_candidate_id ? (
              <Link
                href={`/candidates/${call.converted_candidate_id}`}
                className="dt-btn"
                style={{ fontSize: 11.5, padding: "4px 10px", whiteSpace: "nowrap" }}
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
                style={{ fontSize: 11.5, padding: "4px 10px", whiteSpace: "nowrap" }}
              >
                <span>→ Candidate</span>
              </button>
            )}
            <div style={{ display: "flex", gap: 4 }}>
              <button
                type="button"
                className="dt-btn dt-btn-ghost"
                style={{ padding: "2px 8px", fontSize: 9, letterSpacing: "0.14em" }}
                onClick={() => setEditOpen(true)}
              >
                <span>Edit</span>
              </button>
              <button
                type="button"
                className="dt-btn dt-btn-ghost"
                style={{
                  padding: "2px 8px",
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  color: "var(--dt-danger)",
                }}
                onClick={() => setDeleteOpen(true)}
              >
                <span>Delete</span>
              </button>
            </div>
          </div>
        </td>
      </tr>
      {expanded && hasRcDetails && (
        <tr>
          <td colSpan={6} style={{ paddingLeft: 22, paddingRight: 22, paddingBottom: 14, background: "var(--dt-warm-50)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, fontSize: 12 }}>
              {call.ringcentral_id && (
                <div>
                  <div className="muted" style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase" }}>
                    Session ID
                  </div>
                  <div className="tab-num" style={{ fontFamily: "monospace" }}>{call.ringcentral_id}</div>
                </div>
              )}
              {call.call_status && (
                <div>
                  <div className="muted" style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase" }}>
                    Call Status
                  </div>
                  <div>{call.call_status}</div>
                </div>
              )}
              {call.recording_url && (
                <div>
                  <div className="muted" style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase" }}>
                    Recording
                  </div>
                  <a href={call.recording_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--dt-gold)" }}>
                    Open recording ↗
                  </a>
                </div>
              )}
              {call.voicemail_transcription && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div className="muted" style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase" }}>
                    Voicemail Transcription
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{call.voicemail_transcription}</div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}

      {editOpen && (
        <tr>
          <td colSpan={6} style={{ padding: 0 }}>
            <div
              className="dt-cal-dialog-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) setEditOpen(false);
              }}
            >
              <div className="dt-cal-dialog" role="dialog" aria-modal="true">
                <div className="dt-cal-dialog-head">
                  <div>
                    <div className="crumb">Edit call</div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 300, letterSpacing: "0.06em" }}>
                      {call.caller_name}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="dt-btn dt-btn-ghost tiny"
                    onClick={() => setEditOpen(false)}
                  >
                    Close ✕
                  </button>
                </div>

                <form
                  action={updateCall.bind(null, call.id)}
                  onSubmit={() => setEditOpen(false)}
                  className="dt-cal-dialog-body"
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  <DialogField label="Caller Name">
                    <input name="caller_name" type="text" required defaultValue={call.caller_name} className="dt-filter-input" />
                  </DialogField>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <DialogField label="Phone">
                      <input name="caller_phone" type="tel" defaultValue={call.caller_phone ?? ""} className="dt-filter-input" />
                    </DialogField>
                    <DialogField label="Email">
                      <input name="caller_email" type="email" defaultValue={call.caller_email ?? ""} className="dt-filter-input" />
                    </DialogField>
                  </div>
                  <DialogField label="Position of Interest">
                    <input name="position_of_interest" type="text" defaultValue={call.position_of_interest ?? ""} className="dt-filter-input" />
                  </DialogField>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <DialogField label="Taken By">
                      <input name="taken_by" type="text" defaultValue={call.taken_by ?? ""} className="dt-filter-input" />
                    </DialogField>
                    <DialogField label="Called At">
                      <input name="called_at" type="datetime-local" defaultValue={datetimeLocal(call.called_at)} className="dt-filter-input" />
                    </DialogField>
                  </div>
                  <DialogField label="Status">
                    <select name="follow_up_status" defaultValue={call.follow_up_status} className="dt-filter-input">
                      {CALL_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </DialogField>
                  <DialogField label="Notes">
                    <textarea
                      name="notes"
                      rows={3}
                      defaultValue={call.notes ?? ""}
                      className="dt-filter-input"
                      style={{ resize: "vertical", minHeight: 60 }}
                    />
                  </DialogField>

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                    <button type="button" className="dt-btn" onClick={() => setEditOpen(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="dt-btn dt-btn-gold">
                      <span>Save</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </td>
        </tr>
      )}

      {deleteOpen && (
        <tr>
          <td colSpan={6} style={{ padding: 0 }}>
            <ConfirmDialog
              open={deleteOpen}
              title="Delete this call?"
              description="This permanently removes the call from the log."
              confirmLabel="Delete call"
              destructive
              busy={pending}
              onCancel={() => setDeleteOpen(false)}
              onConfirm={() =>
                startTransition(async () => {
                  await deleteCall(call.id);
                  setDeleteOpen(false);
                })
              }
              testId="call-delete-dialog"
            />
          </td>
        </tr>
      )}
    </>
  );
}

function DialogField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="dt-filter">
      <span className="dt-filter-label">{label}</span>
      {children}
    </label>
  );
}

function formatDuration(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
