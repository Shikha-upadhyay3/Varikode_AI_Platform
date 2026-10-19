import { useState } from "react";
import "./App.css";

const initialMessages = [
  {
    role: "assistant",
    text: "Hi! I’m your Varikode AI assistant. Ask me to analyze a document, answer a question, or help your customers.",
  },
];

const suggestions = [
  "Summarize a document",
  "How do I add a knowledge source?",
  "Draft a customer support reply",
];

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

function Sidebar({ active, setActive, open, close }) {
  const links = [
    { id: "Overview", icon: "grid" },
    { id: "Knowledge sources", icon: "book" },
    { id: "Embed center", icon: "code" },
    { id: "Assistant settings", icon: "sliders" },
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
            <div className="profile-avatar">S</div>
            <div className="profile-copy"><strong>Shivani Rao</strong><small>Admin</small></div>
            <button className="profile-menu" aria-label="Account menu">•••</button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Overview({ active }) {
  const [messages, setMessages] = useState(initialMessages);
  const [prompt, setPrompt] = useState("");

  const sendMessage = (value = prompt) => {
    const clean = value.trim();
    if (!clean) return;
    setMessages((current) => [
      ...current,
      { role: "user", text: clean },
      {
        role: "assistant",
        text: "I’m ready to help with that. Connect an AI provider in your project settings to enable live responses.",
      },
    ]);
    setPrompt("");
  };

  if (active !== "Overview") {
    const details = {
      "Knowledge sources": ["Knowledge sources", "Connect documents and websites so your assistant can answer with your content.", "Add a source"],
      "Embed center": ["Embed center", "Bring your AI assistant to your website with a simple embed.", "Get embed code"],
      "Assistant settings": ["Assistant settings", "Tune your assistant’s behavior, model, and appearance.", "Configure assistant"],
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
      <header className="topbar">
        <div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>Overview</strong></div>
        <div className="topbar-actions">
          <button className="icon-button" aria-label="Search"><Icon name="search" /></button>
          <button className="help-button">Help center <Icon name="arrow" size={14} /></button>
          <div className="top-avatar">S</div>
        </div>
      </header>

      <main className="main-content">
        <section className="welcome-row">
          <div>
            <div className="eyebrow"><span className="status-dot" /> YOUR AI WORKSPACE</div>
            <h1>Good evening, Shivani <span className="wave">✳</span></h1>
            <p className="welcome-subtitle">Here’s what’s happening with your AI assistant today.</p>
          </div>
          <button className="date-filter"><Icon name="clock" size={15} /> Last 30 days <span>⌄</span></button>
        </section>

        <section className="stats-grid" aria-label="Workspace statistics">
          <article className="stat-card">
            <div className="stat-top"><span>Total conversations</span><span className="stat-icon violet"><Icon name="bot" size={18} /></span></div>
            <div className="stat-value">2,847</div>
            <div className="stat-foot"><span className="trend">↗ 12.8%</span><span>vs. previous month</span></div>
            <div className="sparkline spark-violet"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          </article>
          <article className="stat-card">
            <div className="stat-top"><span>Messages answered</span><span className="stat-icon mint"><Icon name="send" size={17} /></span></div>
            <div className="stat-value">8,429</div>
            <div className="stat-foot"><span className="trend">↗ 8.2%</span><span>vs. previous month</span></div>
            <div className="sparkline spark-mint"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          </article>
          <article className="stat-card">
            <div className="stat-top"><span>Knowledge sources</span><span className="stat-icon amber"><Icon name="book" size={17} /></span></div>
            <div className="stat-value">08</div>
            <div className="stat-foot"><span className="stat-neutral">+2 added</span><span>this month</span></div>
            <div className="sparkline spark-amber"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          </article>
          <article className="stat-card">
            <div className="stat-top"><span>Resolution rate</span><span className="stat-icon blue"><Icon name="spark" size={18} /></span></div>
            <div className="stat-value">94.6<span className="stat-unit">%</span></div>
            <div className="stat-foot"><span className="trend">↗ 3.1%</span><span>vs. previous month</span></div>
            <div className="sparkline spark-blue"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel assistant-panel">
            <div className="panel-heading">
              <div><div className="panel-title">Assistant playground <span className="live-pill"><i /> LIVE</span></div><p>Try a conversation with your AI assistant</p></div>
              <button className="subtle-button"><Icon name="arrow" size={14} /> Open full chat</button>
            </div>
            <div className="chat-area">
              {messages.map((message, index) => (
                <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                  {message.role === "assistant" && <div className="assistant-avatar"><Icon name="spark" size={15} /></div>}
                  <div className="message-content">
                    <span className="message-name">{message.role === "assistant" ? "Varikode AI" : "You"} <small>{message.role === "assistant" ? "now" : "just now"}</small></span>
                    <div className="message-bubble">{message.text}</div>
                  </div>
                </div>
              ))}
              {messages.length === 1 && <div className="suggestions">{suggestions.map((item) => <button key={item} onClick={() => sendMessage(item)}>{item} <Icon name="arrow" size={13} /></button>)}</div>}
            </div>
            <form className="composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
              <button type="button" className="attach-button" aria-label="Add attachment"><Icon name="plus" /></button>
              <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask your assistant anything..." aria-label="Message your assistant" />
              <span className="composer-hint">↵</span>
              <button className="send-button" type="submit" aria-label="Send message"><Icon name="send" size={16} /></button>
            </form>
            <div className="chat-caption">AI can make mistakes. Check important information.</div>
          </article>

          <aside className="right-column">
            <article className="panel activity-panel">
              <div className="panel-heading compact"><div><div className="panel-title">Recent activity</div><p>What’s happening in your workspace</p></div><button className="dots-button" aria-label="More options">•••</button></div>
              <div className="activity-list">
                <div className="activity-item"><div className="activity-icon violet"><Icon name="file" size={16} /></div><div><strong>New source indexed</strong><p>Product documentation.pdf</p><small>12 minutes ago</small></div></div>
                <div className="activity-item"><div className="activity-icon mint"><Icon name="bot" size={16} /></div><div><strong>Assistant resolved a query</strong><p>“How do I reset my password?”</p><small>38 minutes ago</small></div></div>
                <div className="activity-item"><div className="activity-icon amber"><Icon name="book" size={16} /></div><div><strong>Knowledge base updated</strong><p>3 new pages synced</p><small>2 hours ago</small></div></div>
              </div>
              <button className="view-all">View all activity <Icon name="arrow" size={14} /></button>
            </article>

            <article className="panel sources-panel">
              <div className="panel-heading compact"><div><div className="panel-title">Your knowledge base</div><p>Content powering your assistant</p></div><button className="small-add" aria-label="Add knowledge source" onClick={() => {}}><Icon name="plus" size={17} /></button></div>
              <div className="source-total"><strong>8</strong><span>sources connected</span><span className="source-ready"><i /> All synced</span></div>
              <div className="source-types"><div><span className="source-type-icon doc"><Icon name="file" size={15} /></span><span>Documents</span><strong>5</strong></div><div><span className="source-type-icon web">↗</span><span>Web pages</span><strong>3</strong></div></div>
              <button className="manage-sources" onClick={() => {}}>Manage sources <Icon name="arrow" size={14} /></button>
            </article>
          </aside>
        </section>

        <footer className="page-footer"><span>© 2026 Varikode AI</span><span><i className="footer-dot" /> All systems operational</span><span>Made for better conversations <span className="footer-heart">✳</span></span></footer>
      </main>
    </>
  );
}

export default function App() {
  const [active, setActive] = useState("Overview");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar active={active} setActive={setActive} open={menuOpen} close={() => setMenuOpen(false)} />
      <div className="main-shell">
        <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
        <Overview active={active} />
      </div>
    </div>
  );
}