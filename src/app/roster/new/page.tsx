import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { listClients } from "@/lib/employees.server";
import { POSITIONS, DEPARTMENTS, SHIFTS } from "@/lib/staffing";
import { createEmployee } from "../actions";

export default async function NewEmployeePage() {
  const clients = await listClients();

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / EMPLOYEES / NEW"
        scriptWord="New "
        title="Employee"
        actions={
          <Link href="/roster" className="dt-btn">
            ← Cancel
          </Link>
        }
      />

      <form action={createEmployee} className="dt-card" style={{ padding: "28px 32px", maxWidth: 820 }}>
        <h3 style={{ marginBottom: 14, fontFamily: "var(--dt-display)", fontSize: 16, fontWeight: 400 }}>Person</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Field label="Full Name" name="full_name" required />
          <Field label="Email" name="email" type="email" />
          <Field label="Phone" name="phone" />
          <Field label="City" name="city" placeholder="e.g. Stockton, CA" />
          <Field label="Hire Date" name="hire_date" type="date" />
          <SelectField
            label="Status"
            name="status"
            defaultValue="onboarding"
            options={[
              { value: "onboarding", label: "Onboarding" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </div>

        <h3 style={{ margin: "26px 0 14px", fontFamily: "var(--dt-display)", fontSize: 16, fontWeight: 400 }}>
          First Assignment <span style={{ fontSize: 11, color: "var(--dt-warm-500)", letterSpacing: "0.1em" }}>(optional)</span>
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <SelectField
            label="Client"
            name="client_id"
            options={[
              { value: "", label: "— No assignment yet —" },
              ...clients.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <SelectField
            label="Position"
            name="position"
            options={POSITIONS.map((p) => ({ value: p, label: p }))}
          />
          <SelectField
            label="Department"
            name="department"
            options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
          />
          <SelectField
            label="Shift"
            name="shift"
            options={SHIFTS.map((s) => ({ value: s, label: s }))}
          />
          <Field label="Start Date" name="start_date" type="date" />
          <Field label="Bill Rate ($/hr)" name="hourly_rate" type="number" step="0.25" />
        </div>

        <div style={{ marginTop: 20 }}>
          <label
            style={{
              display: "block",
              fontSize: 10.5,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--dt-warm-500)",
              fontWeight: 400,
              marginBottom: 6,
            }}
          >
            Notes
          </label>
          <textarea
            name="notes"
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
        </div>

        <div style={{ marginTop: 24, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Link href="/roster" className="dt-btn">
            Cancel
          </Link>
          <button type="submit" className="dt-btn dt-btn-gold">
            <span>Create Employee</span>
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>
        {label}
        {required && <span style={{ color: "var(--dt-danger)" }}> *</span>}
      </span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        step={step}
        className="dt-filter-input"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>
        {label}
      </span>
      <select name={name} className="dt-filter-input" defaultValue={defaultValue}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
