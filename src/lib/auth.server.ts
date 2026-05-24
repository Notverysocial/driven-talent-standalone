import "server-only";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { AppRole, Profile } from "@/lib/supabase/types";

// Wave 3.1 RBAC helpers. Use these at the top of every server page and
// inside every mutating server action. The proxy already redirects
// unauthenticated requests to /login as an optimistic check, but the
// proxy runs on the edge against a cookie — these helpers are the
// authoritative server-side check that also resolves the user's role.
//
// AUTH_ENABLED feature flag (default OFF): when unset or anything other
// than "true", the entire auth/RBAC layer is dormant. Every helper
// returns a synthetic Owner user, no route redirects to /login, and
// every server action runs without a session — the v1 "open" UX. Flip
// `AUTH_ENABLED=true` in the deployment env to activate the full Wave
// 3.1 Supabase Auth + Owner/Admin/User enforcement.

export const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";

export type CurrentUser = {
  id: string;
  email: string | null;
  profile: Profile;
};

const ROLE_RANK: Record<AppRole, number> = { user: 0, admin: 1, owner: 2 };

export function roleAtLeast(role: AppRole, minimum: AppRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

// Stable synthetic Owner used when AUTH_ENABLED is off. The id is the
// nil UUID — no real auth.users row exists for it, so callers must not
// use it as a foreign key. None of the current call sites do; they only
// gate on `role`.
const SYNTHETIC_OWNER: CurrentUser = {
  id: "00000000-0000-0000-0000-000000000000",
  email: null,
  profile: {
    id: "00000000-0000-0000-0000-000000000000",
    email: null,
    full_name: "Driven Talent",
    role: "owner",
    team_member_id: null,
    created_at: "1970-01-01T00:00:00.000Z",
    updated_at: "1970-01-01T00:00:00.000Z",
  },
};

// Returns the current user + their profile, or null when not signed in.
// Does NOT redirect — call `requireUser` / `requireRole` when a route
// must be gated.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!AUTH_ENABLED) return SYNTHETIC_OWNER;

  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return null;
  const user = userData.user;

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile) {
    // Profile row missing despite a valid auth user — likely a race
    // with the post-signup trigger. Back-fill via the service-role
    // client so the user can proceed instead of dead-ending on /login.
    const admin = createServiceClient();
    const fallback = {
      id: user.id,
      email: user.email ?? null,
      full_name:
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        (user.email ? user.email.split("@")[0] : null),
      role: "user" as AppRole,
    };
    const { data: inserted } = await admin
      .from("profiles")
      .upsert(fallback, { onConflict: "id" })
      .select("*")
      .maybeSingle();
    if (!inserted) return null;
    return { id: user.id, email: user.email ?? null, profile: inserted as Profile };
  }

  return { id: user.id, email: user.email ?? null, profile: profile as Profile };
}

// Hard-redirects to /login when not signed in. Use as the first line in
// any server page that should be authenticated.
export async function requireUser(): Promise<CurrentUser> {
  if (!AUTH_ENABLED) return SYNTHETIC_OWNER;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  return me;
}

// Hard-redirects to /login when not signed in, or to /dashboard with a
// `forbidden` flag when signed in but under-privileged. Use for routes
// that need admin/owner.
export async function requireRole(minimum: AppRole): Promise<CurrentUser> {
  if (!AUTH_ENABLED) return SYNTHETIC_OWNER;
  const me = await requireUser();
  if (!roleAtLeast(me.profile.role, minimum)) {
    redirect("/dashboard?forbidden=1");
  }
  return me;
}

// Throws on under-privileged callers — for use inside server actions
// where redirect() is not the right UX. The thrown error bubbles up
// through the form's <button formAction> and surfaces as a runtime
// error in the action's caller.
export async function assertRole(minimum: AppRole): Promise<CurrentUser> {
  if (!AUTH_ENABLED) return SYNTHETIC_OWNER;
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  if (!roleAtLeast(me.profile.role, minimum)) {
    throw new Error(`Forbidden: requires ${minimum} role or higher`);
  }
  return me;
}
