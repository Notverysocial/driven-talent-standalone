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

      {/* ------------------------------------------------------------------
          PUBLIC. Everything in this section can appear on the careers page
          at driven-talent.com. The heading says so out loud, because the
          alternative is a recruiter typing a client's confidential detail
          into a box with no idea it will be published.
      ------------------------------------------------------------------- */}
      <SectionHeading
        title="Public listing"
        note="Shown to job seekers on driven-talent.com. Do not put client-confidential detail here."
        tone="public"
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Field
          label="Company Name"
          name="company_name"
          defaultValue={position?.company_name ?? ""}
          placeholder="Shown on the public listing"
        />
        <Field
          label="Job Category"
          name="job_category"
          defaultValue={position?.job_category ?? ""}
          placeholder="e.g. Warehouse · Logistics · Driver"
        />
        <Field
          label="City"
          name="city"
          defaultValue={position?.city ?? ""}
          placeholder="e.g. Chino"
        />
        <Field
          label="Locality / Area"
          name="locality"
          defaultValue={position?.locality ?? ""}
          placeholder="e.g. Inland Empire"
        />
        <Field
          label="Min Pay Rate"
          name="min_pay_rate"
          type="number"
          step="0.01"
          defaultValue={position?.min_pay_rate ?? ""}
          placeholder="Range low end"
        />
        <Field
          label="Max Pay Rate"
          name="max_pay_rate"
          type="number"
          step="0.01"
          defaultValue={position?.max_pay_rate ?? ""}
          placeholder="Range high end"
        />
        <Field
          label="Schedule / Hours"
          name="schedule_hours"
          defaultValue={position?.schedule_hours ?? ""}
          placeholder="e.g. Mon–Fri, 40 hrs/wk"
        />
        <Field
          label="Job Description URL"
          name="job_description_url"
          type="url"
          defaultValue={position?.job_description_url ?? ""}
          placeholder="https://…"
        />
        <Field
          label="Start Date"
          name="start_date"
          type="date"
          defaultValue={position?.start_date ?? ""}
        />
        <Field
          label="End Date"
          name="end_date"
          type="date"
          defaultValue={position?.end_date ?? ""}
        />
      </div>

      <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
        <Checkbox
          label="Bilingual required"
          name="bilingual"
          defaultChecked={position?.bilingual ?? false}
        />
        <Checkbox
          label="Resume required"
          name="resume_required"
          defaultChecked={position?.resume_required ?? false}
        />
      </div>

      <TextArea
        label="Requirements"
        name="requirements"
        defaultValue={position?.requirements ?? ""}
        placeholder="Certifications, experience, must-haves. This is published."
      />
      <TextArea
        label="Special Skills"
        name="special_skills"
        defaultValue={position?.special_skills ?? ""}
        placeholder="Equipment, licences, or skills a job seeker should have. This is published."
      />

      {/* ------------------------------------------------------------------
          INTERNAL. Never rendered publicly.
      ------------------------------------------------------------------- */}
      <SectionHeading
        title="Internal only"
        note="Never shown on the public careers page — for the recruiting team."
        tone="internal"
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <SelectField
          label="Priority"
          name="priority"
          defaultValue={position?.priority ?? ""}
          options={[
            { value: "",       label: "— None —" },
            { value: "high",   label: "High" },
            { value: "normal", label: "Normal" },
            { value: "low",    label: "Low" },
          ]}
        />
        <Field
          label="Deadline to Fill"
          name="deadline_to_fill"
          defaultValue={position?.deadline_to_fill ?? ""}
          placeholder="Our internal fill target — not an application deadline"
        />
      </div>

      <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
        <Checkbox label="Posted — Redes"    name="posted_redes"    defaultChecked={position?.posted_redes ?? false} />
        <Checkbox label="Posted — Indeed"   name="posted_indeed"   defaultChecked={position?.posted_indeed ?? false} />
        <Checkbox label="Posted — LinkedIn" name="posted_linkedin" defaultChecked={position?.posted_linkedin ?? false} />
      </div>

      <TextArea
        label="Recruiting Notes"
        name="recruiting_notes"
        defaultValue={position?.recruiting_notes ?? ""}
        placeholder="Working notes for the recruiter — sources tried, candidates considered, blockers. Never published."
      />
    </>
  );
}

function SectionHeading({
  title,
  note,
  tone,
}: {
  title: string;
  note: string;
  tone: "public" | "internal";
}) {
  const accent = tone === "public" ? "var(--dt-gold-deep)" : "var(--dt-warm-500)";
  return (
    <div
      style={{
        marginTop: 28,
        marginBottom: 4,
        paddingTop: 16,
        borderTop: "1px solid var(--dt-warm-150)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: accent,
          fontWeight: 500,
        }}
      >
        {tone === "public" ? "◆ " : "▪ "}
        {title}
      </div>
      <div style={{ fontSize: 12, color: "var(--dt-warm-500)", marginTop: 4 }}>{note}</div>
    </div>
  );
}

function Checkbox({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      {/* Hidden "0" companion so an UNCHECKED box submits a value. Without it
          the key is absent from FormData and the action cannot tell "unchecked"
          from "not on this form", which is how a box silently fails to clear. */}
      <input type="hidden" name={name} value="0" />
      <input type="checkbox" name={name} value="1" defaultChecked={defaultChecked} />
      {label}
    </label>
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
