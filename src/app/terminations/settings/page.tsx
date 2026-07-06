import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { requireRole } from "@/lib/auth.server";
import { listSections } from "@/lib/terminations.server";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  type TerminationField,
  type TerminationSection,
} from "@/lib/terminations";
import {
  addFieldAction,
  addSectionAction,
  deleteFieldAction,
  deleteSectionAction,
  moveFieldAction,
  moveSectionAction,
  renameSectionAction,
  toggleFieldAction,
  toggleSectionAction,
  updateFieldAction,
} from "./actions";

export const dynamic = "force-dynamic";

// Tiny hidden-input action button (move / toggle / delete).
function MiniForm({
  action,
  fields,
  label,
  confirm,
}: {
  action: (fd: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  label: string;
  confirm?: string;
}) {
  return (
    <form action={action} style={{ display: "inline" }}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        className="dt-btn"
        style={{ fontSize: 11, padding: "3px 8px" }}
        {...(confirm ? { formNoValidate: true } : {})}
      >
        {label}
      </button>
    </form>
  );
}

function FieldEditor({ field }: { field: TerminationField }) {
  return (
    <div
      style={{
        borderTop: "1px solid var(--dt-warm-100)",
        padding: "12px 16px",
        opacity: field.active ? 1 : 0.55,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 10.5, color: "var(--dt-warm-500)" }}>
          key <code>{field.field_key}</code>
        </span>
        {!field.active && <Badge tone="warm">Hidden</Badge>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <MiniForm action={moveFieldAction} fields={{ id: field.id, dir: "up" }} label="↑" />
          <MiniForm action={moveFieldAction} fields={{ id: field.id, dir: "down" }} label="↓" />
          <MiniForm
            action={toggleFieldAction}
            fields={{ id: field.id, active: String(!field.active) }}
            label={field.active ? "Hide" : "Show"}
          />
          <MiniForm action={deleteFieldAction} fields={{ id: field.id }} label="Delete" confirm="1" />
        </div>
      </div>
      <form
        action={updateFieldAction}
        style={{ display: "grid", gap: 8, gridTemplateColumns: "1.4fr 1fr", alignItems: "end" }}
      >
        <input type="hidden" name="id" value={field.id} />
        <label className="dt-filter">
          <span className="dt-filter-label">Label</span>
          <input name="label" defaultValue={field.label} className="dt-filter-input" />
        </label>
        <label className="dt-filter">
          <span className="dt-filter-label">Type</span>
          <select name="field_type" defaultValue={field.field_type} className="dt-filter-input">
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="dt-filter" style={{ gridColumn: "1 / -1" }}>
          <span className="dt-filter-label">
            Dropdown options (one per line — only used for the Dropdown type)
          </span>
          <textarea
            name="options"
            defaultValue={field.options.join("\n")}
            rows={field.options.length > 2 ? field.options.length : 2}
            className="dt-filter-input"
            style={{ resize: "vertical", minHeight: 44 }}
          />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
          <input type="checkbox" name="required" defaultChecked={field.required} /> Required
        </label>
        <button type="submit" className="dt-btn dt-btn-primary" style={{ justifySelf: "end" }}>
          Save field
        </button>
      </form>
    </div>
  );
}

function AddFieldForm({ sectionId }: { sectionId: string }) {
  return (
    <form
      action={addFieldAction}
      style={{
        borderTop: "1px dashed var(--dt-warm-200)",
        padding: "12px 16px",
        display: "grid",
        gap: 8,
        gridTemplateColumns: "1.4fr 1fr auto",
        alignItems: "end",
        background: "var(--dt-warm-50)",
      }}
    >
      <input type="hidden" name="section_id" value={sectionId} />
      <label className="dt-filter">
        <span className="dt-filter-label">New field label</span>
        <input name="label" placeholder="e.g. COBRA notice sent" className="dt-filter-input" required />
      </label>
      <label className="dt-filter">
        <span className="dt-filter-label">Type</span>
        <select name="field_type" defaultValue="text" className="dt-filter-input">
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {FIELD_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="dt-btn dt-btn-gold">
        <span>+ Add field</span>
      </button>
      <label
        className="dt-filter"
        style={{ gridColumn: "1 / -1" }}
      >
        <span className="dt-filter-label">Dropdown options (one per line, if Dropdown)</span>
        <textarea name="options" rows={2} className="dt-filter-input" style={{ resize: "vertical", minHeight: 40 }} />
      </label>
    </form>
  );
}

function SectionCard({ section }: { section: TerminationSection }) {
  return (
    <div className="dt-card" style={{ padding: 0, opacity: section.active ? 1 : 0.6 }}>
      <div className="dt-card-head" style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <form action={renameSectionAction} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="hidden" name="id" value={section.id} />
          <input
            name="title"
            defaultValue={section.title}
            className="dt-filter-input"
            style={{ fontWeight: 500, minWidth: 200 }}
          />
          <button type="submit" className="dt-btn" style={{ fontSize: 11, padding: "4px 9px" }}>
            Rename
          </button>
        </form>
        {!section.active && <Badge tone="warm">Hidden</Badge>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <MiniForm action={moveSectionAction} fields={{ id: section.id, dir: "up" }} label="↑" />
          <MiniForm action={moveSectionAction} fields={{ id: section.id, dir: "down" }} label="↓" />
          <MiniForm
            action={toggleSectionAction}
            fields={{ id: section.id, active: String(!section.active) }}
            label={section.active ? "Hide" : "Show"}
          />
          <MiniForm action={deleteSectionAction} fields={{ id: section.id }} label="Delete" confirm="1" />
        </div>
      </div>
      {section.fields.map((f) => (
        <FieldEditor key={f.id} field={f} />
      ))}
      <AddFieldForm sectionId={section.id} />
    </div>
  );
}

export default async function TerminationSettingsPage() {
  await requireRole("admin");
  const sections = await listSections(true); // include inactive for editing

  return (
    <Shell>
      <Topbar
        crumb="HR / OFFBOARDING / TERMINATIONS"
        scriptWord="Manage "
        title="Termination Fields"
        actions={
          <Link href="/terminations" className="dt-btn">
            ← Tracker
          </Link>
        }
      />

      <div
        className="dt-card"
        style={{
          padding: "14px 20px",
          marginBottom: 18,
          fontSize: 12.5,
          color: "var(--dt-warm-600, #5a4a3a)",
          borderLeft: "3px solid var(--dt-gold)",
        }}
      >
        Add, rename, reorder, hide, or remove sections and fields here — changes
        take effect immediately across the tracker, no developer or deploy.
        Renaming a field keeps its saved answers (they’re stored by a stable
        internal key). Hiding a field preserves history; deleting removes it.
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        {sections.map((s) => (
          <SectionCard key={s.id} section={s} />
        ))}
      </div>

      <form
        action={addSectionAction}
        className="dt-card"
        style={{
          marginTop: 18,
          padding: "16px 20px",
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
          background: "var(--dt-warm-50)",
        }}
      >
        <label className="dt-filter" style={{ flex: "1 1 260px", maxWidth: 360 }}>
          <span className="dt-filter-label">New section title</span>
          <input name="title" placeholder="e.g. Compliance" className="dt-filter-input" required />
        </label>
        <button type="submit" className="dt-btn dt-btn-gold">
          <span>+ Add section</span>
        </button>
      </form>
    </Shell>
  );
}
