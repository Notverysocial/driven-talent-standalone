"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  JOB_POSTING_PLATFORMS,
  JOB_POSTING_STATUSES,
  type JobPosting,
  type JobPostingStatus,
} from "@/lib/job-postings";
import {
  deleteJobPosting,
  setApplicationCount,
  setJobPostingStatus,
} from "./actions";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function JobPostingRow({
  posting,
  clientName,
}: {
  posting: JobPosting;
  clientName: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [count, setCount] = useState(posting.application_count);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const platform = JOB_POSTING_PLATFORMS.find((p) => p.id === posting.platform);
  const status = JOB_POSTING_STATUSES.find((s) => s.id === posting.status);

  return (
    <tr>
      <td style={{ paddingLeft: 22 }}>
        <div style={{ fontWeight: 500 }}>{posting.role_title}</div>
        {posting.posting_title && posting.posting_title !== posting.role_title && (
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            {posting.posting_title}
          </div>
        )}
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
          {clientName ?? "—"}
        </div>
      </td>
      <td>
        <Badge tone={platform?.tone ?? "warm"}>
          {platform?.label ?? posting.platform}
        </Badge>
      </td>
      <td className="tab-num" style={{ fontSize: 12 }}>
        {fmtDate(posting.posted_at)}
        {posting.status === "closed" && posting.closed_at && (
          <div style={{ fontSize: 10, color: "var(--dt-warm-500)", marginTop: 2 }}>
            closed {fmtDate(posting.closed_at)}
          </div>
        )}
      </td>
      <td>
        <input
          type="number"
          min={0}
          step={1}
          value={count}
          disabled={pending}
          onChange={(e) => setCount(Math.max(0, Number(e.target.value) || 0))}
          onBlur={() => {
            if (count !== posting.application_count) {
              startTransition(async () => {
                await setApplicationCount(posting.id, count);
              });
            }
          }}
          className="dt-filter-input tab-num"
          style={{ width: 70, fontSize: 12, padding: "4px 8px" }}
        />
      </td>
      <td>
        <select
          value={posting.status}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as JobPostingStatus;
            startTransition(async () => {
              await setJobPostingStatus(posting.id, next);
            });
          }}
          className="dt-filter-input"
          style={{ fontSize: 11.5, padding: "4px 8px" }}
        >
          {JOB_POSTING_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <div style={{ marginTop: 6 }}>
          <Badge tone={status?.tone ?? "warm"}>{status?.label ?? posting.status}</Badge>
        </div>
      </td>
      <td style={{ textAlign: "right", paddingRight: 22 }}>
        <div
          style={{
            display: "flex",
            gap: 6,
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          {posting.posting_url && (
            <a
              href={posting.posting_url}
              target="_blank"
              rel="noopener noreferrer"
              className="dt-btn"
              style={{ fontSize: 11.5, padding: "4px 10px" }}
            >
              View ↗
            </a>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmOpen(true)}
            className="dt-btn"
            style={{ fontSize: 11.5, padding: "4px 10px" }}
            title="Delete posting"
            data-testid={`job-posting-delete-${posting.id}`}
          >
            ×
          </button>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          title="Delete this posting?"
          description="This cannot be undone."
          confirmLabel="Delete posting"
          destructive
          busy={pending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            startTransition(async () => {
              await deleteJobPosting(posting.id);
              setConfirmOpen(false);
            });
          }}
          testId={`job-posting-delete-dialog-${posting.id}`}
        />
      </td>
    </tr>
  );
}
