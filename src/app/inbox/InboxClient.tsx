"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ConversationListItem, MessageItem } from "./actions";
import {
  getMessages,
  sendMessage,
  updateConversationStatus,
  assignConversation,
  createContactFromConversation,
  getConversations,
  promoteConversationToCandidate,
} from "./actions";

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  open:     { bg: "var(--dt-gold, #F5C518)", text: "#111", label: "Open" },
  assigned: { bg: "#3b82f6", text: "#fff", label: "Assigned" },
  resolved: { bg: "#22c55e", text: "#fff", label: "Resolved" },
  archived: { bg: "var(--dt-warm-300, #999)", text: "#fff", label: "Archived" },
};

type FilterTab = "all" | "open" | "mine" | "resolved";

export function InboxClient({
  initialConversations,
}: {
  initialConversations: ConversationListItem[];
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [showDetail, setShowDetail] = useState(false);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  const supabase = createClient();

  // Subscribe to new messages via Realtime
  useEffect(() => {
    const channel = supabase
      .channel("inbox-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as MessageItem;
          // Update messages if viewing this conversation
          setMessages((prev) => {
            if (prev.length > 0 && prev[0]?.conversation_id === msg.conversation_id) {
              // Don't add duplicates
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            }
            return prev;
          });
          // Refresh conversation list
          startTransition(async () => {
            const updated = await getConversations();
            setConversations(updated);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function selectConversation(id: string) {
    setSelected(id);
    setPromoteFeedback(null);
    const msgs = await getMessages(id);
    setMessages(msgs);
    // Refresh to update unread counts
    startTransition(async () => {
      const updated = await getConversations();
      setConversations(updated);
    });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !selected) return;
    const body = draft.trim();
    setDraft("");
    const msg = await sendMessage(selected, body);
    if (msg) {
      setMessages((prev) => [...prev, msg]);
    }
  }

  async function handleStatusChange(status: "open" | "assigned" | "resolved" | "archived") {
    if (!selected) return;
    await updateConversationStatus(selected, status);
    startTransition(async () => {
      const updated = await getConversations();
      setConversations(updated);
    });
  }

  async function handleAssign() {
    if (!selected) return;
    const name = prompt("Assign to (name):");
    if (!name) return;
    await assignConversation(selected, name);
    startTransition(async () => {
      const updated = await getConversations();
      setConversations(updated);
    });
  }

  const [promoteFeedback, setPromoteFeedback] = useState<
    | { kind: "ok"; message: string; candidateId: string }
    | { kind: "err"; message: string }
    | null
  >(null);

  async function handlePromoteToCandidate() {
    if (!selected) return;
    setPromoteFeedback(null);
    const result = await promoteConversationToCandidate(selected);
    if (result.ok) {
      setPromoteFeedback({
        kind: "ok",
        message: "Promoted to pipeline.",
        candidateId: result.candidateId,
      });
      startTransition(async () => {
        const updated = await getConversations();
        setConversations(updated);
      });
    } else {
      setPromoteFeedback({ kind: "err", message: result.error });
    }
  }

  async function handleCreateCandidate() {
    if (!selected) return;
    await createContactFromConversation(selected, { type: "candidate" });
    startTransition(async () => {
      const updated = await getConversations();
      setConversations(updated);
    });
  }

  async function handleCreateClient() {
    if (!selected) return;
    await createContactFromConversation(selected, { type: "client" });
    startTransition(async () => {
      const updated = await getConversations();
      setConversations(updated);
    });
  }

  // Filter conversations
  const filtered = conversations.filter((c) => {
    if (filter === "open") return c.status === "open";
    if (filter === "mine") return c.status === "assigned";
    if (filter === "resolved") return c.status === "resolved";
    return true;
  }).filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.contact?.full_name?.toLowerCase().includes(q) ||
      c.contact?.company?.toLowerCase().includes(q) ||
      c.last_message?.toLowerCase().includes(q) ||
      c.subject?.toLowerCase().includes(q)
    );
  });

  const activeConv = conversations.find((c) => c.id === selected);
  const statusInfo = activeConv ? STATUS_COLORS[activeConv.status] || STATUS_COLORS.open : null;

  function timeAgo(ts: string | null) {
    if (!ts) return "";
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  }

  return (
    <div
      className="dt-inbox-grid"
      data-selected={selected ? "true" : "false"}
      style={{
        gridTemplateColumns: showDetail && selected ? "320px 1fr 300px" : selected ? "320px 1fr" : "1fr",
      }}
    >
      {/* Left panel: Conversation list */}
      <div
        data-pane="list"
        style={{
          borderRight: "1px solid var(--dt-warm-100, #e5e5e5)",
          display: "flex",
          flexDirection: "column",
          minWidth: selected ? 320 : undefined,
        }}
      >
        {/* Filter tabs */}
        <div style={{ padding: "12px 16px 0", display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(
            [
              ["all", "All"],
              ["open", "Open"],
              ["mine", "Assigned"],
              ["resolved", "Resolved"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: "none",
                fontSize: 11.5,
                fontWeight: filter === key ? 600 : 400,
                background: filter === key ? "var(--dt-gold, #F5C518)" : "var(--dt-warm-50, #f5f5f5)",
                color: filter === key ? "#111" : "var(--dt-warm-600, #666)",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ padding: "8px 16px" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            style={{
              width: "100%",
              padding: "6px 10px",
              border: "1px solid var(--dt-warm-100, #e5e5e5)",
              borderRadius: 6,
              fontSize: 12.5,
              outline: "none",
              background: "var(--dt-warm-50, #fafafa)",
            }}
          />
        </div>

        {/* Conversation list */}
        <div data-testid="inbox-conversation-list" style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 && (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--dt-warm-500, #999)", fontSize: 13 }}>
              No conversations found.
            </div>
          )}
          {filtered.map((c) => {
            const isActive = c.id === selected;
            const status = STATUS_COLORS[c.status] || STATUS_COLORS.open;
            return (
              <button
                key={c.id}
                data-testid="inbox-conversation"
                data-conversation-id={c.id}
                onClick={() => selectConversation(c.id)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "12px 16px",
                  border: "none",
                  borderBottom: "1px solid var(--dt-warm-100, #e5e5e5)",
                  background: isActive ? "var(--dt-warm-50, #f5f5f5)" : "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: "var(--dt-black, #111)" }}>
                    {c.contact?.full_name || c.contact?.company || "Unknown Visitor"}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {c.unread_count > 0 && (
                      <span
                        style={{
                          background: "var(--dt-gold, #F5C518)",
                          color: "#111",
                          fontSize: 10,
                          fontWeight: 700,
                          borderRadius: 10,
                          padding: "1px 6px",
                          minWidth: 18,
                          textAlign: "center",
                        }}
                      >
                        {c.unread_count}
                      </span>
                    )}
                    <span style={{ fontSize: 10.5, color: "var(--dt-warm-400, #bbb)" }}>
                      {timeAgo(c.last_message_at || c.updated_at)}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "1px 6px",
                      borderRadius: 4,
                      fontSize: 9.5,
                      fontWeight: 600,
                      background: status.bg,
                      color: status.text,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {status.label}
                  </span>
                  <span style={{ fontSize: 10.5, color: "var(--dt-warm-400, #bbb)", textTransform: "capitalize" }}>
                    {c.contact?.type?.replace("_", " ")}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--dt-warm-500, #999)",
                    marginTop: 4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.last_message || "No messages yet"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Middle panel: Message thread */}
      {selected ? (
        <div
          data-pane="thread"
          data-testid="inbox-thread-pane"
          style={{ display: "flex", flexDirection: "column", minWidth: 0 }}
        >
          {/* Thread header */}
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid var(--dt-warm-100, #e5e5e5)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <button
                type="button"
                className="dt-inbox-back"
                onClick={() => setSelected(null)}
                aria-label="Back to inbox list"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeConv?.contact?.full_name || activeConv?.contact?.company || "Unknown"}
                </div>
                <div style={{ fontSize: 11, color: "var(--dt-warm-500, #999)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeConv?.subject} &middot; {activeConv?.channel?.replace("_", " ")}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {statusInfo && (
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    background: statusInfo.bg,
                    color: statusInfo.text,
                  }}
                >
                  {statusInfo.label}
                </span>
              )}
              <button
                onClick={() => setShowDetail(!showDetail)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--dt-warm-200, #ddd)",
                  background: "transparent",
                  fontSize: 11,
                  cursor: "pointer",
                  color: "var(--dt-warm-600, #666)",
                }}
              >
                {showDetail ? "Hide Details" : "Details"}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            data-testid="inbox-messages"
            style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}
          >
            {messages.length === 0 ? (
              <div
                data-testid="inbox-empty-thread"
                style={{
                  margin: "auto",
                  textAlign: "center",
                  color: "var(--dt-warm-500, #999)",
                  fontSize: 13,
                }}
              >
                No messages in this conversation yet.
              </div>
            ) : (
              messages.map((m) => {
                const isAgent = m.sender_type === "agent";
                const isBot = m.sender_type === "bot";
                return (
                  <div
                    key={m.id}
                    data-testid="inbox-message"
                    data-sender-type={m.sender_type}
                    style={{
                      display: "flex",
                      justifyContent: isAgent ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "70%",
                        padding: "8px 12px",
                        borderRadius: isAgent ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                        background: isAgent
                          ? "var(--dt-gold, #F5C518)"
                          : isBot
                          ? "var(--dt-warm-100, #f0f0f0)"
                          : "var(--dt-warm-100, #f0f0f0)",
                        border: isAgent ? "none" : "1px solid var(--dt-warm-200, #ddd)",
                        color: isAgent ? "#111" : "var(--dt-black, #111)",
                      }}
                    >
                      <div style={{ fontSize: 10, color: isAgent ? "#333" : "var(--dt-warm-600, #666)", marginBottom: 2, fontWeight: 600 }}>
                        {m.sender_name || m.sender_type}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.5 }}>{m.body}</div>
                      <div style={{ fontSize: 9.5, color: isAgent ? "#555" : "var(--dt-warm-500, #999)", marginTop: 4, textAlign: "right" }}>
                        {new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {messages.length > 0 && !messages.some((m) => m.sender_type === "agent") && (
              <div
                data-testid="inbox-awaiting-reply"
                style={{
                  alignSelf: "center",
                  marginTop: 12,
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "var(--dt-warm-50, #fafafa)",
                  border: "1px dashed var(--dt-warm-200, #ddd)",
                  fontSize: 11,
                  color: "var(--dt-warm-600, #666)",
                }}
              >
                No replies yet — send your first reply below.
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Compose */}
          <form
            onSubmit={handleSend}
            data-testid="inbox-reply-composer"
            style={{
              borderTop: "1px solid var(--dt-warm-100, #e5e5e5)",
              display: "flex",
              padding: 0,
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a reply..."
              style={{
                flex: 1,
                padding: "12px 16px",
                border: "none",
                outline: "none",
                fontSize: 13,
              }}
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              style={{
                padding: "12px 20px",
                background: "var(--dt-gold, #F5C518)",
                border: "none",
                fontWeight: 700,
                fontSize: 13,
                cursor: draft.trim() ? "pointer" : "default",
                opacity: draft.trim() ? 1 : 0.5,
                color: "#111",
              }}
            >
              Send
            </button>
          </form>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dt-warm-400, #bbb)", fontSize: 14 }}>
          Select a conversation to start
        </div>
      )}

      {/* Right panel: Contact details */}
      {selected && showDetail && activeConv && (
        <div
          data-pane="detail"
          style={{
            borderLeft: "1px solid var(--dt-warm-100, #e5e5e5)",
            padding: "16px",
            overflowY: "auto",
            fontSize: 12.5,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Contact Details</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--dt-warm-500, #999)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Name</div>
              <div style={{ marginTop: 2 }}>{activeConv.contact?.full_name || "---"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--dt-warm-500, #999)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Email</div>
              <div style={{ marginTop: 2 }}>{activeConv.contact?.email || "---"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--dt-warm-500, #999)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Phone</div>
              <div style={{ marginTop: 2 }}>{activeConv.contact?.phone || "---"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--dt-warm-500, #999)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Company</div>
              <div style={{ marginTop: 2 }}>{activeConv.contact?.company || "---"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--dt-warm-500, #999)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Type</div>
              <div style={{ marginTop: 2, textTransform: "capitalize" }}>{activeConv.contact?.type?.replace("_", " ") || "---"}</div>
            </div>
          </div>

          <div style={{ height: 1, background: "var(--dt-warm-100, #e5e5e5)", margin: "16px 0" }} />

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Actions</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button onClick={handleAssign} className="dt-btn" style={{ fontSize: 11.5, padding: "6px 12px", justifyContent: "center", width: "100%" }}>
              Assign
            </button>

            {activeConv.status !== "resolved" && (
              <button onClick={() => handleStatusChange("resolved")} className="dt-btn dt-btn-gold" style={{ fontSize: 11.5, padding: "6px 12px", justifyContent: "center", width: "100%" }}>
                Resolve
              </button>
            )}
            {activeConv.status === "resolved" && (
              <button onClick={() => handleStatusChange("open")} className="dt-btn" style={{ fontSize: 11.5, padding: "6px 12px", justifyContent: "center", width: "100%" }}>
                Re-open
              </button>
            )}
          </div>

          <div style={{ height: 1, background: "var(--dt-warm-100, #e5e5e5)", margin: "16px 0" }} />

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Link to Record</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {!activeConv.contact?.candidate_id && (
              <>
                <button
                  onClick={handlePromoteToCandidate}
                  className="dt-btn dt-btn-gold"
                  style={{ fontSize: 11.5, padding: "6px 12px", justifyContent: "center", width: "100%" }}
                  disabled={isPending}
                >
                  → Promote to Candidate
                </button>
                <button
                  onClick={handleCreateCandidate}
                  className="dt-btn"
                  style={{ fontSize: 11, padding: "5px 12px", justifyContent: "center", width: "100%", opacity: 0.7 }}
                  title="Quick create — no chat transcript copied into candidate notes."
                >
                  Quick Create Candidate
                </button>
              </>
            )}
            {activeConv.contact?.candidate_id && (
              <Link
                href={`/candidates/${activeConv.contact.candidate_id}`}
                className="dt-btn"
                style={{ fontSize: 11.5, padding: "6px 12px", justifyContent: "center", width: "100%", textAlign: "center" }}
              >
                View Linked Candidate →
              </Link>
            )}
            {promoteFeedback && (
              <div
                role={promoteFeedback.kind === "err" ? "alert" : undefined}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  fontSize: 11.5,
                  background:
                    promoteFeedback.kind === "ok"
                      ? "rgba(16, 185, 129, 0.08)"
                      : "rgba(220, 38, 38, 0.08)",
                  color:
                    promoteFeedback.kind === "ok"
                      ? "var(--dt-success)"
                      : "var(--dt-danger)",
                }}
              >
                {promoteFeedback.message}
                {promoteFeedback.kind === "ok" && (
                  <>
                    {" "}
                    <Link
                      href={`/candidates/${promoteFeedback.candidateId}`}
                      style={{ color: "var(--dt-success)", fontWeight: 500, textDecoration: "underline" }}
                    >
                      Open candidate →
                    </Link>
                  </>
                )}
              </div>
            )}
            {!activeConv.contact?.client_id && (
              <button onClick={handleCreateClient} className="dt-btn" style={{ fontSize: 11.5, padding: "6px 12px", justifyContent: "center", width: "100%" }}>
                Create Client
              </button>
            )}
            {activeConv.contact?.client_id && (
              <div style={{ fontSize: 11, color: "var(--dt-success, #22c55e)", fontWeight: 500 }}>
                Linked to Client
              </div>
            )}
          </div>

          <div style={{ height: 1, background: "var(--dt-warm-100, #e5e5e5)", margin: "16px 0" }} />

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Metadata</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5 }}>
            <div>
              <span style={{ color: "var(--dt-warm-500, #999)" }}>Channel:</span>{" "}
              {activeConv.channel?.replace("_", " ")}
            </div>
            <div>
              <span style={{ color: "var(--dt-warm-500, #999)" }}>Created:</span>{" "}
              {new Date(activeConv.created_at).toLocaleDateString()}
            </div>
            <div>
              <span style={{ color: "var(--dt-warm-500, #999)" }}>Assigned to:</span>{" "}
              {activeConv.assigned_to || "Unassigned"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
