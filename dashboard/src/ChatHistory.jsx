import { useState } from "react";

// Abhi demo data hai. Baad me backend/API se aayega.
const demoChats = [
  {
    id: 1,
    title: "Do you have a 2BHK available?",
    time: "5 min ago",
    status: "Resolved",
    messages: [
      { from: "user", text: "Do you have a 2BHK available?" },
      { from: "ai", text: "Yes! We have 2BHK units available. Would you like to book a viewing?" },
    ],
  },
  {
    id: 2,
    title: "Can I talk to a real person?",
    time: "1 hour ago",
    status: "Handoff",
    messages: [
      { from: "user", text: "Can I talk to a real person?" },
      { from: "ai", text: "Sure, I'm connecting you to our team." },
    ],
  },
];

export default function ChatHistory({ assistant, chats = demoChats }) {
  const [activeId, setActiveId] = useState(chats[0]?.id);
  const active = chats.find((c) => c.id === activeId);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, height: "70vh" }}>
      {/* Left: chat list */}
      <div style={{ border: "1px solid #2a2a3a", borderRadius: 12, overflowY: "auto" }}>
        {chats.map((c) => (
          <div
            key={c.id}
            onClick={() => setActiveId(c.id)}
            style={{
              padding: 14,
              cursor: "pointer",
              borderBottom: "1px solid #2a2a3a",
              background: c.id === activeId ? "#2a2250" : "transparent",
            }}
          >
            <div style={{ fontWeight: 600 }}>{c.title}</div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              {c.time} · {c.status}
            </div>
          </div>
        ))}
      </div>

      {/* Right: full conversation */}
      <div style={{ border: "1px solid #2a2a3a", borderRadius: 12, padding: 16, overflowY: "auto" }}>
        {active ? (
          active.messages.map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: m.from === "user" ? "flex-end" : "flex-start",
                marginBottom: 10,
                gap: 8,
              }}
            >
              {m.from === "ai" && assistant.logo && (
                <img src={assistant.logo} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
              )}
              <div
                style={{
                  maxWidth: "70%",
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: m.from === "user" ? "#6d4aff" : "#1c1c2b",
                }}
              >
                {m.from === "ai" && (
                  <div style={{ fontSize: 11, opacity: 0.6 }}>{assistant.name}</div>
                )}
                {m.text}
              </div>
            </div>
          ))
        ) : (
          <p style={{ opacity: 0.6 }}>Koi chat select karo</p>
        )}
      </div>
    </div>
  );
}