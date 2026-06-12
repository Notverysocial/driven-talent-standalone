"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_CRITERIA, weightedScore } from "@/lib/candidates";
import type { CandidateStatus } from "@/lib/supabase/types";

export type PromoteConversationResult =
  | { ok: true; candidateId: string }
  | { ok: false; error: string };

export type ConversationListItem = {
  id: string;
  subject: string | null;
  status: string;
  assigned_to: string | null;
  channel: string;
  created_at: string;
  updated_at: string;
  contact: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    type: string;
    candidate_id: string | null;
    client_id: string | null;
  } | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
};

export type MessageItem = {
  id: string;
  conversation_id: string;
  sender_type: string;
  sender_name: string | null;
  body: string;
  read: boolean;
  created_at: string;
};

export async function getConversations(): Promise<ConversationListItem[]> {
  const sb = await createClient();

  const { data: conversations } = await sb
    .from("conversations")
    .select(
      `
      id, subject, status, assigned_to, channel, created_at, updated_at,
      contacts!contact_id (id, full_name, email, phone, company, type, candidate_id, client_id)
    `
    )
    .order("updated_at", { ascending: false });

  if (!conversations) return [];

  const result: ConversationListItem[] = [];

  for (const c of conversations) {
    // Get latest message
    const { data: msgs } = await sb
      .from("messages")
      .select("body, created_at")
      .eq("conversation_id", c.id)
      .order("created_at", { ascending: false })
      .limit(1);

    // Get unread count
    const { count } = await sb
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", c.id)
      .eq("read", false)
      .neq("sender_type", "agent");

    const contact = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts;

    result.push({
      id: c.id,
      subject: c.subject,
      status: c.status,
      assigned_to: c.assigned_to,
      channel: c.channel,
      created_at: c.created_at,
      updated_at: c.updated_at,
      contact: contact as ConversationListItem["contact"],
      last_message: msgs?.[0]?.body ?? null,
      last_message_at: msgs?.[0]?.created_at ?? null,
      unread_count: count ?? 0,
    });
  }

  return result;
}

export async function getMessages(
  conversationId: string
): Promise<MessageItem[]> {
  const sb = await createClient();

  const { data } = await sb
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  // Mark unread visitor/bot messages as read
  await sb
    .from("messages")
    .update({ read: true })
    .eq("conversation_id", conversationId)
    .eq("read", false);

  return (data ?? []) as MessageItem[];
}

export async function sendMessage(
  conversationId: string,
  body: string
): Promise<MessageItem | null> {
  const sb = await createClient();

  const { data } = await sb
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_type: "agent",
      sender_name: "Agent",
      body,
      read: true,
    })
    .select()
    .single();

  // Bump conversation updated_at
  await sb
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return data as MessageItem | null;
}

export async function updateConversationStatus(
  id: string,
  status: "open" | "assigned" | "resolved" | "archived"
) {
  const sb = await createClient();
  await sb.from("conversations").update({ status }).eq("id", id);
}

export async function assignConversation(id: string, assignee: string) {
  const sb = await createClient();
  await sb
    .from("conversations")
    .update({ assigned_to: assignee, status: "assigned" })
    .eq("id", id);
}

export async function linkToContact(
  conversationId: string,
  contactType: "candidate" | "client",
  recordId: string
) {
  const sb = await createClient();

  // Get conversation's contact_id
  const { data: conv } = await sb
    .from("conversations")
    .select("contact_id")
    .eq("id", conversationId)
    .single();

  if (!conv) return;

  const field =
    contactType === "candidate" ? "candidate_id" : "client_id";
  await sb
    .from("contacts")
    .update({ [field]: recordId })
    .eq("id", conv.contact_id);
}

export async function createContactFromConversation(
  conversationId: string,
  data: {
    type: "candidate" | "client";
    full_name?: string;
    email?: string;
    phone?: string;
    company?: string;
  }
) {
  const sb = await createClient();

  const { data: conv } = await sb
    .from("conversations")
    .select("contact_id, contacts!contact_id (full_name, email, phone, company)")
    .eq("id", conversationId)
    .single();

  if (!conv) return null;

  const contact = Array.isArray(conv.contacts) ? conv.contacts[0] : conv.contacts;

  if (data.type === "candidate") {
    const { data: candidate } = await sb
      .from("candidates")
      .insert({
        full_name: data.full_name || (contact as any)?.full_name || "Unknown",
        email: data.email || (contact as any)?.email || null,
        phone: data.phone || (contact as any)?.phone || null,
        source: "Web Chat",
      })
      .select("id")
      .single();

    if (candidate) {
      await sb
        .from("contacts")
        .update({ candidate_id: candidate.id })
        .eq("id", conv.contact_id);
    }
    return candidate;
  }

  // Client creation
  const { data: client } = await sb
    .from("clients")
    .insert({
      slug: (data.company || "chat-lead")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+$/, ""),
      name: data.company || data.full_name || "Chat Lead",
      contact_name: data.full_name || (contact as any)?.full_name || null,
      contact_email: data.email || (contact as any)?.email || null,
    })
    .select("id")
    .single();

  if (client) {
    await sb
      .from("contacts")
      .update({ client_id: client.id })
      .eq("id", conv.contact_id);
  }
  return client;
}

/**
 * Promote a chat-widget conversation into the hiring pipeline.
 *
 * Builds a candidates row from the conversation's contact + the full
 * thread of visitor-side messages (concatenated into `notes`).  Links
 * the contact's candidate_id so the conversation surfaces on the
 * candidate detail page, and resolves the conversation thread so
 * Inbox staff stop seeing it as actionable.
 *
 * Returns a discriminated result rather than redirecting — InboxClient
 * surfaces the outcome inline (no full-page nav from the conversation
 * detail panel).
 */
export async function promoteConversationToCandidate(
  conversationId: string,
): Promise<PromoteConversationResult> {
  const sb = await createClient();

  const { data: userResp } = await sb.auth.getUser();
  const promoterEmail = userResp?.user?.email ?? null;

  // Pull conversation + contact in one shot.
  const { data: conv, error: convErr } = await sb
    .from("conversations")
    .select(
      `id, subject, channel, contact_id,
       contacts!contact_id (id, full_name, email, phone, company, candidate_id)`,
    )
    .eq("id", conversationId)
    .single();
  if (convErr) return { ok: false, error: `Couldn't load conversation: ${convErr.message}` };
  if (!conv) return { ok: false, error: "Conversation not found." };

  const contact = Array.isArray(conv.contacts) ? conv.contacts[0] : conv.contacts;
  if (!contact) {
    return { ok: false, error: "Conversation has no contact — cannot promote." };
  }
  if (contact.candidate_id) {
    // Idempotent: contact is already linked to a candidate.
    return { ok: true, candidateId: contact.candidate_id };
  }

  const fullName =
    contact.full_name?.trim() ||
    contact.email?.trim() ||
    "Chat Visitor";

  // Concatenate visitor-side message bodies into a single notes blob so
  // the candidate detail page shows what the lead said in chat.
  const { data: msgs } = await sb
    .from("messages")
    .select("sender_type, sender_name, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const visitorMessages = (msgs ?? []).filter(
    (m) => m.sender_type === "visitor",
  );

  const transcriptLines: string[] = [];
  transcriptLines.push(`[Promoted from chat-widget conversation]`);
  transcriptLines.push(`Conversation ID: ${conversationId}`);
  if (conv.subject) transcriptLines.push(`Subject: ${conv.subject}`);
  if (promoterEmail) transcriptLines.push(`Promoted by: ${promoterEmail}`);
  transcriptLines.push(`Promoted at: ${new Date().toISOString()}`);
  transcriptLines.push("");
  if (visitorMessages.length > 0) {
    transcriptLines.push("--- Visitor messages ---");
    for (const m of visitorMessages) {
      const ts = new Date(m.created_at).toISOString().replace("T", " ").slice(0, 16);
      transcriptLines.push(`[${ts}] ${m.sender_name ?? "Visitor"}: ${m.body}`);
    }
  } else {
    transcriptLines.push("(No visitor messages on record yet.)");
  }

  const { data: cand, error: candErr } = await sb
    .from("candidates")
    .insert({
      full_name:    fullName,
      email:        contact.email ?? null,
      phone:        contact.phone ?? null,
      source:       "promoted-from-chat",
      status:       "applied" satisfies CandidateStatus,
      criteria:     DEFAULT_CRITERIA,
      score:        weightedScore(DEFAULT_CRITERIA),
      notes:        transcriptLines.join("\n"),
    })
    .select("id")
    .single();
  if (candErr) return { ok: false, error: `Couldn't create candidate: ${candErr.message}` };

  // Link contact → candidate so the conversation surfaces on the
  // candidate's record (mirrors the form-intake path).
  await sb
    .from("contacts")
    .update({ candidate_id: cand.id })
    .eq("id", contact.id);

  // Mark the thread resolved + record the assignee for audit.
  await sb
    .from("conversations")
    .update({
      status: "resolved",
      assigned_to: promoterEmail ?? "agent",
    })
    .eq("id", conversationId);

  revalidatePath("/inbox");
  revalidatePath("/candidates");
  revalidatePath("/applications");

  return { ok: true, candidateId: cand.id };
}

export async function getInboxCounts() {
  const sb = await createClient();

  const { count: unreadMessages } = await sb
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("read", false)
    .neq("sender_type", "agent");

  const { count: openConversations } = await sb
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "assigned"]);

  return {
    unreadMessages: unreadMessages ?? 0,
    openConversations: openConversations ?? 0,
  };
}
