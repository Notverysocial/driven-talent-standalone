"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";

// Sign in with email + password. Validation is intentionally minimal —
// Supabase Auth surfaces the right errors (invalid credentials, rate
// limit, etc.) and we forward them back to the form.

export type LoginState = { error?: string };

function safeNext(input: FormDataEntryValue | null): string {
  if (typeof input !== "string") return "/dashboard";
  // Only allow same-origin paths to prevent open-redirect via ?next=.
  if (!input.startsWith("/") || input.startsWith("//")) return "/dashboard";
  if (input === "/login") return "/dashboard";
  return input;
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) {
    const t = await getServerT();
    return { error: t("login.bothRequired") };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: error.message };
  }

  redirect(next);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
