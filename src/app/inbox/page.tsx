import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";
import { getConversations } from "./actions";
import { InboxClient } from "./InboxClient";

export default async function InboxPage() {
  const conversations = await getConversations();

  // Surface a quick chip when there are new website applications to triage.
  // application_intakes is owned by the Recruiting module — soft query.
  const sb = await createClient();
  const { count: newApps } = await sb
    .from("application_intakes")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / INBOX"
        scriptWord=""
        title="Inbox"
        actions={
          <Link
            href="/applications"
            className={"dt-btn" + (newApps ? " dt-btn-gold" : "")}
          >
            <span>
              Applications
              {newApps ? ` · ${newApps} new` : ""}
            </span>
          </Link>
        }
      />
      <InboxClient initialConversations={conversations} />
    </Shell>
  );
}
