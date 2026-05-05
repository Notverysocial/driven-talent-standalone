"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { OnboardingCategory } from "@/lib/supabase/types";

export async function toggleChecklistItem(itemId: string, employeeId: string) {
  const supabase = await createClient();
  const { data: row, error: getErr } = await supabase
    .from("onboarding_checklist_items")
    .select("done")
    .eq("id", itemId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const next = !row.done;
  const { error } = await supabase
    .from("onboarding_checklist_items")
    .update({ done: next, done_on: next ? new Date().toISOString().slice(0, 10) : null })
    .eq("id", itemId);
  if (error) throw new Error(error.message);

  revalidatePath(`/onboarding/${employeeId}`);
  revalidatePath("/onboarding");
  revalidatePath(`/employees/${employeeId}`);
  await maybePromoteToActive(employeeId);
}

export async function toggleDocument(docId: string, employeeId: string) {
  const supabase = await createClient();
  const { data: row, error: getErr } = await supabase
    .from("onboarding_documents")
    .select("received")
    .eq("id", docId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const next = !row.received;
  const { error } = await supabase
    .from("onboarding_documents")
    .update({ received: next, received_on: next ? new Date().toISOString().slice(0, 10) : null })
    .eq("id", docId);
  if (error) throw new Error(error.message);

  revalidatePath(`/onboarding/${employeeId}`);
  revalidatePath("/onboarding");
  revalidatePath(`/employees/${employeeId}`);
  await maybePromoteToActive(employeeId);
}

export async function addChecklistItem(employeeId: string, formData: FormData) {
  const supabase = await createClient();
  const key = (formData.get("key") as string)?.trim() || `custom-${Date.now()}`;
  const label = (formData.get("label") as string)?.trim();
  const detail = (formData.get("detail") as string)?.trim() || null;
  const category = (formData.get("category") as OnboardingCategory) || "Documentation";
  if (!label) return;

  const { error } = await supabase.from("onboarding_checklist_items").insert({
    employee_id: employeeId,
    key,
    label,
    detail,
    category,
    done: false,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/onboarding/${employeeId}`);
  revalidatePath("/onboarding");
}

export async function addDocument(employeeId: string, formData: FormData) {
  const supabase = await createClient();
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;

  const { error } = await supabase.from("onboarding_documents").insert({
    employee_id: employeeId,
    name,
    received: false,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/onboarding/${employeeId}`);
}

// When all checklist items + documents are done, automatically promote to active.
async function maybePromoteToActive(employeeId: string) {
  const supabase = await createClient();
  const [emp, checks, docs] = await Promise.all([
    supabase.from("employees").select("status").eq("id", employeeId).single(),
    supabase.from("onboarding_checklist_items").select("done").eq("employee_id", employeeId),
    supabase.from("onboarding_documents").select("received").eq("employee_id", employeeId),
  ]);
  if (emp.error) return;
  if (emp.data.status !== "onboarding") return;

  const checksLen = checks.data?.length ?? 0;
  const docsLen = docs.data?.length ?? 0;
  const allChecksDone = (checks.data ?? []).every((c) => c.done);
  const allDocsReceived = (docs.data ?? []).every((d) => d.received);
  // Both lists must be non-empty AND fully done. [].every(...) is vacuously true,
  // which would otherwise let an employee promote with zero documents on file.
  if (allChecksDone && allDocsReceived && checksLen > 0 && docsLen > 0) {
    await supabase.from("employees").update({ status: "active" }).eq("id", employeeId);
    revalidatePath("/roster");
    revalidatePath("/dashboard");
    revalidatePath(`/employees/${employeeId}`);
  }
}
