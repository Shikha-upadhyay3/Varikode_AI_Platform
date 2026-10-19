import { useState, useRef, useEffect } from "react";

const BLUE = "#1e90ff";
const TEAL = "#14b8a6";
const GRADIENT = `linear-gradient(135deg, ${BLUE}, ${TEAL})`;

// Demo reply. Later this will call the backend API (the AI key must never be in frontend code).
async function getReply() {
  await new Promise((resolve) => setTimeout(resolve, 900));
  return "Thanks for your message! This is a demo reply. Live AI answers will be connected through the backend.";
}

// Logo ho to image dikhao, warna naam ka pehla akshar
function Avatar({ assistant, size }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: assistant.logo ? "transparent" : "white",
        color: BLUE, display: "grid", placeItems: "center",
        fontWeight: 700, overflow: "hidden", fontSize: size * 0.42,
      }}
    >
      {assistant.logo ? (
        <img src={assistant.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        (assistant.name || "A")[0].toUpperCase()
      )}
    </span>
  );
}

export default function ChatWidget({ assistant = { name: "AI Assistant", logo: null }, onSaveChat }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hi! How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const sessionId = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  // Har naye message par chat ko dashboard ke Chats page ke liye save karo
  useEffect(() => {
    const firstUser = messages.find((m) => m.role === "user");
    if (!firstUser || !onSaveChat) return;
    if (!sessionId.current) sessionId.current = Date.now();
    onSaveChat({
      id: sessionId.current,
      title: firstUser.text.length > 48 ? firstUser.text.slice(0, 48) + "…" : firstUser.text,
      who: "Website visitor",
      status: "Resolved",
      updatedAt: Date.now(),
      messages: messages.map((m) => ({ from: m.role === "user" ? "user" : "ai", text: m.text })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  function newChat() {
    sessionId.current = null;
    setMessages([{ role: "assistant", text: "Hi! How can I help you today?" }]);
    setInput("");
  }

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setLoading(true);
    const reply = await getReply(text);
    setMessages((m) => [...m, { role: "assistant", text: reply }]);
    setLoading(false);
  }

  // Closed state: small "Ask AI" bar in the bottom-right corner
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open chat"
        style={{
          position: "fixed", right: 24, bottom: 24, zIndex: 1000,
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 10px 8px 8px", border: "none", borderRadius: 999,
          background: GRADIENT, color: "white", cursor: "pointer",
          boxShadow: "0 10px 30px rgba(30,144,255,0.45)", fontSize: 15,
        }}
      >
        <Avatar assistant={assistant} size={36} />
        <span style={{ paddingRight: 8 }}>Ask AI</span>
      </button>
    );
  }

  // Open state: chat window
  return (
    <div
      style={{
        position: "fixed", right: 24, bottom: 24, zIndex: 1000,
        width: 360, maxWidth: "calc(100vw - 32px)", height: 500, maxHeight: "calc(100vh - 48px)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        borderRadius: 18, background: "rgba(13,19,28,0.94)",
        border: "1px solid rgba(255,255,255,0.12)",
        WebkitBackdropFilter: "blur(16px)", backdropFilter: "blur(16px)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.6)",
        fontFamily: "sans-serif", color: "#e6edf6",
      }}
    >
      <div style={{ background: GRADIENT, color: "white", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar assistant={assistant} size={32} />
          <strong>{assistant.name}</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={newChat} aria-label="Start new chat" style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", fontSize: 12, padding: "5px 10px", borderRadius: 999, cursor: "pointer" }}>New chat</button>
          <button onClick={() => setOpen(false)} aria-label="Close chat" style={{ background: "none", border: "none", color: "white", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "80%", padding: "9px 13px", borderRadius: 14, fontSize: 14, lineHeight: 1.45,
              background: m.role === "user" ? GRADIENT : "rgba(255,255,255,0.08)",
              border: m.role === "user" ? "none" : "1px solid rgba(255,255,255,0.1)",
              color: m.role === "user" ? "white" : "#dbe5f1",
            }}
          >
            {m.text}
          </div>
        ))}
        {loading && <div style={{ alignSelf: "flex-start", color: "#8d9bb0", fontSize: 13 }}>Typing...</div>}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid rgba(255,255,255,0.09)" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask AI..."
          aria-label="Type your message"
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 999, outline: "none", fontSize: 14,
            border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#e6edf6",
          }}
        />
        <button type="submit" disabled={loading} aria-label="Send message" style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: GRADIENT, color: "white", cursor: "pointer", fontSize: 16, boxShadow: "0 6px 16px rgba(30,144,255,0.4)" }}>↑</button>
      </form>
      <div style={{ textAlign: "center", fontSize: 11, color: "#6f7d90", padding: "0 0 8px" }}>AI can make mistakes. Check important information.</div>
    </div>
  );
}
