import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";
import { createCandidate } from "../actions";

export default async function NewCandidatePage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / CANDIDATES / NEW"
        scriptWord="New "
        title="Candidate"
        actions={
          <Link href="/candidates" className="dt-btn">
            ← Cancel
          </Link>
        }
      />

      <form action={createCandidate} className="dt-card" style={{ padding: "28px 32px", maxWidth: 720 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Field label="Full Name" name="full_name" required />
          <Field label="Applied For" name="applied_for" placeholder="e.g. Forklift Driver · Warehouse" />
          <Field label="Email" name="email" type="email" />
          <Field label="Phone" name="phone" />
          <Field label="City" name="city" placeholder="e.g. Stockton, CA" />
          <Field label="Source" name="source" placeholder="Referral · LinkedIn · Indeed" />
          <Field label="Years Experience" name="experience_years" type="number" step="0.5" />
          <SelectField
            label="Target Client"
            name="client_id"
            options={[
              { value: "", label: "— Unassigned —" },
              ...(clients ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
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
            Certifications
          </label>
          <input
            name="certifications"
            placeholder="Forklift Cert, OSHA-10, BLS / CPR"
            className="dt-filter-input"
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: 11, color: "var(--dt-warm-500)", marginTop: 4 }}>
            Comma-separated.
          </div>
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
            rows={4}
            placeholder="Where they came from, why they stand out, anything Roxanna should know."
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
          <Link href="/candidates" className="dt-btn">
            Cancel
          </Link>
          <button type="submit" className="dt-btn dt-btn-gold">
            <span>Create Candidate</span>
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
        className="dt-filter-input"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
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
      <select name={name} className="dt-filter-input">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
