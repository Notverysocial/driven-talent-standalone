import type { Position } from "@/lib/recruiting";

type ClientOption = { id: string; name: string };

export function PositionForm({
  clients,
  position,
}: {
  clients: ClientOption[];
  position?: Position;
}) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Field
          label="Role Title"
          name="role_title"
          required
          defaultValue={position?.role_title}
          placeholder="e.g. Forklift Operator"
        />
        <SelectField
          label="Client"
          name="client_id"
          defaultValue={position?.client_id ?? ""}
          options={[
            { value: "", label: "— Unassigned —" },
            ...clients.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <Field
          label="Department"
          name="department"
          defaultValue={position?.department ?? ""}
          placeholder="e.g. Warehouse"
        />
        <Field
          label="Shift"
          name="shift"
          defaultValue={position?.shift ?? ""}
          placeholder="1st shift M-F 6a–2:30p"
        />
        <Field
          label="Pay Rate"
          name="pay_rate"
          type="number"
          step="0.01"
          defaultValue={position?.pay_rate ?? ""}
        />
        <SelectField
          label="Rate Unit"
          name="pay_rate_unit"
          defaultValue={position?.pay_rate_unit ?? "hourly"}
          options={[
            { value: "hourly", label: "Hourly" },
            { value: "salary", label: "Salary (annual)" },
            { value: "piece",  label: "Piece rate" },
          ]}
        />
        <Field
          label="Headcount"
          name="headcount"
          type="number"
          step="1"
          defaultValue={position?.headcount ?? 1}
          required
        />
        <Field
          label="Needed By"
          name="needed_by"
          type="date"
          defaultValue={position?.needed_by ?? ""}
        />
        <Field
          label="Recruiter"
          name="recruiter"
          defaultValue={position?.recruiter ?? ""}
          placeholder="Rocio · Leangel · Estefany"
        />
      </div>

      <TextArea
        label="Requirements"
        name="requirements"
        defaultValue={position?.requirements ?? ""}
        placeholder="Certifications, experience, must-haves the client expects."
      />
      <TextArea
        label="Recruiting Notes"
        name="recruiting_notes"
        defaultValue={position?.recruiting_notes ?? ""}
        placeholder="Working notes for the recruiter — sources tried, candidates considered, blockers."
      />
    </>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
  step,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  step?: string;
  defaultValue?: string | number | null;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
        }}
      >
        {label}
        {required && <span style={{ color: "var(--dt-danger)" }}> *</span>}
      </span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        step={step}
        defaultValue={defaultValue ?? ""}
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
      <span
        style={{
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
        }}
      >
        {label}
      </span>
      <select name={name} defaultValue={defaultValue} className="dt-filter-input">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
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
        {label}
      </label>
      <textarea
        name={name}
        rows={3}
        placeholder={placeholder}
        defaultValue={defaultValue}
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
  );
}
