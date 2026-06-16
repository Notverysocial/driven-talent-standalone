import "server-only";
import { createClient } from "./supabase/server";
import type { CompanySettings } from "./supabase/types";

// Defaults mirror the seed in migration 0028 and the values that were
// previously hardcoded in the invoice PDF route + detail page. Used as a
// fallback if the company_settings row (or table) isn't present yet, so the
// invoice surfaces never break.
export const COMPANY_DEFAULTS: CompanySettings = {
  id: true,
  company_name: "Driven Talent",
  tagline: "Workforce · Solutions",
  address: "2200 Mendocino Ave, Suite 4 · Santa Rosa, CA 95403",
  email: "hello@driventalent.co",
  phone: "(707) 555-0144",
  ein: "EIN 88-1284621",
  invoice_footer:
    "Payment may be remitted via ACH to Mechanics Bank · Routing 121102036 · Account on file. Questions? Reply to this email and we will personally make it right.",
  accent_color: "#B58622",
  invoice_number_prefix: "DT",
  default_terms: "Net 30",
  default_fee_pct: 8.0,
  created_at: "",
  updated_at: "",
};

export async function getCompanySettings(): Promise<CompanySettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  // Table missing or empty (pre-migration) → fall back to defaults rather
  // than throwing, so invoice rendering is never blocked.
  if (error || !data) return COMPANY_DEFAULTS;
  return data as unknown as CompanySettings;
}

// Composes the email · phone · EIN contact line, skipping blanks.
export function contactLine(s: CompanySettings): string {
  return [s.email, s.phone, s.ein].filter(Boolean).join(" · ");
}
