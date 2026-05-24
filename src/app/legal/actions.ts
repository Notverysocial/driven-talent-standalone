"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth.server";
import type {
  LegalDocumentCategory,
  LegalDocumentStatus,
} from "@/lib/supabase/types";

const CATEGORIES: LegalDocumentCategory[] = [
  "handbook",
  "policy",
  "agreement",
  "nda",
  "insurance",
  "tax",
  "license",
  "poster",
  "incorporation",
  "compliance",
  "notice",
  "other",
];

const STATUSES: LegalDocumentStatus[] = [
  "active",
  "expiring_soon",
  "expired",
  "superseded",
  "archived",
];

export async function createLegalDocument(formData: FormData) {
  await assertRole("admin");
  const supabase = await createClient();

  const title = (formData.get("title") as string)?.trim();
  const category = (formData.get("category") as LegalDocumentCategory) || "other";
  const description = ((formData.get("description") as string) || "").trim() || null;
  const externalUrl = ((formData.get("external_url") as string) || "").trim() || null;
  const filePath = ((formData.get("file_path") as string) || "").trim() || null;
  const documentNumber =
    ((formData.get("document_number") as string) || "").trim() || null;
  const issuer = ((formData.get("issuer") as string) || "").trim() || null;
  const jurisdiction = ((formData.get("jurisdiction") as string) || "").trim() || null;
  const effectiveDate =
    ((formData.get("effective_date") as string) || "").trim() || null;
  const expiryDate = ((formData.get("expiry_date") as string) || "").trim() || null;
  const reminderRaw = (formData.get("reminder_days_before") as string) || "";
  const reminderDays = reminderRaw ? Math.max(0, Number(reminderRaw)) : 30;
  const clientId = ((formData.get("client_id") as string) || "").trim() || null;
  const employeeId = ((formData.get("employee_id") as string) || "").trim() || null;
  const tagsRaw = ((formData.get("tags") as string) || "").trim();
  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  const uploadedBy = ((formData.get("uploaded_by") as string) || "").trim() || null;

  if (!title) throw new Error("Title is required");
  if (!CATEGORIES.includes(category)) throw new Error(`Invalid category: ${category}`);

  const { error } = await supabase.from("legal_documents").insert({
    title,
    category,
    status: "active",
    description,
    external_url: externalUrl,
    file_path: filePath,
    document_number: documentNumber,
    issuer,
    jurisdiction,
    effective_date: effectiveDate,
    expiry_date: expiryDate,
    reminder_days_before: reminderDays,
    client_id: clientId,
    employee_id: employeeId,
    tags,
    uploaded_by: uploadedBy,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/legal");
}

export async function setLegalDocumentStatus(id: string, status: LegalDocumentStatus) {
  await assertRole("admin");
  if (!STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`);
  const supabase = await createClient();
  const { error } = await supabase
    .from("legal_documents")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/legal");
}

export async function deleteLegalDocument(id: string) {
  await assertRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("legal_documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/legal");
}
