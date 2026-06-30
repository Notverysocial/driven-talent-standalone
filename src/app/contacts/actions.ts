"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ContactRole, ContactType } from "@/lib/supabase/types";

const TYPES: ContactType[] = ["employer", "job_seeker", "other"];
const ROLES: ContactRole[] = [
  "client_primary",
  "client_billing",
  "client_ops",
  "vendor",
  "partner",
  "candidate_lead",
  "employee",
  "legal",
  "accountant",
  "insurance",
  "government",
  "other",
];

function str(formData: FormData, name: string): string | null {
  const v = ((formData.get(name) as string) || "").trim();
  return v || null;
}

export async function createContact(formData: FormData) {
  const supabase = await createClient();

  const fullName = str(formData, "full_name");
  if (!fullName) throw new Error("Name is required");

  const type = (formData.get("type") as ContactType) || "other";
  if (!TYPES.includes(type)) throw new Error(`Invalid type: ${type}`);

  const roleRaw = (formData.get("role") as string) || "";
  const role = (ROLES as string[]).includes(roleRaw)
    ? (roleRaw as ContactRole)
    : null;

  const tagsRaw = ((formData.get("tags") as string) || "").trim();
  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const { error } = await supabase.from("contacts").insert({
    full_name: fullName,
    type,
    role,
    title: str(formData, "title"),
    company: str(formData, "company"),
    email: str(formData, "email"),
    secondary_email: str(formData, "secondary_email"),
    phone: str(formData, "phone"),
    mobile_phone: str(formData, "mobile_phone"),
    work_phone: str(formData, "work_phone"),
    website: str(formData, "website"),
    linkedin_url: str(formData, "linkedin_url"),
    address_line1: str(formData, "address_line1"),
    address_line2: str(formData, "address_line2"),
    city: str(formData, "city"),
    state: str(formData, "state"),
    postal_code: str(formData, "postal_code"),
    country: str(formData, "country"),
    birthday: str(formData, "birthday"),
    client_id: str(formData, "client_id"),
    employee_id: str(formData, "employee_id"),
    source: str(formData, "source"),
    owner: str(formData, "owner"),
    notes: str(formData, "notes"),
    tags,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/contacts");
}

export async function updateContact(id: string, formData: FormData) {
  const supabase = await createClient();

  const fullName = str(formData, "full_name");
  if (!fullName) throw new Error("Name is required");

  const type = (formData.get("type") as ContactType) || "other";
  if (!TYPES.includes(type)) throw new Error(`Invalid type: ${type}`);

  const roleRaw = (formData.get("role") as string) || "";
  const role = (ROLES as string[]).includes(roleRaw)
    ? (roleRaw as ContactRole)
    : null;

  const tagsRaw = ((formData.get("tags") as string) || "").trim();
  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const { error } = await supabase
    .from("contacts")
    .update({
      full_name: fullName,
      type,
      role,
      title: str(formData, "title"),
      company: str(formData, "company"),
      email: str(formData, "email"),
      secondary_email: str(formData, "secondary_email"),
      phone: str(formData, "phone"),
      mobile_phone: str(formData, "mobile_phone"),
      work_phone: str(formData, "work_phone"),
      website: str(formData, "website"),
      linkedin_url: str(formData, "linkedin_url"),
      address_line1: str(formData, "address_line1"),
      address_line2: str(formData, "address_line2"),
      city: str(formData, "city"),
      state: str(formData, "state"),
      postal_code: str(formData, "postal_code"),
      country: str(formData, "country"),
      birthday: str(formData, "birthday"),
      client_id: str(formData, "client_id"),
      employee_id: str(formData, "employee_id"),
      source: str(formData, "source"),
      owner: str(formData, "owner"),
      notes: str(formData, "notes"),
      tags,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/contacts");
}

export async function toggleContactFavorite(id: string, favorite: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ favorite })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/contacts");
}

export async function markContacted(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/contacts");
}

export async function deleteContact(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/contacts");
}
