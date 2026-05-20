import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { getConversations } from "./actions";
import { InboxClient } from "./InboxClient";

export default async function InboxPage() {
  const conversations = await getConversations();

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / INBOX"
        scriptWord=""
        title="Inbox"
        actions={null}
      />
      <InboxClient initialConversations={conversations} />
    </Shell>
  );
}
