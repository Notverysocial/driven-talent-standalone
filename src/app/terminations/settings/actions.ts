"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth.server";
import { isTerminationFieldType, type TerminationFieldType } from "@/lib/terminations";
import {
  addField,
  addSection,
  deleteField,
  deleteSection,
  moveField,
  moveSection,
  renameSection,
  setFieldActive,
  setSectionActive,
  updateField,
} from "@/lib/terminations.server";

// Every mutation here re-defines the tracker's shape, so all are admin-gated.
// Definitions are DATA: the team edits them from this UI, no deploy.

function parseOptions(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseFieldType(raw: FormDataEntryValue | null): TerminationFieldType {
  const v = String(raw ?? "text");
  return isTerminationFieldType(v) ? v : "text";
}

function revalidate() {
  revalidatePath("/terminations/settings");
  revalidatePath("/terminations");
}

// -------- Sections --------
export async function addSectionAction(formData: FormData) {
  await assertRole("admin");
  await addSection(String(formData.get("title") ?? ""));
  revalidate();
}
export async function renameSectionAction(formData: FormData) {
  await assertRole("admin");
  await renameSection(
    String(formData.get("id") ?? ""),
    String(formData.get("title") ?? ""),
  );
  revalidate();
}
export async function moveSectionAction(formData: FormData) {
  await assertRole("admin");
  await moveSection(
    String(formData.get("id") ?? ""),
    String(formData.get("dir") ?? "up") === "down" ? "down" : "up",
  );
  revalidate();
}
export async function toggleSectionAction(formData: FormData) {
  await assertRole("admin");
  await setSectionActive(
    String(formData.get("id") ?? ""),
    String(formData.get("active") ?? "true") === "true",
  );
  revalidate();
}
export async function deleteSectionAction(formData: FormData) {
  await assertRole("admin");
  await deleteSection(String(formData.get("id") ?? ""));
  revalidate();
}

// -------- Fields --------
export async function addFieldAction(formData: FormData) {
  await assertRole("admin");
  await addField(String(formData.get("section_id") ?? ""), {
    label: String(formData.get("label") ?? ""),
    field_type: parseFieldType(formData.get("field_type")),
    options: parseOptions(formData.get("options")),
    required: formData.get("required") === "on",
  });
  revalidate();
}
export async function updateFieldAction(formData: FormData) {
  await assertRole("admin");
  await updateField(String(formData.get("id") ?? ""), {
    label: String(formData.get("label") ?? ""),
    field_type: parseFieldType(formData.get("field_type")),
    options: parseOptions(formData.get("options")),
    required: formData.get("required") === "on",
  });
  revalidate();
}
export async function moveFieldAction(formData: FormData) {
  await assertRole("admin");
  await moveField(
    String(formData.get("id") ?? ""),
    String(formData.get("dir") ?? "up") === "down" ? "down" : "up",
  );
  revalidate();
}
export async function toggleFieldAction(formData: FormData) {
  await assertRole("admin");
  await setFieldActive(
    String(formData.get("id") ?? ""),
    String(formData.get("active") ?? "true") === "true",
  );
  revalidate();
}
export async function deleteFieldAction(formData: FormData) {
  await assertRole("admin");
  await deleteField(String(formData.get("id") ?? ""));
  revalidate();
}
