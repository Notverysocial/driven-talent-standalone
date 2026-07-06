import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { getEmployeeProfile } from "@/lib/employees.server";
import { listClientsForPicker } from "@/lib/hr.server";
import { listTeamMembersForPicker } from "@/lib/legal-tasks.server";
import { POSITIONS, DEPARTMENTS, SHIFTS } from "@/lib/staffing";
import { addAssignment, updateEmployee } from "@/app/roster/actions";

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
  const hasActiveAssignment = assignments.some((a) => a.active);

  const [clients, teamMembers] = await Promise.all([
    listClientsForPicker(),
    listTeamMembersForPicker(),
  ]);

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
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>Onboarding In Charge</span>
            <input
              name="onboarding_in_charge"
              defaultValue={employee.onboarding_in_charge ?? ""}
              list="team-members-list"
              placeholder="Pick a teammate or type a name…"
              className="dt-filter-input"
            />
            <datalist id="team-members-list">
              {teamMembers.map((t) => (
                <option key={t.id} value={t.full_name} />
              ))}
            </datalist>
          </label>
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
            No active assignment yet. Use{" "}
            <strong>“Assign to a company”</strong> below to place this employee —
            that also makes them appear under Active Employees.
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

      {/* Assign to a company — the previously-missing UI over the existing
          addAssignment action. Creating an active assignment is what makes an
          onboarding employee appear under Active Employees. Separate form
          because addAssignment is its own server action. */}
      <form
        action={addAssignment.bind(null, employee.id)}
        className="dt-card"
        style={{ padding: "24px 32px", maxWidth: 820, marginTop: 22 }}
      >
        <h3 style={{ marginBottom: 4, fontFamily: "var(--dt-display)", fontSize: 16, fontWeight: 400 }}>
          Assign to a company
        </h3>
        <p style={{ fontSize: 12, color: "var(--dt-warm-500)", marginBottom: 16 }}>
          {hasActiveAssignment
            ? "Add another active client assignment for this employee."
            : "Place this employee at a client. An active assignment is required for them to count as an Active Employee."}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>
              Company<span style={{ color: "var(--dt-danger)" }}> *</span>
            </span>
            <select name="client_id" required className="dt-filter-input" defaultValue="">
              <option value="" disabled>
                Select a client…
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <SelectField label="Position" name="position" options={dedupeOptions([...POSITIONS])} defaultValue={POSITIONS[0]} />
          <SelectField label="Department" name="department" options={dedupeOptions([...DEPARTMENTS])} defaultValue={DEPARTMENTS[0]} />
          <SelectField label="Shift" name="shift" options={dedupeOptions([...SHIFTS])} defaultValue={SHIFTS[0]} />
          <Field label="Pay Rate ($/hr)" name="hourly_rate" type="number" step="0.25" defaultValue="20" />
          <Field label="Start Date" name="start_date" type="date" defaultValue="" />
        </div>
        <div style={{ marginTop: 22, display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" className="dt-btn dt-btn-gold" disabled={clients.length === 0}>
            <span>+ Assign to company</span>
          </button>
        </div>
        {clients.length === 0 && (
          <p style={{ marginTop: 10, fontSize: 12, color: "var(--dt-danger)" }}>
            No clients found. Add a client first under Clients.
          </p>
        )}
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
