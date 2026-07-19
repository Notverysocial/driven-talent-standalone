"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth.server";
import { parseMarkupInput } from "@/lib/markup";
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

// ---------- Per-employee markup rates (Rocio, 2026-06-17) -----------------

// Set the markup percentage for one assignment. Rocio asked to "set the markup
// once per employee" instead of applying it by hand every invoice run; this is
// the write side of that. A blank value CLEARS the override so the assignment
// falls back to the client rate — which is why we write an explicit null
// rather than skipping the field.
//
// Writes only employee_assignments.markup_percent. It cannot touch an invoice:
// markup is read at generation time, and generation only ever rewrites DRAFT
// invoices (see upsertInvoicesForPeriod — sent/paid invoices are never
// mutated). Changing a rate here therefore affects the next draft, never a
// total that has already gone out.
export async function setAssignmentMarkup(
  assignmentId: string,
  slug: string,
  formData: FormData,
) {
  await assertRole("admin");
  const pct = parseMarkupInput(formData.get("markup_percent") as string | null);

  const sb = await createClient();
  const { error } = await sb
    .from("employee_assignments")
    .update({ markup_percent: pct })
    .eq("id", assignmentId);
  if (error) throw new Error(error.message);

  revalidatePath(`/clients/${slug}`);
  revalidatePath("/payroll");
}

// Apply one markup to every active assignment at a client that does not have
// its own rate yet. This is the "I have 40 employees on this account and they
// are nearly all at 45%" path — it fills the blanks and deliberately leaves
// per-employee overrides alone.
export async function backfillClientMarkup(slug: string, formData: FormData) {
  await assertRole("admin");
  const pct = parseMarkupInput(formData.get("markup_percent") as string | null);
  if (pct === null) {
    throw new Error("Enter a markup percentage to apply.");
  }

  const sb = await createClient();
  const { data: client, error: cErr } = await sb
    .from("clients")
    .select("id")
    .eq("slug", slug)
    .single();
  if (cErr) throw new Error(cErr.message);

  const { error } = await sb
    .from("employee_assignments")
    .update({ markup_percent: pct })
    .eq("client_id", client.id)
    .eq("active", true)
    .is("markup_percent", null);
  if (error) throw new Error(error.message);

  revalidatePath(`/clients/${slug}`);
  revalidatePath("/payroll");
}
