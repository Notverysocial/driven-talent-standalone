"use client";

import { useMemo, useState } from "react";
import {
  ACTIONS,
  DELAY_PRESETS,
  TRIGGERS,
  delayLabel,
  findTrigger,
  type WorkflowAction,
  type WorkflowActionType,
  type WorkflowDefinition,
  type WorkflowTriggerType,
} from "@/lib/workflows";

// The recipe builder is intentionally a guided FORM, not a node canvas.
// Non-technical recruiters fill in dropdowns + short text fields and the
// component assembles the WorkflowDefinition JSON into a single hidden
// "definition_json" field that the server action parses.

type Props = {
  // Server action — bound at the page level (createWorkflow or updateWorkflow).
  action: (formData: FormData) => void | Promise<void>;
  initial?: {
    name?: string;
    description?: string;
    createdBy?: string;
    enabled?: boolean;
    definition?: WorkflowDefinition;
    templateId?: string;
  };
  submitLabel: string;
  mode: "create" | "edit";
};

function emptyAction(type: WorkflowActionType): WorkflowAction {
  return {
    id: Math.random().toString(36).slice(2, 10),
    type,
    params: defaultParams(type),
    delay_minutes: 0,
  };
}

function defaultParams(type: WorkflowActionType): WorkflowAction["params"] {
  switch (type) {
    case "assign_member":     return { assignee: "" };
    case "create_task":       return { title: "", notes: "", assignee: "" };
    case "send_notification": return { to: "", subject: "", body: "" };
    case "change_status":     return { to: "" };
  }
}

export function WorkflowBuilder({ action, initial, submitLabel, mode }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [createdBy, setCreatedBy] = useState(initial?.createdBy ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>(
    initial?.definition?.trigger.type ?? "lead_created",
  );
  const [stageFilter, setStageFilter] = useState<string>(
    initial?.definition?.trigger.filter?.to_stage ?? "any",
  );
  const [actions, setActions] = useState<WorkflowAction[]>(
    initial?.definition?.actions?.length
      ? initial.definition.actions
      : [emptyAction("assign_member")],
  );

  const trigger = useMemo(() => findTrigger(triggerType), [triggerType]);

  const definition: WorkflowDefinition = useMemo(
    () => ({
      trigger: {
        type: triggerType,
        ...(trigger.hasStageFilter && stageFilter !== "any"
          ? { filter: { to_stage: stageFilter } }
          : {}),
      },
      actions,
    }),
    [triggerType, stageFilter, actions, trigger],
  );

  function updateAction(i: number, patch: Partial<WorkflowAction>) {
    setActions((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }
  function updateParam(i: number, key: string, value: string) {
    setActions((prev) =>
      prev.map((a, idx) => (idx === i ? { ...a, params: { ...a.params, [key]: value } } : a)),
    );
  }
  function removeAction(i: number) {
    setActions((prev) => prev.filter((_, idx) => idx !== i));
  }
  function moveAction(i: number, dir: -1 | 1) {
    setActions((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Hidden state the server action reads */}
      <input type="hidden" name="definition_json" value={JSON.stringify(definition)} />
      {initial?.templateId && <input type="hidden" name="template_id" value={initial.templateId} />}

      <div className="dt-card gold-edge" style={{ padding: 0 }}>
        <div className="dt-card-head">
          <div>
            <h3>Step 1 · Name your workflow</h3>
            <div className="sub">Give it a name your team will recognise.</div>
          </div>
        </div>
        <div style={{ padding: "18px 26px", display: "grid", gap: 14 }}>
          <Field label="Workflow name *">
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. New lead → 24-hour follow-up"
              className="dt-filter-input"
            />
          </Field>
          <Field label="Short description (optional)">
            <input
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What problem this automation solves"
              className="dt-filter-input"
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Owner (your name)">
              <input
                name="created_by"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                placeholder="Who to ask about this"
                className="dt-filter-input"
              />
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <input
                name="enabled"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                style={{ accentColor: "var(--dt-gold-deep)" }}
              />
              <span>
                <strong style={{ fontWeight: 500 }}>Enabled</strong>
                <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>
                  Off = the workflow stays saved but won&apos;t run on real events.
                </div>
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="dt-card" style={{ padding: 0 }}>
        <div className="dt-card-head">
          <div>
            <h3>Step 2 · When this happens…</h3>
            <div className="sub">Pick the event that should fire this automation.</div>
          </div>
        </div>
        <div style={{ padding: "18px 26px", display: "grid", gap: 14 }}>
          <Field label="Trigger event">
            <select
              name="trigger_type"
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as WorkflowTriggerType)}
              className="dt-filter-input"
            >
              {TRIGGERS.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </Field>
          {trigger.hasStageFilter && (
            <Field label="Only when stage becomes">
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="dt-filter-input"
              >
                {trigger.stages?.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </Field>
          )}
          <div
            style={{
              padding: "10px 14px",
              background: "var(--dt-warm-50)",
              borderLeft: "3px solid var(--dt-gold)",
              fontSize: 12.5,
              color: "var(--dt-warm-700)",
              lineHeight: 1.5,
            }}
          >
            <strong style={{ fontWeight: 500 }}>{trigger.plain}</strong>
            {trigger.hasStageFilter && stageFilter !== "any" && (
              <> → <em>{trigger.stages?.find((s) => s.id === stageFilter)?.label}</em></>
            )}
          </div>
        </div>
      </div>

      <div className="dt-card" style={{ padding: 0 }}>
        <div className="dt-card-head">
          <div>
            <h3>Step 3 · …do these things</h3>
            <div className="sub">Actions run in order. Add a delay if you want to wait first.</div>
          </div>
        </div>
        <div style={{ padding: "18px 26px", display: "flex", flexDirection: "column", gap: 14 }}>
          {actions.map((a, i) => (
            <ActionRow
              key={a.id}
              index={i}
              total={actions.length}
              action={a}
              onChangeType={(t) =>
                updateAction(i, { type: t, params: defaultParams(t) })
              }
              onChangeParam={(k, v) => updateParam(i, k, v)}
              onChangeDelay={(m) => updateAction(i, { delay_minutes: m })}
              onMove={(dir) => moveAction(i, dir)}
              onRemove={() => removeAction(i)}
            />
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ACTIONS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setActions((prev) => [...prev, emptyAction(a.id)])}
                className="dt-btn"
                style={{ padding: "6px 12px", fontSize: 10, letterSpacing: "0.12em" }}
              >
                <span>+ {a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>
          {actions.length} {actions.length === 1 ? "action" : "actions"} ·{" "}
          {mode === "create" ? "creating new workflow" : "editing existing workflow"}
        </div>
        <button type="submit" className="dt-btn dt-btn-gold">
          <span>{submitLabel}</span>
        </button>
      </div>
    </form>
  );
}

function ActionRow({
  index,
  total,
  action,
  onChangeType,
  onChangeParam,
  onChangeDelay,
  onMove,
  onRemove,
}: {
  index: number;
  total: number;
  action: WorkflowAction;
  onChangeType: (t: WorkflowActionType) => void;
  onChangeParam: (key: string, value: string) => void;
  onChangeDelay: (minutes: number) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--dt-warm-150)",
        background: "var(--dt-warm-50)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--dt-warm-500)",
          }}
        >
          Action {index + 1}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="dt-btn dt-btn-ghost"
            style={{ padding: "2px 8px", fontSize: 10, opacity: index === 0 ? 0.3 : 1 }}
            aria-label="Move up"
          >
            <span>↑</span>
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="dt-btn dt-btn-ghost"
            style={{ padding: "2px 8px", fontSize: 10, opacity: index === total - 1 ? 0.3 : 1 }}
            aria-label="Move down"
          >
            <span>↓</span>
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="dt-btn dt-btn-ghost"
            style={{ padding: "2px 8px", fontSize: 10, color: "var(--dt-danger)" }}
            aria-label="Remove action"
          >
            <span>Remove</span>
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Do this">
          <select
            value={action.type}
            onChange={(e) => onChangeType(e.target.value as WorkflowActionType)}
            className="dt-filter-input"
          >
            {ACTIONS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </Field>
        <Field label="When">
          <select
            value={String(action.delay_minutes)}
            onChange={(e) => onChangeDelay(Number(e.target.value))}
            className="dt-filter-input"
          >
            {DELAY_PRESETS.map((d) => (
              <option key={d.id} value={d.minutes}>{d.label}</option>
            ))}
            {!DELAY_PRESETS.some((d) => d.minutes === action.delay_minutes) && (
              <option value={String(action.delay_minutes)}>{delayLabel(action.delay_minutes)}</option>
            )}
          </select>
        </Field>
      </div>

      <ActionParams action={action} onChangeParam={onChangeParam} />
    </div>
  );
}

function ActionParams({
  action,
  onChangeParam,
}: {
  action: WorkflowAction;
  onChangeParam: (key: string, value: string) => void;
}) {
  switch (action.type) {
    case "assign_member":
      return (
        <Field label="Assign to">
          <input
            value={action.params.assignee ?? ""}
            onChange={(e) => onChangeParam("assignee", e.target.value)}
            placeholder="Recruiter name (e.g. Roxanna V.)"
            className="dt-filter-input"
          />
        </Field>
      );
    case "create_task":
      return (
        <>
          <Field label="Task title">
            <input
              value={action.params.title ?? ""}
              onChange={(e) => onChangeParam("title", e.target.value)}
              placeholder="e.g. Follow up with new lead"
              className="dt-filter-input"
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Assign to">
              <input
                value={action.params.assignee ?? ""}
                onChange={(e) => onChangeParam("assignee", e.target.value)}
                placeholder="Recruiter name"
                className="dt-filter-input"
              />
            </Field>
            <Field label="Notes">
              <input
                value={action.params.notes ?? ""}
                onChange={(e) => onChangeParam("notes", e.target.value)}
                placeholder="Context for the task"
                className="dt-filter-input"
              />
            </Field>
          </div>
        </>
      );
    case "send_notification":
      return (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Notify">
              <input
                value={action.params.to ?? ""}
                onChange={(e) => onChangeParam("to", e.target.value)}
                placeholder="Recipient name or team"
                className="dt-filter-input"
              />
            </Field>
            <Field label="Subject">
              <input
                value={action.params.subject ?? ""}
                onChange={(e) => onChangeParam("subject", e.target.value)}
                placeholder="What this is about"
                className="dt-filter-input"
              />
            </Field>
          </div>
          <Field label="Message">
            <textarea
              value={action.params.body ?? ""}
              onChange={(e) => onChangeParam("body", e.target.value)}
              rows={2}
              className="dt-filter-input"
              style={{ resize: "vertical", minHeight: 50 }}
              placeholder="Body of the notification"
            />
          </Field>
        </>
      );
    case "change_status":
      return (
        <Field label="New status">
          <input
            value={action.params.to ?? ""}
            onChange={(e) => onChangeParam("to", e.target.value)}
            placeholder="e.g. screening"
            className="dt-filter-input"
          />
        </Field>
      );
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="dt-filter">
      <span className="dt-filter-label">{label}</span>
      {children}
    </label>
  );
}
