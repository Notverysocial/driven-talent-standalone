import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { getEmployeeProfile } from "@/lib/employees.server";
import { POSITIONS, DEPARTMENTS, SHIFTS } from "@/lib/staffing";
import { updateEmployee } from "@/app/roster/actions";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getEmployeeProfile(id);
  if (!profile) notFound();

  const { employee, assignments } = profile;
  // Edit pay rate / position against the primary active assignment (falls
  // back to the most recent assignment when none are active).
  const primary = assignments.find((a) => a.active) ?? assignments[0] ?? null;

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / EMPLOYEE / EDIT"
        scriptWord="Edit "
        title="Employee"
        actions={
          <Link href={`/employees/${employee.id}`} className="dt-btn">
            ← Cancel
          </Link>
        }
      />

      <form
        action={updateEmployee.bind(null, employee.id)}
        className="dt-card"
        style={{ padding: "28px 32px", maxWidth: 820 }}
      >
        <h3 style={{ marginBottom: 14, fontFamily: "var(--dt-display)", fontSize: 16, fontWeight: 400 }}>
          Person
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Field label="Full Name" name="full_name" defaultValue={employee.full_name} required />
          <Field label="Email" name="email" type="email" defaultValue={employee.email ?? ""} />
          <Field label="Phone" name="phone" defaultValue={employee.phone ?? ""} />
          <Field label="City" name="city" defaultValue={employee.city ?? ""} placeholder="e.g. Stockton, CA" />
        </div>

        {primary ? (
          <>
            <h3 style={{ margin: "26px 0 14px", fontFamily: "var(--dt-display)", fontSize: 16, fontWeight: 400 }}>
              Assignment <span style={{ fontSize: 11, color: "var(--dt-warm-500)", letterSpacing: "0.1em" }}>
                ({primary.client.name}{primary.active ? "" : " · ended"})
              </span>
            </h3>
            <input type="hidden" name="assignment_id" value={primary.id} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <SelectField
                label="Position"
                name="position"
                defaultValue={primary.position}
                options={dedupeOptions([primary.position, ...POSITIONS])}
              />
              <SelectField
                label="Department"
                name="department"
                defaultValue={primary.department}
                options={dedupeOptions([primary.department, ...DEPARTMENTS])}
              />
              <SelectField
                label="Shift"
                name="shift"
                defaultValue={primary.shift}
                options={dedupeOptions([primary.shift, ...SHIFTS])}
              />
              <Field
                label="Pay Rate ($/hr)"
                name="hourly_rate"
                type="number"
                step="0.25"
                defaultValue={String(primary.hourly_rate)}
              />
            </div>
          </>
        ) : (
          <p style={{ marginTop: 22, fontSize: 12.5, color: "var(--dt-warm-500)" }}>
            No assignment to edit. Add one from the profile to set pay rate and position.
          </p>
        )}

        <div style={{ marginTop: 20 }}>
          <label style={labelStyle}>Notes</label>
          <textarea
            name="notes"
            rows={3}
            defaultValue={employee.notes ?? ""}
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
          <Link href={`/employees/${employee.id}`} className="dt-btn">
            Cancel
          </Link>
          <button type="submit" className="dt-btn dt-btn-gold">
            <span>Save Changes</span>
          </button>
        </div>
      </form>
    </Shell>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10.5,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--dt-warm-500)",
  fontWeight: 400,
  marginBottom: 6,
};

// Keep the current value selectable even if it isn't in the canonical list
// (legacy data may use positions/shifts not in the enum constants).
function dedupeOptions(values: string[]): { value: string; label: string }[] {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const v of values) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push({ value: v, label: v });
  }
  return out;
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
  defaultValue?: string;
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
        defaultValue={defaultValue}
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
