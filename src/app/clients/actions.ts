"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth.server";

// Client config + per-position workers-comp mapping (tasks 86e20w8qy, 86e20w8tq).
// Admin-tier: this is account configuration, mirroring team/separation gating.

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
