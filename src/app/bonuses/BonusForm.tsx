"use client";

import { useActionState, useState, useMemo, useRef, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { createBonus, type BonusFormState, type BonusFormValues } from "./actions";

type PickerOpt = { id: string; label: string };

export type BonusFormProps = {
  employees: PickerOpt[];
  candidates: PickerOpt[];
  positions: PickerOpt[];
  clients: PickerOpt[];
};

const TODAY = () => new Date().toISOString().slice(0, 10);

const EMPTY_VALUES: BonusFormValues = {
  kind: "recruiter",
  amount: "",
  earned_date: "",
  recruiter_name: "",
  referrer_employee_id: "",
  employee_id: "",
  candidate_id: "",
  subject_name: "",
  position_id: "",
  client_id: "",
  notes: "",
};

const initial: BonusFormState = { ok: false, errors: {}, values: EMPTY_VALUES };

export function BonusForm({ employees, candidates, positions, clients }: BonusFormProps) {
  const [state, formAction] = useActionState<BonusFormState, FormData>(createBonus, initial);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Track kind locally so the conditional "required" hint stays in sync
  // without bouncing through the server. Initialized from the action's
  // last submitted values when present, so a server-rejected submit
  // re-renders with the kind the user actually picked.
  const initialKind = state.ok === false ? state.values.kind || "recruiter" : "recruiter";
  const [kind, setKind] = useState<string>(initialKind);

  useEffect(() => {
    if (state.ok === false && state.values.kind && state.values.kind !== kind) {
      setKind(state.values.kind);
    }
    if (state.ok === true) {
      // Successful submit — wipe the form for the next entry.
      formRef.current?.reset();
      setKind("recruiter");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const values = useMemo(
    () => (state.ok === false ? state.values : EMPTY_VALUES),
    [state],
  );
  const errors = state.ok === false ? state.errors : {};
  const formError = errors._form;

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      data-testid="bonus-form"
      style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}
    >
      <Field label="Kind" error={errors.kind}>
        <select
          name="kind"
          required
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="dt-filter-input"
          data-testid="bonus-kind"
        >
          <option value="recruiter">Recruiter</option>
          <option value="referral">Referral</option>
        </select>
      </Field>

      <Field label="Amount ($)" error={errors.amount}>
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0"
          required
          placeholder="250.00"
          defaultValue={values.amount}
          className="dt-filter-input"
          aria-invalid={errors.amount ? true : undefined}
          data-testid="bonus-amount"
        />
      </Field>

      <Field label="Earned date" error={errors.earned_date}>
        <input
          name="earned_date"
          type="date"
          defaultValue={values.earned_date || TODAY()}
          className="dt-filter-input"
        />
      </Field>

      <Field
        label={`Recruiter name${kind === "recruiter" ? " (required)" : ""}`}
        error={errors.recruiter_name}
      >
        <input
          name="recruiter_name"
          type="text"
          placeholder="Leangel · Estefany · …"
          defaultValue={values.recruiter_name}
          className="dt-filter-input"
          aria-invalid={errors.recruiter_name ? true : undefined}
          data-testid="bonus-recruiter-name"
        />
      </Field>

      <Field
        label={`Referring employee${kind === "referral" ? " (required)" : ""}`}
        error={errors.referrer_employee_id}
      >
        <select
          name="referrer_employee_id"
          defaultValue={values.referrer_employee_id}
          className="dt-filter-input"
          aria-invalid={errors.referrer_employee_id ? true : undefined}
        >
          <option value="">—</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </Field>

      <div
        style={{
          marginTop: 4,
          paddingTop: 12,
          borderTop: "1px solid var(--dt-warm-100)",
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
        }}
      >
        About the hire
      </div>

      <Field label="Placed employee">
        <select
          name="employee_id"
          defaultValue={values.employee_id}
          className="dt-filter-input"
        >
          <option value="">—</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="…or candidate (pre-hire)">
        <select
          name="candidate_id"
          defaultValue={values.candidate_id}
          className="dt-filter-input"
        >
          <option value="">—</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="…or just a name" error={errors.subject_name}>
        <input
          name="subject_name"
          type="text"
          placeholder="Name (if no employee / candidate record yet)"
          defaultValue={values.subject_name}
          className="dt-filter-input"
          aria-invalid={errors.subject_name ? true : undefined}
          data-testid="bonus-subject-name"
        />
      </Field>

      <Field label="Position (optional)">
        <select
          name="position_id"
          defaultValue={values.position_id}
          className="dt-filter-input"
        >
          <option value="">—</option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Client (optional)">
        <select
          name="client_id"
          defaultValue={values.client_id}
          className="dt-filter-input"
        >
          <option value="">—</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Notes">
        <textarea
          name="notes"
          rows={2}
          defaultValue={values.notes}
          className="dt-filter-input"
          style={{ resize: "vertical", minHeight: 50 }}
        />
      </Field>

      {formError && (
        <div className="dt-login-error" role="alert" data-testid="bonus-form-error">
          {formError}
        </div>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="dt-btn dt-btn-primary"
      style={{ marginTop: 4 }}
      disabled={pending}
      data-testid="bonus-submit"
    >
      <span>{pending ? "Logging…" : "Log Bonus"}</span>
    </button>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="dt-filter">
      <span className="dt-filter-label">{label}</span>
      {children}
      {error && (
        <span
          role="alert"
          data-testid="bonus-field-error"
          style={{
            display: "block",
            marginTop: 4,
            fontSize: 11,
            color: "var(--dt-danger, #b91c1c)",
            fontWeight: 500,
          }}
        >
          {error}
        </span>
      )}
    </label>
  );
}
