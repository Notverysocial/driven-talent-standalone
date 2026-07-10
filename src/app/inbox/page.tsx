import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";
import { getConversations } from "./actions";
import { InboxClient } from "./InboxClient";
import { syncInboundEmployerLeadsToInbox } from "@/lib/inbound-leads.server";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function InboxPage() {
  // Surface inbound employer leads (from the public site's staffing-request
  // form) as Inbox conversations before we read the thread list. Idempotent
  // and fail-safe, so it only ever adds genuinely new leads.
  await syncInboundEmployerLeadsToInbox();

  const conversations = await getConversations();

  // Surface a quick chip when there are new website applications to triage.
  // application_intakes is owned by the Recruiting module — soft query.
  const sb = await createClient();
  const { count: newApps } = await sb
    .from("application_intakes")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  const tb = (await getServerDictionary()).topbar.inbox;

  return (
    <Shell>
      <Topbar
        crumb={tb.crumb}
        scriptWord={tb.scriptWord}
        title={tb.title}
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
