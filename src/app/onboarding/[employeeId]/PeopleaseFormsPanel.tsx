"use client";

import { useTransition } from "react";
import { PEOPLEASE_FORM_STATUSES, calcFormsProgress } from "@/lib/peoplease-forms";
import type {
  EmployeePeopleaseForm,
  PeopleaseFormStatus,
} from "@/lib/supabase/types";
import { setPeopleaseFormStatus } from "../actions";

const STATUS_BG: Record<PeopleaseFormStatus, string> = {
  pending:     "var(--dt-warm-50)",
  in_progress: "var(--dt-gold-50)",
  complete:    "#EAF1E0",
  na:          "var(--dt-warm-100)",
};
const STATUS_FG: Record<PeopleaseFormStatus, string> = {
  pending:     "var(--dt-warm-700)",
  in_progress: "var(--dt-gold-deep)",
  complete:    "var(--dt-success)",
  na:          "var(--dt-warm-500)",
};

const DETAIL_BY_KEY: Record<string, string> = {
  general_info:   "Personal data: legal name, address, SSN, DOB, contact",
  i9:             "Section 1 (employee) + Section 2 (ID verification) complete",
  w4:             "Federal withholding election on file (a.k.a. the W-2 setup)",
  state_tax:      "California DE-4 withholding election on file",
  direct_deposit: "Bank routing/account + voided check, or pay-card opt-in",
  emergency:      "At least one emergency contact with phone number",
  eeo_selfid:     "Voluntary; record as N/A if the employee declines",
  handbook_ack:   "Signed acknowledgment of receipt of the employee handbook",
};

export function PeopleaseFormsPanel({
  employeeId,
  forms,
}: {
  employeeId: string;
  forms: EmployeePeopleaseForm[];
}) {
  const progress = calcFormsProgress(forms);

  return (
    <div className="dt-card" style={{ marginTop: 22 }}>
      <div className="dt-card-head">
        <div>
          <h3>PEOPLEASE Forms</h3>
          <div className="sub">
            New-hire forms packet · W-2/W-4, I-9, general info · set status per form
          </div>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: progress.pct === 100 ? "var(--dt-success)" : "var(--dt-gold-deep)",
          }}
        >
          {progress.complete}/{progress.relevant} complete · {progress.pct}%
        </span>
      </div>
      <div>
        {forms.map((f, i) => (
          <FormRow
            key={f.id}
            form={f}
            employeeId={employeeId}
            detail={DETAIL_BY_KEY[f.form_key] ?? null}
            isLast={i === forms.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function FormRow({
  form,
  employeeId,
  detail,
  isLast,
}: {
  form: EmployeePeopleaseForm;
  employeeId: string;
  detail: string | null;
  isLast: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const onStatusChange = (next: PeopleaseFormStatus) => {
    if (next === form.status) return;
    startTransition(async () => {
      await setPeopleaseFormStatus(form.id, employeeId, next);
    });
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 160px",
        gap: 16,
        alignItems: "center",
        padding: "14px 22px",
        borderBottom: isLast ? "none" : "1px solid var(--dt-warm-100)",
        opacity: isPending ? 0.6 : 1,
        transition: "opacity 100ms",
      }}
    >
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 400, lineHeight: 1.4 }}>{form.label}</div>
        {detail && (
          <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)", marginTop: 4, lineHeight: 1.4 }}>
            {detail}
          </div>
        )}
        {form.status === "complete" && form.completed_on && (
          <div style={{ fontSize: 10.5, color: "var(--dt-success)", marginTop: 6, letterSpacing: "0.06em" }}>
            ✓ {new Date(form.completed_on + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        )}
      </div>

      <select
        value={form.status}
        onChange={(e) => onStatusChange(e.target.value as PeopleaseFormStatus)}
        disabled={isPending}
        style={{
          padding: "8px 10px",
          fontSize: 12,
          fontWeight: 400,
          fontFamily: "inherit",
          background: STATUS_BG[form.status],
          color: STATUS_FG[form.status],
          border: "1px solid var(--dt-warm-150)",
          cursor: "pointer",
          outline: "none",
          width: "100%",
        }}
      >
        {PEOPLEASE_FORM_STATUSES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
