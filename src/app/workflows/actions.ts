"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fireWorkflowEvent,
  normaliseDefinition,
  processScheduledJobs,
} from "@/lib/workflows.server";
import {
  type WorkflowDefinition,
  type WorkflowTriggerType,
  templateById,
} from "@/lib/workflows";

// Form serialises actions as a JSON string under "definition_json". That
// keeps the form server-action signature simple — the builder UI assembles
// the JSON client-side and submits a single hidden field, vs. dozens of
// indexed inputs that are painful to validate.
function parseDefinitionFromForm(fd: FormData): WorkflowDefinition {
  const raw = (fd.get("definition_json") as string) || "{}";
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  return normaliseDefinition(parsed);
}

export async function createWorkflow(formData: FormData): Promise<void> {
  const sb = await createClient();

  const name = ((formData.get("name") as string) ?? "").trim();
  const description = ((formData.get("description") as string) ?? "").trim() || null;
  const triggerType = (formData.get("trigger_type") as WorkflowTriggerType) || "lead_created";
  const enabled = formData.get("enabled") !== null;
  const createdBy = ((formData.get("created_by") as string) ?? "").trim() || null;
  const templateId = ((formData.get("template_id") as string) ?? "").trim() || null;

  const definition = parseDefinitionFromForm(formData);
  // Force trigger type to match the form field (the JSON may lag).
  definition.trigger.type = triggerType;

  if (!name) throw new Error("Give your workflow a name.");
  if (definition.actions.length === 0) {
    throw new Error("Add at least one action so the workflow does something.");
  }

  const { data, error } = await sb
    .from("workflows")
    .insert({
      name,
      description,
      trigger_type: triggerType,
      enabled,
      definition,
      template_id: templateId,
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/workflows");
  redirect(`/workflows/${data.id}`);
}

export async function installTemplate(templateId: string): Promise<void> {
  const tpl = templateById(templateId);
  if (!tpl) throw new Error("Unknown template.");

  const sb = await createClient();
  const { data, error } = await sb
    .from("workflows")
    .insert({
      name: tpl.name,
      description: tpl.description,
      trigger_type: tpl.definition.trigger.type,
      enabled: true,
      definition: tpl.definition,
      template_id: tpl.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/workflows");
  redirect(`/workflows/${data.id}`);
}

export async function updateWorkflow(workflowId: string, formData: FormData): Promise<void> {
  const sb = await createClient();

  const name = ((formData.get("name") as string) ?? "").trim();
  const description = ((formData.get("description") as string) ?? "").trim() || null;
  const triggerType = (formData.get("trigger_type") as WorkflowTriggerType) || "lead_created";
  const enabled = formData.get("enabled") !== null;
  const createdBy = ((formData.get("created_by") as string) ?? "").trim() || null;

  const definition = parseDefinitionFromForm(formData);
  definition.trigger.type = triggerType;

  if (!name) throw new Error("Give your workflow a name.");
  if (definition.actions.length === 0) {
    throw new Error("Add at least one action so the workflow does something.");
  }

  const { error } = await sb
    .from("workflows")
    .update({
      name,
      description,
      trigger_type: triggerType,
      enabled,
      definition,
      created_by: createdBy,
    })
    .eq("id", workflowId);

  if (error) throw new Error(error.message);
  revalidatePath("/workflows");
  revalidatePath(`/workflows/${workflowId}`);
}

export async function toggleWorkflowEnabled(workflowId: string, nextEnabled: boolean): Promise<void> {
  const sb = await createClient();
  const { error } = await sb
    .from("workflows")
    .update({ enabled: nextEnabled })
    .eq("id", workflowId);
  if (error) throw new Error(error.message);
  revalidatePath("/workflows");
  revalidatePath(`/workflows/${workflowId}`);
}

export async function deleteWorkflow(workflowId: string): Promise<void> {
  const sb = await createClient();
  const { error } = await sb.from("workflows").delete().eq("id", workflowId);
  if (error) throw new Error(error.message);
  revalidatePath("/workflows");
  redirect("/workflows");
}

// Triggers a test run with a synthetic payload so the user can verify
// the recipe end-to-end without waiting for a real event.
export async function testRunWorkflow(workflowId: string): Promise<void> {
  const sb = await createClient();
  const { data: wf } = await sb
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .maybeSingle();
  if (!wf) throw new Error("Workflow not found.");

  await fireWorkflowEvent(wf.trigger_type as WorkflowTriggerType, {
    source: {
      kind: "test",
      label: "Test event",
      to_stage: wf.definition?.trigger?.filter?.to_stage ?? undefined,
    },
    payload: { test: true },
  });

  revalidatePath(`/workflows/${workflowId}`);
  revalidatePath("/workflows");
}

// Manually drain the scheduled-job queue from the UI. Lets ops staff
// fast-forward delayed actions during demos / testing without waiting
// for the cron tick.
export async function tickScheduledJobs(): Promise<void> {
  await processScheduledJobs({ limit: 100, now: new Date() });
  revalidatePath("/workflows");
}

export async function completeTask(taskId: string): Promise<void> {
  const sb = await createClient();
  const { error } = await sb
    .from("workflow_tasks")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
    })
    .eq("id", taskId);
  if (error) throw new Error(error.message);
  revalidatePath("/workflows");
}

