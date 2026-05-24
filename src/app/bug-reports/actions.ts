"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { BUG_SEVERITIES, BUG_STATUSES } from "@/lib/bug-reports";
import type { BugSeverity, BugStatus } from "@/lib/supabase/types";

const REVALIDATE_PATHS = ["/bug-reports", "/dashboard"] as const;

function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

export async function createBugReport(formData: FormData) {
  const supabase = await createClient();

  const description = (formData.get("description") as string)?.trim();
  if (!description) throw new Error("Description is required");

  const severityRaw = (formData.get("severity") as string) || "medium";
  const severity = (BUG_SEVERITIES as string[]).includes(severityRaw)
    ? (severityRaw as BugSeverity)
    : "medium";

  const reporterName =
    ((formData.get("reporter_name") as string) || "").trim() || null;
  const reporterEmail =
    ((formData.get("reporter_email") as string) || "").trim() || null;
  const pagePath = ((formData.get("page_path") as string) || "").trim() || null;
  const pageLabel =
    ((formData.get("page_label") as string) || "").trim() || null;
  const userAgent =
    ((formData.get("user_agent") as string) || "").trim() || null;
  const stepsToReproduce =
    ((formData.get("steps_to_reproduce") as string) || "").trim() || null;
  const attachmentPath =
    ((formData.get("attachment_path") as string) || "").trim() || null;

  const { error } = await supabase.from("bug_reports").insert({
    reporter_name: reporterName,
    reporter_email: reporterEmail,
    page_path: pagePath,
    page_label: pageLabel,
    user_agent: userAgent,
    description,
    steps_to_reproduce: stepsToReproduce,
    severity,
    status: "new",
    attachment_path: attachmentPath,
  });
  if (error) throw new Error(error.message);

  revalidateAll();
}

export async function setBugStatus(id: string, status: BugStatus) {
  if (!BUG_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const supabase = await createClient();

  const patch: Record<string, unknown> = { status };
  if (status === "resolved" || status === "wont_fix" || status === "duplicate") {
    patch.resolved_at = new Date().toISOString();
  } else {
    patch.resolved_at = null;
  }

  const { error } = await supabase
    .from("bug_reports")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function updateBugTriage(formData: FormData) {
  const id = (formData.get("id") as string)?.trim();
  if (!id) throw new Error("Bug id is required");

  const severityRaw = (formData.get("severity") as string) || "medium";
  const severity = (BUG_SEVERITIES as string[]).includes(severityRaw)
    ? (severityRaw as BugSeverity)
    : "medium";

  const assignedTo =
    ((formData.get("assigned_to") as string) || "").trim() || null;
  const resolutionNotes =
    ((formData.get("resolution_notes") as string) || "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("bug_reports")
    .update({
      severity,
      assigned_to: assignedTo,
      resolution_notes: resolutionNotes,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
