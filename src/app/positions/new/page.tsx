import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";
import { createPosition } from "../actions";
import { PositionForm } from "../PositionForm";
import { requireUser } from "@/lib/auth.server";

export default async function NewPositionPage() {
  // Server-side auth gate. The proxy redirects unauthenticated requests at
  // the edge from a cookie; this is the authoritative check. requireUser
  // rather than requireRole("admin") on purpose — recruiters, not just
  // admins, manage requisitions, and gating at admin would lock the people
  // this screen exists for out of it.
  await requireUser();
  const sb = await createClient();
  const { data: clients } = await sb.from("clients").select("id, name").order("name");

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / RECRUITING / POSITIONS / NEW"
        scriptWord="New "
        title="Position"
        actions={
          <Link href="/positions" className="dt-btn">
            ← Cancel
          </Link>
        }
      />

      <form action={createPosition} className="dt-card" style={{ padding: "28px 32px", maxWidth: 820 }}>
        <PositionForm clients={clients ?? []} />

        <div style={{ marginTop: 24, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Link href="/positions" className="dt-btn">
            Cancel
          </Link>
          <button type="submit" className="dt-btn dt-btn-gold">
            <span>Create Position</span>
          </button>
        </div>
      </form>
    </Shell>
  );
}
