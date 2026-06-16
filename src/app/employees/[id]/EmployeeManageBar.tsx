"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import {
  EMPLOYEE_STATUS_LABEL,
  employeeStatusTone,
} from "@/lib/staffing";
import type { EmployeeStatus } from "@/lib/supabase/types";
import {
  deleteEmployee,
  markDoNotReturn,
  setEmployeeStatus,
} from "@/app/roster/actions";

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--dt-warm-500)",
  fontWeight: 400,
  marginBottom: 6,
  display: "block",
};

export function EmployeeManageBar({
  employeeId,
  status,
  fullName,
  phone,
  lastCompany,
}: {
  employeeId: string;
  status: EmployeeStatus;
  fullName: string;
  phone: string | null;
  lastCompany: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [showDnr, setShowDnr] = useState(false);

  const isInactive = status === "inactive";
  const isDnr = status === "do_not_return";
  const isTerminated = status === "terminated";

  const toggleStatus = () => {
    const next: EmployeeStatus = isInactive ? "active" : "inactive";
    startTransition(() => {
      void setEmployeeStatus(employeeId, next);
    });
  };

  const onDelete = () => {
    if (
      !window.confirm(
        `Delete ${fullName} permanently? This removes their assignments, attendance and onboarding records. ` +
          `Employees with timecard / payroll history cannot be deleted — set them Inactive instead.`,
      )
    ) {
      return;
    }
    startTransition(() => {
      void deleteEmployee(employeeId);
    });
  };

  return (
    <div className="dt-card" style={{ padding: "18px 22px", marginBottom: 22 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>Manage</span>
          <Badge tone={employeeStatusTone(status)}>
            {EMPLOYEE_STATUS_LABEL[status]}
          </Badge>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/employees/${employeeId}/edit`} className="dt-btn">
            Edit
          </Link>

          {!isDnr && !isTerminated && (
            <button
              type="button"
              className="dt-btn"
              onClick={toggleStatus}
              disabled={pending}
            >
              {isInactive ? "Set Active" : "Set Inactive"}
            </button>
          )}

          {!isDnr && (
            <button
              type="button"
              className="dt-btn"
              onClick={() => setShowDnr((s) => !s)}
              disabled={pending}
              style={{ color: "var(--dt-danger)", borderColor: "var(--dt-danger)" }}
            >
              {showDnr ? "Cancel DNR" : "Mark Do Not Return"}
            </button>
          )}

          <button
            type="button"
            className="dt-btn"
            onClick={onDelete}
            disabled={pending}
            style={{ color: "var(--dt-danger)" }}
          >
            Delete
          </button>
        </div>
      </div>

      {showDnr && !isDnr && (
        <form
          action={markDoNotReturn.bind(null, employeeId)}
          style={{
            marginTop: 18,
            paddingTop: 18,
            borderTop: "1px solid var(--dt-warm-150)",
          }}
        >
          <div style={{ fontSize: 12.5, color: "var(--dt-warm-700)", marginBottom: 14, lineHeight: 1.5 }}>
            Adds <strong>{fullName}</strong> to the Do Not Return list and sets their
            status to <strong>Do Not Return</strong>. Active assignments will be ended.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label>
              <span style={labelStyle}>Phone</span>
              <input
                name="phone"
                defaultValue={phone ?? ""}
                className="dt-filter-input"
              />
            </label>
            <label>
              <span style={labelStyle}>Last Company</span>
              <input
                name="last_company"
                defaultValue={lastCompany ?? ""}
                className="dt-filter-input"
              />
            </label>
            <label>
              <span style={labelStyle}>Severity</span>
              <select name="severity" className="dt-filter-input" defaultValue="High">
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </label>
            <label>
              <span style={labelStyle}>Reported By</span>
              <input name="reported_by" className="dt-filter-input" />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 16 }}>
            <span style={labelStyle}>Reason</span>
            <textarea
              name="reason"
              rows={3}
              style={{
                width: "100%",
                padding: "12px 14px",
                background: "var(--dt-warm-50)",
                border: "1px solid var(--dt-warm-150)",
                fontSize: 13,
                fontFamily: "inherit",
                resize: "vertical",
                outline: "none",
              }}
            />
          </label>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              className="dt-btn"
              onClick={() => setShowDnr(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="dt-btn dt-btn-gold"
              style={{ background: "var(--dt-danger)" }}
            >
              <span>Confirm Do Not Return</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
