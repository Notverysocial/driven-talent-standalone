"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth.server";
import type { ClientStatus } from "@/lib/supabase/types";

// Client config + per-position workers-comp mapping (tasks 86e20w8qy, 86e20w8tq).
// Admin-tier: this is account configuration, mirroring team/separation gating.

function clean(formData: FormData, name: string): string | null {
  return ((formData.get(name) as string) || "").trim() || null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60) || "client";
}

const CLIENT_STATUSES: ClientStatus[] = ["active", "prospect", "inactive"];
function asClientStatus(v: string | null): ClientStatus {
  return v && (CLIENT_STATUSES as string[]).includes(v) ? (v as ClientStatus) : "active";
}

// ---------- Client section: create + edit basic company info (Phase-1 #4) -

export async function createClientRecord(formData: FormData) {
  await assertRole("admin");
  const sb = await createClient();

  const name = clean(formData, "name");
  if (!name) throw new Error("Client name is required");

  // Derive a unique slug from the name. On collision, append -2, -3, … so two
  // clients with the same name still resolve to distinct detail URLs.
  const base = slugify(name);
  let slug = base;
  for (let n = 2; ; n++) {
    const { data: existing } = await sb
      .from("clients")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${base}-${n}`;
  }

  const { error } = await sb.from("clients").insert({
    slug,
    name,
    city: clean(formData, "city"),
    industry: clean(formData, "industry"),
    address: clean(formData, "address"),
    phone: clean(formData, "phone"),
    website: clean(formData, "website"),
    status: asClientStatus(clean(formData, "status")),
    contact_name: clean(formData, "contact_name"),
    contact_email: clean(formData, "contact_email"),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/clients");
  redirect(`/clients/${slug}`);
}

export async function updateClientInfo(slug: string, formData: FormData) {
  await assertRole("admin");
  const sb = await createClient();

  const name = clean(formData, "name");
  if (!name) throw new Error("Client name is required");

  const feeRaw = (formData.get("service_fee_pct") as string)?.trim();
  const fee = feeRaw ? Number(feeRaw) : null;

  const { error } = await sb
    .from("clients")
    .update({
      name,
      city: clean(formData, "city"),
      industry: clean(formData, "industry"),
      address: clean(formData, "address"),
      phone: clean(formData, "phone"),
      website: clean(formData, "website"),
      status: asClientStatus(clean(formData, "status")),
      contact_name: clean(formData, "contact_name"),
      contact_email: clean(formData, "contact_email"),
      terms: clean(formData, "terms"),
      ...(fee != null && !Number.isNaN(fee) ? { service_fee_pct: fee } : {}),
    })
    .eq("slug", slug);
  if (error) throw new Error(error.message);

  revalidatePath(`/clients/${slug}`);
  revalidatePath("/clients");
}

// ---------- Client contacts (Phase-1 #4) ---------------------------------

export async function addClientContact(
  slug: string,
  clientId: string,
  formData: FormData,
) {
  await assertRole("admin");
  const sb = await createClient();

  const fullName = clean(formData, "full_name");
  if (!fullName) throw new Error("Contact name is required");

  const { error } = await sb.from("client_contacts").insert({
    client_id: clientId,
    full_name: fullName,
    department: clean(formData, "department"),
    position: clean(formData, "position"),
    phone: clean(formData, "phone"),
    email: clean(formData, "email"),
    role_type: clean(formData, "role_type"),
    notes: clean(formData, "notes"),
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/clients/${slug}`);
}

export async function deleteClientContact(id: string, slug: string) {
  await assertRole("admin");
  const sb = await createClient();
  const { error } = await sb.from("client_contacts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${slug}`);
}

// ---------- Client config (workers-comp default + account manager) -------

export async function updateClientConfig(slug: string, formData: FormData) {
  await assertRole("admin");
  const sb = await createClient();

  const accountManager = ((formData.get("account_manager") as string) || "").trim() || null;
  const wcCode = ((formData.get("workers_comp_code") as string) || "").trim() || null;
  const wcClass = ((formData.get("workers_comp_class") as string) || "").trim() || null;
  const wcNotes = ((formData.get("workers_comp_notes") as string) || "").trim() || null;

  const { error } = await sb
    .from("clients")
    .update({
      account_manager: accountManager,
      workers_comp_code: wcCode,
      workers_comp_class: wcClass,
      workers_comp_notes: wcNotes,
    })
    .eq("slug", slug);
  if (error) throw new Error(error.message);

  revalidatePath(`/clients/${slug}`);
  revalidatePath("/clients");
}

// ---------- Per-position workers-comp codes ------------------------------

export async function addWorkersCompCode(
  slug: string,
  clientId: string,
  formData: FormData,
) {
  await assertRole("admin");
  const sb = await createClient();

  const position = ((formData.get("position") as string) || "").trim();
  const wcCode = ((formData.get("wc_code") as string) || "").trim();
  const wcClass = ((formData.get("wc_class") as string) || "").trim() || null;
  const description = ((formData.get("description") as string) || "").trim() || null;

  if (!position) throw new Error("Position is required");
  if (!wcCode) throw new Error("Workers-comp code is required");

  // Upsert on (client_id, position) so re-adding an existing position updates
  // it rather than failing the unique constraint.
  const { error } = await sb
    .from("client_workers_comp_codes")
    .upsert(
      {
        client_id: clientId,
        position,
        wc_code: wcCode,
        wc_class: wcClass,
        description,
      },
      { onConflict: "client_id,position" },
    );
  if (error) throw new Error(error.message);

  revalidatePath(`/clients/${slug}`);
}

export async function deleteWorkersCompCode(id: string, slug: string) {
  await assertRole("admin");
  const sb = await createClient();
  const { error } = await sb
    .from("client_workers_comp_codes")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${slug}`);
}
