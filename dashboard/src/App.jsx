import { useState } from "react";
import "./App.css";
import "./theme.css";
import ChatWidget from "./ChatWidget";
import { useAuth } from "./AuthContext";

function Icon({ name, size = 18 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>,
    code: <><path d="m16 18 6-6-6-6M8 6l-6 6 6 6m6-16-4 20" /></>,
    sliders: <><path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 8h4" /></>,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>,
    plus: <><path d="M12 5v14m-7-7h14" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14Z" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8m-8 4h8" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    bot: <><rect x="3" y="8" width="18" height="13" rx="3" /><path d="M12 8V4m-3 0h6M8 13h.01M16 13h.01M9 17h6" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
    chat: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Helper: logged-in user ka naam / initial                            */
/* ------------------------------------------------------------------ */
function getDisplayName(user) {
  return user?.user_metadata?.full_name || user?.email || "User";
}

/* ------------------------------------------------------------------ */
/* Demo data.                         */
/* ------------------------------------------------------------------ */
const statusStyle = (status) => ({
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 999,
  background: status === "Handoff" ? "rgba(245,166,35,0.15)" : "rgba(52,211,153,0.15)",
  color: status === "Handoff" ? "#f5a623" : "#34d399",
  whiteSpace: "nowrap",
});

const conversationsData = [
  { label: "Sep 20", value: 78 },
  { label: "Sep 22", value: 92 },
  { label: "Sep 25", value: 85 },
  { label: "Sep 27", value: 110 },
  { label: "Sep 30", value: 96 },
  { label: "Oct 2", value: 124 },
  { label: "Oct 5", value: 118 },
  { label: "Oct 7", value: 140 },
  { label: "Oct 10", value: 102 },
  { label: "Oct 12", value: 131 },
  { label: "Oct 15", value: 126 },
  { label: "Oct 19", value: 148 },
];

const resolvedData = [
  { label: "Oct 6", a: 60, b: 6 },
  { label: "Oct 7", a: 72, b: 8 },
  { label: "Oct 8", a: 66, b: 5 },
  { label: "Oct 9", a: 84, b: 9 },
  { label: "Oct 10", a: 78, b: 7 },
  { label: "Oct 11", a: 92, b: 10 },
  { label: "Oct 12", a: 88, b: 6 },
  { label: "Oct 13", a: 100, b: 9 },
  { label: "Oct 14", a: 82, b: 8 },
  { label: "Oct 15", a: 96, b: 7 },
  { label: "Oct 16", a: 90, b: 9 },
  { label: "Oct 17", a: 108, b: 8 },
  { label: "Oct 18", a: 98, b: 6 },
  { label: "Oct 19", a: 112, b: 7 },
];

/* ------------------------------------------------------------------ */
/* SVG chart helpers         */
/* ------------------------------------------------------------------ */
const AXIS_TEXT = "#8d9bb0";
const GRID_LINE = "rgba(255,255,255,0.07)";

function smooth(points) {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

// Chhota line + area graph (stat cards ke andar)
function Spark({ data, color, id }) {
  const w = 200;
  const h = 50;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data.map((v, i) => [
    i * (w / (data.length - 1)),
    h - 5 - ((v - min) / (max - min || 1)) * (h - 14),
  ]);
  const line = smooth(pts);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: 54 }}
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#spark-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Bada area chart, hover karne par value dikhti hai
function AreaChart({ data }) {
  const [hover, setHover] = useState(data.length - 3);
  const W = 600, H = 230, L = 38, R = 14, T = 16, B = 28;
  const max = Math.max(...data.map((d) => d.value));
  const top = Math.ceil(max / 40) * 40;
  const step = (W - L - R) / (data.length - 1);
  const x = (i) => L + i * step;
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const pts = data.map((d, i) => [x(i), y(d.value)]);
  const line = smooth(pts);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(top * t));
  const hp = pts[hover];
  const boxX = Math.min(Math.max(hp[0] - 42, L), W - R - 84);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round((px - L) / step);
    setHover(Math.min(data.length - 1, Math.max(0, i)));
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Conversations over time"
      style={{ width: "100%", height: "auto", display: "block" }}
      onMouseMove={onMove}
    >
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#1e90ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="area-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1e90ff" />
          <stop offset="100%" stopColor="#2dd4bf" />
        </linearGradient>
      </defs>

      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID_LINE} />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={AXIS_TEXT}>{t}</text>
        </g>
      ))}

      <path d={`${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#area-fill)" />
      <path d={line} fill="none" stroke="url(#area-line)" strokeWidth="3" strokeLinecap="round" />

      {data.map((d, i) =>
        i % 2 === 0 ? (
          <text key={d.label} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={AXIS_TEXT}>{d.label}</text>
        ) : null
      )}

      <line x1={hp[0]} x2={hp[0]} y1={hp[1]} y2={y(0)} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
      <circle cx={hp[0]} cy={hp[1]} r="9" fill="#2dd4bf" opacity="0.25" />
      <circle cx={hp[0]} cy={hp[1]} r="5" fill="#fff" stroke="#2dd4bf" strokeWidth="2" />
      <rect x={boxX} y={hp[1] - 40} width="84" height="26" rx="7" fill="#0b121c" stroke="rgba(255,255,255,0.18)" />
      <text x={boxX + 42} y={hp[1] - 23} textAnchor="middle" fontSize="12" fill="#fff" fontWeight="600">
        {data[hover].value} chats
      </text>
    </svg>
  );
}

// Stacked bar chart: resolved (teal) + handoff (blue)
function StackedBars({ data }) {
  const W = 400, H = 230, L = 32, R = 8, T = 14, B = 28;
  const top = Math.ceil(Math.max(...data.map((d) => d.a + d.b)) / 40) * 40;
  const slot = (W - L - R) / data.length;
  const bw = slot * 0.6;
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const ticks = [0, 0.5, 1].map((t) => Math.round(top * t));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Resolved and handoff chats" style={{ width: "100%", height: "auto", display: "block" }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID_LINE} />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={AXIS_TEXT}>{t}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const bx = L + i * slot + (slot - bw) / 2;
        return (
          <g key={d.label}>
            <rect x={bx} y={y(d.a)} width={bw} height={y(0) - y(d.a)} rx="2" fill="#2dd4bf" />
            <rect x={bx} y={y(d.a + d.b)} width={bw} height={y(d.a) - y(d.a + d.b) - 1} rx="2" fill="#1e90ff" />
            {i % 3 === 0 && (
              <text x={bx + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill={AXIS_TEXT}>{d.label.replace("Oct ", "")}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Legend({ items }) {
  return (
    <div style={{ display: "flex", gap: 16, justifyContent: "center", fontSize: 11, color: AXIS_TEXT, padding: "6px 0 14px" }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i style={{ width: 8, height: 8, borderRadius: 2, background: it.color, display: "inline-block" }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// Half-circle gauge
function Gauge({ value }) {
  return (
    <svg viewBox="0 0 200 122" role="img" aria-label={`Resolution rate ${value}%`} style={{ width: "100%", maxWidth: 270, display: "block", margin: "0 auto" }}>
      <defs>
        <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1e90ff" />
          <stop offset="100%" stopColor="#2dd4bf" />
        </linearGradient>
      </defs>
      <path d="M20,100 A80,80 0 0 1 180,100" pathLength="100" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="16" strokeLinecap="round" />
      <path d="M20,100 A80,80 0 0 1 180,100" pathLength="100" fill="none" stroke="url(#gauge-grad)" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${value} 100`} />
      <text x="100" y="92" textAnchor="middle" fontSize="30" fontWeight="700" fill="#fff">{value}%</text>
      <text x="100" y="114" textAnchor="middle" fontSize="11" fill={AXIS_TEXT}>resolution rate</text>
    </svg>
  );
}

// Donut chart
function Donut({ parts, total }) {
  let acc = 0;
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label="Knowledge sources split" style={{ width: 130, height: 130, flexShrink: 0 }}>
      <circle cx="60" cy="60" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
      {parts.map((p) => {
        const dash = (p.value / total) * 100 - 2;
        const el = (
          <circle
            key={p.label}
            cx="60" cy="60" r="44" fill="none" stroke={p.color} strokeWidth="14"
            pathLength="100" strokeDasharray={`${dash} ${100 - dash}`} strokeDashoffset={-acc}
            transform="rotate(-90 60 60)"
          />
        );
        acc += (p.value / total) * 100;
        return el;
      })}
      <text x="60" y="66" textAnchor="middle" fontSize="22" fontWeight="700" fill="#fff">{total}</text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */
function Sidebar({ active, setActive, open, close }) {
  const { user, signOut } = useAuth();
  const displayName = getDisplayName(user);

  const links = [
    { id: "Overview", icon: "grid" },
    { id: "Knowledge sources", icon: "book" },
    { id: "Embed center", icon: "code" },
    { id: "Assistant settings", icon: "sliders" },
    { id: "Chats", icon: "chat" },
  ];

  return (
    <>
      {open && <button className="mobile-scrim" onClick={close} aria-label="Close menu" />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <a className="brand" href="#overview" onClick={() => setActive("Overview")}>
          <span className="brand-mark"><Icon name="spark" size={20} /></span>
          <span>varikode<span className="brand-ai">.ai</span></span>
        </a>

        <div className="workspace-label">WORKSPACE</div>
        <button className="workspace-switcher">
          <span className="workspace-avatar">V</span>
          <span className="workspace-copy"><strong>Varikode Studio</strong><small>Free plan</small></span>
          <span className="chevron">⌄</span>
        </button>

        <div className="nav-label">PLATFORM</div>
        <nav className="nav-list" aria-label="Main navigation">
          {links.map((link) => (
            <button
              key={link.id}
              className={`nav-link ${active === link.id ? "nav-link-active" : ""}`}
              onClick={() => {
                setActive(link.id);
                close();
              }}
            >
              <Icon name={link.icon} />
              <span>{link.id}</span>
              {link.id === "Knowledge sources" && <span className="nav-count">8</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="plan-card">
            <div className="plan-heading"><span>Monthly usage</span><span>68%</span></div>
            <div className="usage-track"><span /></div>
            <p>6,820 <span>of 10,000 messages</span></p>
            <button onClick={() => setActive("Assistant settings")}>Upgrade plan <Icon name="arrow" size={14} /></button>
          </div>
          <div className="profile">
            <div className="profile-avatar">{displayName[0].toUpperCase()}</div>
            <div className="profile-copy">
              <strong className="profile-name">{displayName}</strong>
              <small>Admin</small>
            </div>
            <button
              className="profile-menu"
              aria-label="Sign out"
              title="Sign out"
              onClick={signOut}
            >
              •••
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Topbar                                       */
/* ------------------------------------------------------------------ */
function Topbar({ title }) {
  const { user } = useAuth();
  const initial = getDisplayName(user)[0].toUpperCase();

  return (
    <header className="topbar">
      <div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{title}</strong></div>
      <div className="topbar-actions">
        <button className="icon-button" aria-label="Search"><Icon name="search" /></button>
        <button className="help-button">Help center <Icon name="arrow" size={14} /></button>
        <div className="top-avatar">{initial}</div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Assistant logo            */
/* ------------------------------------------------------------------ */
function AssistantAvatar({ assistant, size = 28 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#12304f",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        flexShrink: 0,
        fontSize: size * 0.45,
        fontWeight: 600,
      }}
    >
      {assistant.logo ? (
        <img src={assistant.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span>{(assistant.name || "A")[0].toUpperCase()}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chats page                                                          */
/* ------------------------------------------------------------------ */
function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function ChatHistory({ assistant, chats, onDelete }) {
  const [activeId, setActiveId] = useState(null);
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  const current = sorted.find((c) => c.id === activeId) || sorted[0];

  return (
    <>
      <Topbar title="Chats" />
      <main className="main-content">
        <section className="welcome-row">
          <div>
            <div className="eyebrow"><span className="status-dot" /> CHAT HISTORY</div>
            <h1>Conversations</h1>
            <p className="welcome-subtitle">Every conversation your AI assistant has had appears here.</p>
          </div>
        </section>

        {sorted.length === 0 ? (
          <article className="panel" style={{ padding: 40, textAlign: "center" }}>
            <strong style={{ fontSize: 16 }}>No chats yet</strong>
            <p style={{ opacity: 0.6, fontSize: 13, marginTop: 8 }}>
              Start a conversation with the "Ask AI" button and it will be saved here.
            </p>
          </article>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) 1fr", gap: 16, height: "68vh" }}>
            <article className="panel" style={{ overflowY: "auto" }}>
              {sorted.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  style={{
                    padding: "14px 18px",
                    cursor: "pointer",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    background: c.id === current.id ? "rgba(30,144,255,0.18)" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <strong style={{ fontSize: 14 }}>{c.title}</strong>
                    <span style={statusStyle(c.status)}>{c.status}</span>
                  </div>
                  <div style={{ opacity: 0.6, fontSize: 12, marginTop: 4 }}>{c.who} · {timeAgo(c.updatedAt)}</div>
                </div>
              ))}
            </article>

            <article className="panel" style={{ overflowY: "auto", padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                <div>
                  <strong>{current.title}</strong>
                  <div style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>{current.who} · {timeAgo(current.updatedAt)}</div>
                </div>
                <button className="subtle-button" onClick={() => onDelete(current.id)}>Delete chat</button>
              </div>
              {current.messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: m.from === "user" ? "flex-end" : "flex-start",
                    alignItems: "flex-end",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  {m.from === "ai" && <AssistantAvatar assistant={assistant} />}
                  <div
                    style={{
                      maxWidth: "70%",
                      padding: "10px 14px",
                      borderRadius: 14,
                      background: m.from === "user" ? "#1e90ff" : "rgba(255,255,255,0.07)",
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    {m.from === "ai" && (
                      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>{assistant.name}</div>
                    )}
                    {m.text}
                  </div>
                </div>
              ))}
            </article>
          </div>
        )}
      </main>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Assistant settings: AI ka naam + logo change                        */
/* ------------------------------------------------------------------ */
function AssistantSettings({ assistant, onSave }) {
  const [name, setName] = useState(assistant.name);
  const [logo, setLogo] = useState(assistant.logo);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleLogo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, JPG, or SVG).");
      return;
    }
    if (file.size > 1024 * 1024) {
      setError("Logo must be smaller than 1 MB.");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    onSave({ name: name.trim() || "AI Assistant", logo });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    marginTop: 8,
    borderRadius: 10,
    background: "rgba(255,255,255,0.05)",
    color: "inherit",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 14,
    boxSizing: "border-box",
  };

  return (
    <>
      <Topbar title="Assistant settings" />
      <main className="main-content">
        <section className="welcome-row">
          <div>
            <div className="eyebrow"><span className="status-dot" /> ASSISTANT SETTINGS</div>
            <h1>Customize your assistant</h1>
            <p className="welcome-subtitle">Change your assistant's name and logo here.</p>
          </div>
        </section>

        <article className="panel" style={{ maxWidth: 520, padding: 24 }}>
          <label style={{ fontSize: 13, opacity: 0.8 }}>Assistant name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Varikode Assistant"
            maxLength={40}
            style={inputStyle}
          />

          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 24 }}>Logo</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            <AssistantAvatar assistant={{ name, logo }} size={72} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="primary-button" style={{ cursor: "pointer", display: "inline-flex", marginTop: 0 }}>
                <Icon name="plus" size={16} />
                {logo ? "Change logo" : "Upload logo"}
                <input type="file" accept="image/*" onChange={handleLogo} style={{ display: "none" }} />
              </label>
              {logo && (
                <button className="subtle-button" onClick={() => setLogo(null)}>Remove logo</button>
              )}
            </div>
          </div>
          {error && <p style={{ color: "#f87171", fontSize: 13, marginTop: 10 }}>{error}</p>}

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 28 }}>
            <button className="primary-button" style={{ marginTop: 0 }} onClick={handleSave}>Save changes</button>
            {saved && <span style={{ color: "#4ade80", fontSize: 14 }}>Saved ✓</span>}
          </div>
        </article>
      </main>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Overview (graph style)                  */
/* ------------------------------------------------------------------ */
const overviewCss = `
.charts-row { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 15px; margin-top: 16px; }
.bottom-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 15px; margin-top: 15px; }
.chart-body { padding: 14px 18px 4px; }
.stat-card .stat-foot { position: relative; z-index: 1; }
.stat-card .stat-value { position: relative; z-index: 1; }
@media (max-width: 1100px) { .bottom-row { grid-template-columns: 1fr 1fr; } }
@media (max-width: 820px) { .charts-row { grid-template-columns: 1fr; } }
@media (max-width: 650px) { .bottom-row { grid-template-columns: 1fr; } }
`;

function Overview({ active, setActive }) {
  const { user } = useAuth();
  const firstName = getDisplayName(user).split(/[ @]/)[0];

  if (active !== "Overview") {
    const details = {
      "Knowledge sources": ["Knowledge sources", "Connect documents and websites so your assistant can answer with your content.", "Add a source"],
      "Embed center": ["Embed center", "Bring your AI assistant to your website with a simple embed.", "Get embed code"],
    }[active];

    return (
      <section className="placeholder-page">
        <div className="eyebrow">VARIKODE AI PLATFORM</div>
        <h1>{details[0]}</h1>
        <p>{details[1]}</p>
        <button className="primary-button"><Icon name="plus" size={16} />{details[2]}</button>
      </section>
    );
  }

  return (
    <>
      <style>{overviewCss}</style>
      <Topbar title="Overview" />

      <main className="main-content">
        <section className="welcome-row">
          <div>
            <div className="eyebrow"><span className="status-dot" /> YOUR AI WORKSPACE</div>
            <h1>Good evening, {firstName}<span className="wave">✳</span></h1>
            <p className="welcome-subtitle">Here’s what’s happening with your AI assistant today.</p>
          </div>
          <button className="date-filter"><Icon name="clock" size={15} /> Last 30 days <span>⌄</span></button>
        </section>

        {/* Stat cards with line graphs */}
        <section className="stats-grid" aria-label="Workspace statistics">
          <article className="stat-card">
            <div className="stat-top"><span>Total conversations</span><span className="stat-icon violet"><Icon name="bot" size={18} /></span></div>
            <div className="stat-value">2,847</div>
            <div className="stat-foot"><span className="trend">↗ 12.8%</span><span>vs. previous month</span></div>
            <Spark id="conv" color="#3aa0ff" data={[30, 42, 36, 55, 48, 66, 58, 74, 68, 85, 80, 96]} />
          </article>
          <article className="stat-card">
            <div className="stat-top"><span>Messages answered</span><span className="stat-icon mint"><Icon name="send" size={17} /></span></div>
            <div className="stat-value">8,429</div>
            <div className="stat-foot"><span className="trend">↗ 8.2%</span><span>vs. previous month</span></div>
            <Spark id="msg" color="#2dd4bf" data={[40, 38, 52, 47, 60, 55, 70, 64, 78, 72, 88, 92]} />
          </article>
          <article className="stat-card">
            <div className="stat-top"><span>Knowledge sources</span><span className="stat-icon amber"><Icon name="book" size={17} /></span></div>
            <div className="stat-value">08</div>
            <div className="stat-foot"><span className="stat-neutral">+2 added</span><span>this month</span></div>
            <Spark id="kb" color="#fbbf24" data={[20, 20, 28, 28, 34, 34, 44, 44, 52, 60, 60, 72]} />
          </article>
          <article className="stat-card">
            <div className="stat-top"><span>Resolution rate</span><span className="stat-icon blue"><Icon name="spark" size={18} /></span></div>
            <div className="stat-value">94.6<span className="stat-unit">%</span></div>
            <div className="stat-foot"><span className="trend">↗ 3.1%</span><span>vs. previous month</span></div>
            <Spark id="res" color="#60a5fa" data={[70, 74, 72, 80, 78, 84, 82, 88, 86, 92, 90, 95]} />
          </article>
        </section>

        {/* Big graphs */}
        <section className="charts-row">
          <article className="panel">
            <div className="panel-heading compact">
              <div>
                <div className="panel-title">Conversations over time</div>
                <p>Chats handled by your assistant, last 30 days</p>
              </div>
              <button className="subtle-button" onClick={() => setActive("Chats")}><Icon name="arrow" size={14} /> View chats</button>
            </div>
            <div className="chart-body">
              <AreaChart data={conversationsData} />
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading compact">
              <div>
                <div className="panel-title">Resolved vs handoff</div>
                <p>Daily outcome of conversations</p>
              </div>
            </div>
            <div className="chart-body">
              <StackedBars data={resolvedData} />
              <Legend items={[{ label: "Resolved", color: "#2dd4bf" }, { label: "Handoff", color: "#1e90ff" }]} />
            </div>
          </article>
        </section>

        {/* Bottom row */}
        <section className="bottom-row">
          <article className="panel">
            <div className="panel-heading compact">
              <div><div className="panel-title">Resolution rate</div><p>Answered without human help</p></div>
            </div>
            <div className="chart-body" style={{ paddingBottom: 18 }}>
              <Gauge value={94.6} />
              <div style={{ display: "flex", justifyContent: "space-around", marginTop: 14, textAlign: "center" }}>
                <div><strong style={{ display: "block", fontSize: 16 }}>2,847</strong><span style={{ fontSize: 11, color: AXIS_TEXT }}>chats</span></div>
                <div><strong style={{ display: "block", fontSize: 16 }}>2,693</strong><span style={{ fontSize: 11, color: AXIS_TEXT }}>resolved</span></div>
                <div><strong style={{ display: "block", fontSize: 16 }}>154</strong><span style={{ fontSize: 11, color: AXIS_TEXT }}>handoff</span></div>
              </div>
            </div>
          </article>

          <article className="panel activity-panel">
            <div className="panel-heading compact"><div><div className="panel-title">Recent activity</div><p>What’s happening in your workspace</p></div><button className="dots-button" aria-label="More options">•••</button></div>
            <div className="activity-list">
              <div className="activity-item"><div className="activity-icon violet"><Icon name="file" size={16} /></div><div><strong>New source indexed</strong><p>Product documentation.pdf</p><small>12 minutes ago</small></div></div>
              <div className="activity-item"><div className="activity-icon mint"><Icon name="bot" size={16} /></div><div><strong>Assistant resolved a query</strong><p>“How do I reset my password?”</p><small>38 minutes ago</small></div></div>
              <div className="activity-item"><div className="activity-icon amber"><Icon name="book" size={16} /></div><div><strong>Knowledge base updated</strong><p>3 new pages synced</p><small>2 hours ago</small></div></div>
            </div>
          </article>

          <article className="panel sources-panel">
            <div className="panel-heading compact"><div><div className="panel-title">Your knowledge base</div><p>Content powering your assistant</p></div><button className="small-add" aria-label="Add knowledge source" onClick={() => setActive("Knowledge sources")}><Icon name="plus" size={17} /></button></div>
            <div className="chart-body" style={{ display: "flex", alignItems: "center", gap: 18, paddingBottom: 8 }}>
              <Donut
                total={8}
                parts={[
                  { label: "Documents", value: 5, color: "#1e90ff" },
                  { label: "Web pages", value: 3, color: "#2dd4bf" },
                ]}
              />
              <div style={{ display: "grid", gap: 10, fontSize: 12, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: "#1e90ff", display: "inline-block" }} /> Documents <strong style={{ marginLeft: "auto" }}>5</strong></div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: "#2dd4bf", display: "inline-block" }} /> Web pages <strong style={{ marginLeft: "auto" }}>3</strong></div>
                <span className="source-ready"><i /> All synced</span>
              </div>
            </div>
            <button className="manage-sources" style={{ marginTop: 10 }} onClick={() => setActive("Knowledge sources")}>Manage sources <Icon name="arrow" size={14} /></button>
          </article>
        </section>

        <footer className="page-footer"><span>© 2026 Varikode AI</span><span><i className="footer-dot" /> All systems operational</span><span>Made for better conversations <span className="footer-heart">✳</span></span></footer>
      </main>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */
const DEFAULT_ASSISTANT = { name: "Varikode Assistant", logo: null };

function loadAssistant() {
  try {
    const saved = localStorage.getItem("assistant");
    return saved ? JSON.parse(saved) : DEFAULT_ASSISTANT;
  } catch {
    return DEFAULT_ASSISTANT;
  }
}

function buildDemoChats() {
  const now = Date.now();
  const min = 60 * 1000;
  return [
    {
      id: now - 1,
      title: "Do you have a 2BHK available?",
      who: "Visitor from website",
      status: "Resolved",
      updatedAt: now - 5 * min,
      messages: [
        { from: "user", text: "Do you have a 2BHK available?" },
        { from: "ai", text: "Yes! We have 2BHK units available. Would you like to book a viewing?" },
        { from: "user", text: "Yes please." },
        { from: "ai", text: "Great! Please share your preferred date and time and I will schedule it." },
      ],
    },
    {
      id: now - 2,
      title: "How do I book a viewing?",
      who: "Visitor from website",
      status: "Resolved",
      updatedAt: now - 22 * min,
      messages: [
        { from: "user", text: "How do I book a viewing?" },
        { from: "ai", text: "You can book a viewing right here. Tell me the property and a convenient time." },
      ],
    },
    {
      id: now - 3,
      title: "Can I talk to a real person?",
      who: "Visitor from website",
      status: "Handoff",
      updatedAt: now - 60 * min,
      messages: [
        { from: "user", text: "Can I talk to a real person?" },
        { from: "ai", text: "Sure, I'm connecting you to our team right now." },
      ],
    },
    {
      id: now - 4,
      title: "What is the price range in this area?",
      who: "Visitor from website",
      status: "Resolved",
      updatedAt: now - 180 * min,
      messages: [
        { from: "user", text: "What is the price range in this area?" },
        { from: "ai", text: "Prices in this area generally start from the mid range. Would you like specific listings?" },
      ],
    },
  ];
}

function loadChats() {
  try {
    const saved = localStorage.getItem("chats");
    const seeded = localStorage.getItem("chatsSeeded");
    if (saved) {
      const list = JSON.parse(saved);
      if (list.length > 0 || seeded) return list;
    }
  } catch {
    // ignore
  }
  const seed = buildDemoChats();
  persistChats(seed);
  try {
    localStorage.setItem("chatsSeeded", "1");
  } catch {
    // ignore
  }
  return seed;
}

function persistChats(list) {
  try {
    localStorage.setItem("chats", JSON.stringify(list));
  } catch {
    // storage full ya blocked
  }
}

export default function App() {
  const [active, setActive] = useState("Overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [assistant, setAssistant] = useState(loadAssistant);
  const [chats, setChats] = useState(loadChats);

  // Widget se aayi chat ko save/update karo
  const saveChat = (chat) => {
    setChats((prev) => {
      const exists = prev.some((c) => c.id === chat.id);
      const next = exists ? prev.map((c) => (c.id === chat.id ? chat : c)) : [chat, ...prev];
      persistChats(next);
      return next;
    });
  };

  const deleteChat = (id) => {
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      persistChats(next);
      return next;
    });
  };

  const saveAssistant = (data) => {
    setAssistant(data);
    try {
      localStorage.setItem("assistant", JSON.stringify(data));
    } catch {
      // storage full ya blocked: state me phir bhi update ho jayega
    }
  };

  return (
    <div className="app-shell">
      <Sidebar active={active} setActive={setActive} open={menuOpen} close={() => setMenuOpen(false)} />
      <div className="main-shell">
        <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>

        {active === "Chats" && <ChatHistory assistant={assistant} chats={chats} onDelete={deleteChat} />}
        {active === "Assistant settings" && <AssistantSettings assistant={assistant} onSave={saveAssistant} />}
        {active !== "Chats" && active !== "Assistant settings" && <Overview active={active} setActive={setActive} />}
      </div>
      <ChatWidget assistant={assistant} onSaveChat={saveChat} />
    </div>
  );
}
