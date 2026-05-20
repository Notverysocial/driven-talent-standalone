"use server";

import { createClient } from "@/lib/supabase/server";

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
