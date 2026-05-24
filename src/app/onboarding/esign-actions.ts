"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveProvider, getProvider } from "@/lib/esign/provider";
import type { EsignProvider as ProviderKey } from "@/lib/team";

// Map document_kind -> onboarding checklist key to flip Done when signed.
const CHECKLIST_KEY_BY_KIND: Record<string, string | undefined> = {
  welcome_letter: "welcome_pandadocs",        // legacy key, kept stable
  agreement_expectations: "agreement",
};

export async function sendEsignatureRequest(
  employeeId: string,
  formData: FormData,
) {
  const sb = await createClient();

  const documentKind = ((formData.get("document_kind") as string) || "").trim();
  const documentTitleRaw = ((formData.get("document_title") as string) || "").trim();
  const recipientEmail = ((formData.get("recipient_email") as string) || "").trim();
  const recipientName = ((formData.get("recipient_name") as string) || "").trim();
  const templateId = ((formData.get("template_id") as string) || "").trim() || undefined;
  const templateBody = ((formData.get("template_body") as string) || "").trim() || undefined;

  if (!documentKind) throw new Error("Document kind is required");
  if (!recipientEmail) throw new Error("Recipient email is required");
  if (!recipientName) throw new Error("Recipient name is required");
  const documentTitle = documentTitleRaw || labelForKind(documentKind);

  const provider = getActiveProvider();
  const created = await provider.createRequest({
    documentKind,
    documentTitle,
    recipientName,
    recipientEmail,
    templateId,
    templateBody,
    metadata: { employee_id: employeeId },
  });

  const { error } = await sb.from("esignature_requests").insert({
    employee_id: employeeId,
    document_kind: documentKind,
    document_title: documentTitle,
    provider: provider.key,
    provider_request_id: created.providerRequestId,
    signing_url: created.signingUrl,
    status: "sent",
    recipient_email: recipientEmail,
    recipient_name: recipientName,
    sent_at: new Date().toISOString(),
    checklist_item_key: CHECKLIST_KEY_BY_KIND[documentKind] ?? null,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/onboarding/${employeeId}`);
}

export async function markEsignatureSigned(
  requestId: string,
  employeeId: string,
) {
  const sb = await createClient();

  const { data: row, error: getErr } = await sb
    .from("esignature_requests")
    .select("checklist_item_key, status")
    .eq("id", requestId)
    .single();
  if (getErr) throw new Error(getErr.message);
  if (row.status === "signed") return;

  const now = new Date().toISOString();
  const { error } = await sb
    .from("esignature_requests")
    .update({ status: "signed", signed_at: now })
    .eq("id", requestId);
  if (error) throw new Error(error.message);

  // Optionally flip the linked onboarding checklist item to Done.
  const checklistKey = (row as { checklist_item_key: string | null }).checklist_item_key;
  if (checklistKey) {
    await sb
      .from("onboarding_checklist_items")
      .update({ status: "done", done_on: now.slice(0, 10) })
      .eq("employee_id", employeeId)
      .eq("key", checklistKey);
  }

  revalidatePath(`/onboarding/${employeeId}`);
  revalidatePath("/onboarding");
  revalidatePath(`/employees/${employeeId}`);
}

export async function cancelEsignatureRequest(
  requestId: string,
  employeeId: string,
) {
  const sb = await createClient();
  const { error } = await sb
    .from("esignature_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId);
  if (error) throw new Error(error.message);
  revalidatePath(`/onboarding/${employeeId}`);
}

function labelForKind(kind: string): string {
  if (kind === "welcome_letter") return "Welcome Letter";
  if (kind === "agreement_expectations") return "Agreement & Expectations";
  return kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Exposed so the UI can show "Documenso · configured" / fallback hints.
export async function getActiveEsignProviderInfo(): Promise<{
  key: ProviderKey;
  label: string;
  status: "configured" | "missing_credentials" | "stub";
}> {
  const active = getActiveProvider();
  return { key: active.key, label: active.label, status: active.status() };
}

export async function getProviderInfoByKey(key: ProviderKey): Promise<{
  key: ProviderKey;
  label: string;
  status: "configured" | "missing_credentials" | "stub";
}> {
  const p = getProvider(key);
  return { key: p.key, label: p.label, status: p.status() };
}
