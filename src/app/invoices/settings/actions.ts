"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Update the singleton company_settings row (CR #8). Upsert on the fixed
// id=true key so it works whether or not the seed row is present.
export async function updateCompanySettings(formData: FormData) {
  const supabase = await createClient();

  const str = (k: string) => ((formData.get(k) as string) || "").trim();
  const companyName = str("company_name");
  if (!companyName) throw new Error("Company name is required");

  const accent = str("accent_color") || null;
  if (accent && !/^#[0-9A-Fa-f]{6}$/.test(accent)) {
    throw new Error("Accent color must be a #RRGGBB hex value");
  }

  const feePct = Number(formData.get("default_fee_pct"));
  if (!Number.isFinite(feePct) || feePct < 0) {
    throw new Error("Default fee % must be a non-negative number");
  }

  const { error } = await supabase.from("company_settings").upsert(
    {
      id: true,
      company_name: companyName,
      tagline: str("tagline") || null,
      address: str("address") || null,
      email: str("email") || null,
      phone: str("phone") || null,
      ein: str("ein") || null,
      invoice_footer: str("invoice_footer") || null,
      accent_color: accent,
      invoice_number_prefix: str("invoice_number_prefix") || null,
      default_terms: str("default_terms") || null,
      default_fee_pct: feePct,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);

  revalidatePath("/invoices/settings");
  revalidatePath("/invoices");
}
