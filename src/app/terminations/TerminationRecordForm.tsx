import type { TerminationField, TerminationSection } from "@/lib/terminations";

// Server-rendered, config-driven record form. Every field renders from its
// definition (no hardcoding) under the input name `f_<field_key>`, which the
// server action reads back. No client JS needed — it's a plain action form.

function FieldInput({
  field,
  value,
}: {
  field: TerminationField;
  value: string;
}) {
  const name = `f_${field.field_key}`;
  const common = { name, defaultValue: value, className: "dt-filter-input" };
  switch (field.field_type) {
    case "date":
      return <input type="date" {...common} />;
    case "number":
      return <input type="number" step="any" {...common} />;
    case "textarea":
      return (
        <textarea
          {...common}
          rows={3}
          style={{ resize: "vertical", minHeight: 64 }}
        />
      );
    case "yes_no":
      return (
        <select {...common}>
          <option value="">—</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      );
    case "dropdown":
      return (
        <select {...common}>
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "text":
    default:
      return <input type="text" {...common} />;
  }
}

export function TerminationRecordForm({
  sections,
  values,
  employees,
  action,
  submitLabel,
  employeeId,
}: {
  sections: TerminationSection[];
  values: Record<string, string>;
  employees: { id: string; full_name: string }[];
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  employeeId?: string | null;
}) {
  return (
    <form action={action} style={{ display: "grid", gap: 18 }}>
      <div className="dt-card" style={{ padding: "16px 22px" }}>
        <label className="dt-filter" style={{ maxWidth: 420 }}>
          <span className="dt-filter-label">
            Link to existing employee (optional)
          </span>
          <select
            name="employee_id"
            defaultValue={employeeId ?? ""}
            className="dt-filter-input"
          >
            <option value="">— Not linked (PEO / external) —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sections.map((s) => (
        <div key={s.id} className="dt-card" style={{ padding: 0 }}>
          <div className="dt-card-head">
            <h3>{s.title}</h3>
          </div>
          <div
            style={{
              padding: "16px 22px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
            }}
          >
            {s.fields.length === 0 ? (
              <div className="muted" style={{ fontSize: 12.5 }}>
                No fields in this section yet.
              </div>
            ) : (
              s.fields.map((f) => (
                <label key={f.id} className="dt-filter">
                  <span className="dt-filter-label">
                    {f.label}
                    {f.required ? " *" : ""}
                  </span>
                  <FieldInput field={f} value={values[f.field_key] ?? ""} />
                </label>
              ))
            )}
          </div>
        </div>
      ))}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="dt-btn dt-btn-gold">
          <span>{submitLabel}</span>
        </button>
      </div>
    </form>
  );
}
