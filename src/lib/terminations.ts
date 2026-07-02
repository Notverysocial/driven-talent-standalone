// Terminations / offboarding tracker — shared types + pure helpers.
// Config-driven: sections + fields are editable DATA (see migration 0037).
// Per-record answers are stored in a jsonb `values` map keyed by the field's
// stable `field_key`, so renaming a field's label never orphans its values.

export type TerminationFieldType =
  | "text"
  | "textarea"
  | "date"
  | "yes_no"
  | "dropdown"
  | "number";

export type TerminationField = {
  id: string;
  section_id: string;
  field_key: string;
  label: string;
  field_type: TerminationFieldType;
  options: string[];
  required: boolean;
  sort_order: number;
  active: boolean;
};

export type TerminationSection = {
  id: string;
  title: string;
  sort_order: number;
  active: boolean;
  fields: TerminationField[];
};

export type TerminationRecord = {
  id: string;
  employee_id: string | null;
  employee_name: string | null;
  values: Record<string, string>;
  archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const FIELD_TYPES: TerminationFieldType[] = [
  "text",
  "textarea",
  "date",
  "yes_no",
  "dropdown",
  "number",
];

export const FIELD_TYPE_LABELS: Record<TerminationFieldType, string> = {
  text: "Text",
  textarea: "Long text",
  date: "Date",
  yes_no: "Yes / No",
  dropdown: "Dropdown",
  number: "Number",
};

export function isTerminationFieldType(v: string): v is TerminationFieldType {
  return (FIELD_TYPES as string[]).includes(v);
}

// Turn a human label into a stable, URL/JSON-safe field_key.
export function slugifyFieldKey(label: string): string {
  const base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return base || "field";
}

// Completion over all ACTIVE fields that have a non-empty value.
export function computeProgress(
  sections: TerminationSection[],
  values: Record<string, string>,
): { filled: number; total: number; pct: number } {
  let total = 0;
  let filled = 0;
  for (const s of sections) {
    if (!s.active) continue;
    for (const f of s.fields) {
      if (!f.active) continue;
      total += 1;
      if ((values[f.field_key] ?? "").trim()) filled += 1;
    }
  }
  const pct = total === 0 ? 0 : Math.round((filled / total) * 100);
  return { filled, total, pct };
}

// Display value for a stored answer (yes_no prettified, empty → dash).
export function displayValue(
  field: Pick<TerminationField, "field_type">,
  raw: string | undefined | null,
): string {
  const v = (raw ?? "").trim();
  if (!v) return "—";
  if (field.field_type === "yes_no") {
    return v === "yes" ? "Yes" : v === "no" ? "No" : v;
  }
  return v;
}

// COMPUTED, display-only: whole days between the termination date and today.
// Never stored / never manually entered. Null when no valid date is set.
export function daysSinceTerm(
  terminationDate: string | undefined | null,
): number | null {
  const raw = (terminationDate ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw.length <= 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
