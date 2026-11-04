import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

// Escape one CSV cell. Cells starting with = + - @ are prefixed with a quote
// so Excel / Google Sheets never run them as formulas (CSV injection guard).
function csvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(rows) {
  const header = ["Name", "Email", "Phone", "Chatbot", "Date"];
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(
      [row.name, row.email, row.phone, row.chatbots?.name, formatDateTime(row.created_at)]
        .map(csvCell)
        .join(",")
    );
  }
  // The BOM at the start makes Excel open the file as UTF-8
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const cellStyle = { padding: "12px 16px", textAlign: "left", fontSize: 14, whiteSpace: "nowrap" };
const headStyle = {
  ...cellStyle,
  fontSize: 12,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  opacity: 0.6,
  fontWeight: 600,
};

// A button that looks like a link (used for the name / email cells)
const linkButtonStyle = {
  background: "none",
  border: 0,
  padding: 0,
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
  textDecoration: "underline",
  textAlign: "left",
};

// ---------------------------------------------------------------------------
// Chat popup for one lead: history + live reply from the team
// ---------------------------------------------------------------------------
// A lead and its conversations are linked by (chatbot_id + visitor_id).
// Replies typed here are saved in the messages table with sent_by_agent = true.
// The visitor's chat widget picks them up automatically (it checks every few seconds).
const POLL_MS = 5000;

function LeadChatModal({ lead, onClose }) {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState("ai"); // "ai" = chat with the AI, "team" = reply to the visitor
  const alive = useRef(true);
  const bottomRef = useRef(null);

  // The reply goes into the most recent conversation of this visitor
  const latest = conversations.length ? conversations[conversations.length - 1] : null;

  // Load conversations + messages. "silent" reloads (polling) do not show the spinner.
  const load = useCallback(
    async (silent) => {
      if (!silent) setLoading(true);

      const { data: convos, error: convoError } = await supabase
        .from("conversations")
        .select("id, title, created_at")
        .eq("chatbot_id", lead.chatbot_id)
        .eq("visitor_id", lead.visitor_id)
        .order("created_at", { ascending: true });

      if (!alive.current) return;
      if (convoError) {
        setError(convoError.message);
        setLoading(false);
        return;
      }

      const list = convos || [];
      setConversations(list);

      if (list.length === 0) {
        setMessages([]);
        setLoading(false);
        return;
      }

      const { data: msgs, error: msgError } = await supabase
        .from("messages")
        .select("id, conversation_id, role, content, created_at, sent_by_agent, dashboard_only")
        .in("conversation_id", list.map((c) => c.id))
        .order("created_at", { ascending: true });

      if (!alive.current) return;
      if (msgError) setError(msgError.message);
      else setMessages(msgs || []);
      setLoading(false);
    },
    [lead.chatbot_id, lead.visitor_id]
  );

  // First load, then refresh every few seconds so new visitor messages appear
  useEffect(() => {
    alive.current = true;
    load(false);
    const timer = setInterval(() => load(true), POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [load]);

  // Scroll to the newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, loading]);

  // Close the popup with the Escape key
  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Send the typed text, depending on the selected mode
  async function sendReply() {
    const text = draft.trim();
    if (!text || sending || !latest) return;
    if (text.length > 2000) {
      setError("A message can be up to 2000 characters.");
      return;
    }

    setSending(true);
    setError("");

    if (mode === "ai") {
      // Chat with the AI inside this conversation (private: the visitor does not see it)
      const { error: fnError } = await supabase.functions.invoke("team-chat", {
        body: { conversationId: latest.id, message: text },
      });
      if (fnError) {
        // Read the real error message from the function response, if there is one
        let detail = null;
        try {
          detail = await fnError.context?.json();
        } catch {
          // ignore: fall back to the generic message
        }
        setSending(false);
        setError(detail?.error?.message || fnError.message || "The AI could not answer. Please try again.");
        return;
      }
      await load(true);
      setSending(false);
      setDraft("");
      return;
    }

    // Reply to the visitor as a team member (shown in the visitor's chat widget)
    const { data, error: insertError } = await supabase
      .from("messages")
      .insert({ conversation_id: latest.id, role: "assistant", content: text, sent_by_agent: true })
      .select("id, conversation_id, role, content, created_at, sent_by_agent, dashboard_only")
      .single();

    setSending(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setMessages((current) => [...current, data]);
    setDraft("");
  }

  // Style of one message bubble depends on who wrote it
  function bubble(m) {
    if (m.dashboard_only) {
      // Private chat between the team member and the AI
      return m.role === "user"
        ? { side: "flex-end", background: "#7c3aed", label: "You (private chat with AI)" }
        : { side: "flex-start", background: "rgba(124,58,237,0.22)", label: "AI · only you can see this" };
    }
    if (m.sent_by_agent) {
      return { side: "flex-end", background: "#14b8a6", label: "You (team) → visitor" };
    }
    if (m.role === "user") {
      return { side: "flex-start", background: "rgba(30,144,255,0.28)", label: lead.name || "Visitor" };
    }
    return { side: "flex-start", background: "rgba(255,255,255,0.07)", label: lead.chatbots?.name || "Assistant" };
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="panel chatbot-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Visitor chat"
        style={{ width: "min(680px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column" }}
      >
        <div className="modal-head">
          <div>
            <div className="eyebrow">VISITOR CHAT</div>
            <h2 style={{ margin: 0 }}>{lead.name || lead.email}</h2>
            <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6, lineHeight: 1.6 }}>
              {lead.email && (
                <>
                  <a href={`mailto:${lead.email}`} style={{ color: "inherit" }}>{lead.email}</a>
                  {" · "}
                </>
              )}
              {lead.phone ? `${lead.phone} · ` : ""}
              {lead.chatbots?.name || "Chatbot"}
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Scrollable conversation area */}
        <div style={{ overflowY: "auto", flex: 1, paddingTop: 8, minHeight: 200 }}>
          {loading ? (
            <p style={{ opacity: 0.6, textAlign: "center", padding: 24 }}>Loading chat history…</p>
          ) : conversations.length === 0 ? (
            <p style={{ opacity: 0.6, textAlign: "center", padding: 24 }}>
              This visitor has not sent any messages yet.
            </p>
          ) : (
            conversations.map((convo) => (
              <div key={convo.id} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, opacity: 0.55, textAlign: "center", margin: "6px 0 12px" }}>
                  Conversation started {formatDateTime(convo.created_at)}
                </div>
                {messages
                  .filter((m) => m.conversation_id === convo.id)
                  .map((m) => {
                    const look = bubble(m);
                    return (
                      <div key={m.id} style={{ display: "flex", justifyContent: look.side, marginBottom: 10 }}>
                        <div
                          style={{
                            maxWidth: "78%",
                            padding: "10px 14px",
                            borderRadius: 14,
                            background: look.background,
                            fontSize: 14,
                            lineHeight: 1.5,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>
                            {look.label} · {formatDateTime(m.created_at)}
                          </div>
                          {m.content}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="modal-error" role="alert">{error}</p>}

        {/* Message box with a mode switch */}
        <div style={{ paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              className="subtle-button"
              style={mode === "ai" ? { background: "#7c3aed", color: "#fff" } : undefined}
              onClick={() => setMode("ai")}
            >
              Ask AI
            </button>
            <button
              type="button"
              className="subtle-button"
              style={mode === "team" ? { background: "#14b8a6", color: "#fff" } : undefined}
              onClick={() => setMode("team")}
            >
              Reply to visitor
            </button>
          </div>
          <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 8px" }}>
            {mode === "ai"
              ? "You chat with the AI here. These messages stay in this history, but the visitor cannot see them."
              : "Your message appears in the visitor's chat widget."}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              className="chatbot-input"
              style={{ flex: 1, margin: 0 }}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendReply();
                }
              }}
              placeholder={
                !latest
                  ? "Available after the visitor starts a chat"
                  : mode === "ai"
                    ? "Ask the AI anything about this chat…"
                    : "Type a reply to this visitor…"
              }
              maxLength={2000}
              disabled={!latest || sending}
              aria-label="Message"
            />
            <button
              className="primary-button"
              type="button"
              onClick={sendReply}
              disabled={!latest || sending || !draft.trim()}
            >
              {sending ? (mode === "ai" ? "AI is thinking…" : "Sending…") : "Send"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leads page
// ---------------------------------------------------------------------------
// Props:
//   topbar        - the <Topbar title="Leads" /> element from App.jsx
//   organization  - the current organization ({ id, name })
//   role          - the user's role in the organization (owner / admin / member)
export default function Leads({ topbar, organization, role }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [botFilter, setBotFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [allBots, setAllBots] = useState([]); // every chatbot of the organization (for the filter)
  const [openLead, setOpenLead] = useState(null); // lead whose chat popup is open

  const canManage = role === "owner" || role === "admin";
  const organizationId = organization?.id;

  // Load all leads that belong to chatbots of this organization
  useEffect(() => {
    if (!organizationId) return;

    let cancelled = false;

    async function loadLeads() {
      setLoading(true);
      setError("");

      // chatbots!inner makes the filter on the joined table apply to the leads too
      const { data, error: loadError } = await supabase
        .from("visitor_leads")
        .select("id, chatbot_id, visitor_id, name, email, phone, created_at, chatbots!inner(name, organization_id)")
        .eq("chatbots.organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(1000);

      // All chatbots of this organization, so the filter also lists bots that have no leads yet
      const { data: botRows } = await supabase
        .from("chatbots")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name", { ascending: true });

      if (cancelled) return;
      setAllBots(botRows || []);

      if (loadError) {
        setError(loadError.message);
        setLeads([]);
      } else {
        setLeads(data || []);
      }
      setLoading(false);
    }

    loadLeads();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // Chatbot names for the filter dropdown (all chatbots, not only the ones with leads)
  const botOptions = useMemo(() => allBots.map((bot) => [bot.id, bot.name]), [allBots]);

  // Apply search + chatbot filter
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (botFilter !== "all" && lead.chatbot_id !== botFilter) return false;
      if (!query) return true;
      return [lead.name, lead.email, lead.phone]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [leads, search, botFilter]);

  async function deleteLead(lead) {
    if (!canManage) return;
    if (!window.confirm(`Delete the lead "${lead.name || lead.email}"? This cannot be undone.`)) return;

    setBusyId(lead.id);
    setError("");

    const { error: deleteError } = await supabase.from("visitor_leads").delete().eq("id", lead.id);

    setBusyId(null);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setLeads((current) => current.filter((item) => item.id !== lead.id));
  }

  return (
    <>
      {topbar}
      <main className="main-content">
        <section className="welcome-row">
          <div>
            <div className="eyebrow"><span className="status-dot" /> VISITOR DETAILS</div>
            <h1>Leads</h1>
            <p className="welcome-subtitle">
              Name, email and phone shared by visitors. Click a name or email to see their chat.
            </p>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => downloadCsv(filtered)}
            disabled={filtered.length === 0}
          >
            Download CSV
          </button>
        </section>

        {error && <p className="notice error" role="alert">{error}</p>}

        {/* Search + chatbot filter */}
        <section className="chatbot-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
          <label className="chatbot-search">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email or phone"
              aria-label="Search leads"
            />
          </label>
          <select
            className="chatbot-input"
            style={{ maxWidth: 240, width: "100%" }}
            value={botFilter}
            onChange={(event) => setBotFilter(event.target.value)}
            aria-label="Filter by chatbot"
          >
            <option value="all">All chatbots</option>
            {botOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </section>

        {loading ? (
          <article className="panel" style={{ padding: 40, textAlign: "center" }}>
            <strong>Loading leads…</strong>
          </article>
        ) : filtered.length === 0 ? (
          <article className="panel" style={{ padding: 40, textAlign: "center" }}>
            <strong style={{ fontSize: 16 }}>
              {leads.length === 0 ? "No leads yet" : "No matching leads"}
            </strong>
            <p style={{ opacity: 0.6, fontSize: 13, marginTop: 8 }}>
              {leads.length === 0
                ? "When a visitor fills the form in your chatbot, their details will appear here."
                : "Try a different search term or chatbot filter."}
            </p>
          </article>
        ) : (
          <article className="panel" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <th style={headStyle}>Name</th>
                  <th style={headStyle}>Email</th>
                  <th style={headStyle}>Phone</th>
                  <th style={headStyle}>Chatbot</th>
                  <th style={headStyle}>Date</th>
                  <th style={headStyle} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr key={lead.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ ...cellStyle, fontWeight: 600 }}>
                      <button type="button" style={{ ...linkButtonStyle, textDecoration: "none" }} onClick={() => setOpenLead(lead)}>
                        {lead.name || "-"}
                      </button>
                    </td>
                    <td style={cellStyle}>
                      {lead.email ? (
                        <button type="button" style={linkButtonStyle} onClick={() => setOpenLead(lead)}>
                          {lead.email}
                        </button>
                      ) : "-"}
                    </td>
                    <td style={cellStyle}>{lead.phone || "-"}</td>
                    <td style={cellStyle}>{lead.chatbots?.name || "-"}</td>
                    <td style={{ ...cellStyle, opacity: 0.7 }}>{formatDateTime(lead.created_at)}</td>
                    <td style={{ ...cellStyle, textAlign: "right" }}>
                      <button className="subtle-button" type="button" onClick={() => setOpenLead(lead)}>
                        View chat
                      </button>
                      {canManage && (
                        <button
                          className="subtle-button danger"
                          type="button"
                          style={{ marginLeft: 8 }}
                          onClick={() => deleteLead(lead)}
                          disabled={busyId === lead.id}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ opacity: 0.5, fontSize: 12, padding: "12px 16px", margin: 0 }}>
              Showing {filtered.length} of {leads.length} leads
            </p>
          </article>
        )}
      </main>

      {openLead && <LeadChatModal lead={openLead} onClose={() => setOpenLead(null)} />}
    </>
  );
}
