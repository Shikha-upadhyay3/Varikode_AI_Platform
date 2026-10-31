import { useEffect, useRef, useState } from "react";
import "./App.css";
import "./theme.css";
import ChatWidget from "./ChatWidget";
import { useAuth } from "./AuthContext";
import { supabase } from "./lib/supabaseClient";
import KnowledgeSources from "./KnowledgeSources";
import Leads from "./Leads";
import { useChats } from "./useChats";
import { useOverviewStats, pctChange } from "./useOverviewStats";
import UsageCard from "./components/billing/UsageCard";
import PricingPage from "./components/billing/PricingPage";
import { getPlan } from "./config/plans";
import CreditsBanner from "./CreditsBanner";

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
    trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></>,
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

function formatDate(value) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

const CHATBOT_COLUMNS =
  "id, organization_id, name, description, welcome_message, theme, status, created_at, updated_at, logo_url, collect_leads";
const LOGO_BUCKET = "chatbot-logos";

async function uploadChatbotLogo(chatbotId, file) {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${chatbotId}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
  if (error) throw error;
  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function logoPathFromUrl(url) {
  const marker = `/${LOGO_BUCKET}/`;
  const i = url ? url.indexOf(marker) : -1;
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

function useWorkspaceMembership() {
  const { user } = useAuth();
  const userId = user?.id;
  const [organization, setOrganization] = useState(null);
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;

    async function loadOrganization() {
      const { data, error: loadError } = await supabase
        .from("memberships")
        .select("role, organizations(id, name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1);

      if (cancelled) return;

      if (loadError) {
        setError(loadError.message);
        setOrganization(null);
        setRole("");
      } else if (data && data.length > 0 && data[0].organizations) {
        setOrganization(data[0].organizations);
        setRole(data[0].role);
      } else {
        setOrganization(null);
        setRole("");
      }

      setLoading(false);
    }

    loadOrganization();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return {
    organization,
    role,
    setOrganization,
    setRole,
    error,
    setError,
    loading,
    setLoading,
  };
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
  const top = Math.max(40, Math.ceil(max / 40) * 40);
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
  const top = Math.max(40, Math.ceil(Math.max(...data.map((d) => d.a + d.b)) / 40) * 40);
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
// Company logo from /public/logo.jpg. If the file is missing, the fallback is shown instead.
function LogoImage({ fallback = null }) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  return (
    <img
      src="/logo.jpg"
      alt="Varikode"
      onError={() => setFailed(true)}
      style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", borderRadius: "inherit" }}
    />
  );
}
/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */
function Sidebar({ active, setActive, open, close }) {
  const { user, signOut } = useAuth();
  const displayName = getDisplayName(user);

  /* ---------- Profile popup (Log out) ---------- */
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // Close the popup when clicking outside it or pressing Esc
  useEffect(() => {
    const onClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setProfileOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const handleLogout = async () => {
    setProfileOpen(false);
    await signOut();
  };

  const {
    organization,
    role,
    setOrganization,
    setRole,
    error: organizationError,
    setError: setOrganizationError,
    loading: loadingOrganization,
    setLoading: setLoadingOrganization,
  } = useWorkspaceMembership();
  const [organizationName, setOrganizationName] = useState("");
  const [creatingOrganization, setCreatingOrganization] = useState(false);

  async function handleCreateOrganization(event) {
    event.preventDefault();
    setOrganizationError("");
    setCreatingOrganization(true);

    const { data: organizationId, error } = await supabase.rpc(
      "create_organization",
      { org_name: organizationName.trim() }
    );

    if (error) {
      setOrganizationError(error.message);
    } else {
      const { data: createdOrganization, error: fetchError } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("id", organizationId)
        .single();

      if (fetchError) {
        setOrganizationError(fetchError.message);
      } else {
        setOrganization(createdOrganization);
        setRole("owner");
        setOrganizationName("");
      }
    }

    setCreatingOrganization(false);
    setLoadingOrganization(false);
  }

  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : "";
    const { stats: sidebarStats } = useOverviewStats(organization?.id, 30);
  const currentPlan = getPlan(organization?.plan ?? "free");
  const usedMessages = sidebarStats?.month_messages ?? 0;
  const resetsOn = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  const sourcesCount = sidebarStats?.knowledge_sources?.total ?? 0;

  const links = [
    { id: "Overview", icon: "grid" },
    { id: "Chatbots", icon: "bot" },
    { id: "Knowledge sources", icon: "book" },
    { id: "Embed center", icon: "code" },
    { id: "Assistant settings", icon: "sliders" },
    { id: "Chats", icon: "chat" },
    { id: "Leads", icon: "chat" },
  ];

  return (
    <>
      {open && <button className="mobile-scrim" onClick={close} aria-label="Close menu" />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <a className="brand" href="#overview" onClick={() => setActive("Overview")}>
          <span className="brand-mark" style={{ background: "#fff", boxShadow: "none", padding: 2 }}>
            <LogoImage fallback={<Icon name="spark" size={20} />} />
          </span>
          <span>Varikode<span className="brand-ai">.ai</span></span>
        </a>

        <div className="workspace-label">WORKSPACE</div>

        {loadingOrganization ? (
          <div className="workspace-card workspace-skeleton" aria-hidden="true" />
        ) : organization ? (
          <>
            <div className="workspace-card">
              <div className="workspace-avatar" style={{ background: "#fff", overflow: "hidden", padding: 2 }}>
                <LogoImage fallback={organization.name[0].toUpperCase()} />
              </div>
              <div className="workspace-copy">
                <strong>{organization.name}</strong>
                <small>{roleLabel}</small>
              </div>
            </div>
            {organizationError && <p className="org-error" role="alert">{organizationError}</p>}
          </>
        ) : (
          <form className="org-form" onSubmit={handleCreateOrganization}>
            <p className="org-help">Create your organization to get started.</p>
            <input
              className="org-input"
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder="Organization name"
              aria-label="Organization name"
              maxLength={60}
              required
            />
            <button className="org-button" type="submit" disabled={creatingOrganization}>
              {creatingOrganization ? "Creating..." : "Create organization"}
            </button>
            {organizationError && <p className="org-error" role="alert">{organizationError}</p>}
          </form>
        )}

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
              {link.id === "Knowledge sources" && <span className="nav-count">{sourcesCount}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom"> 
          <UsageCard
            planName={currentPlan.name}
            used={usedMessages}
            limit={currentPlan.messages ?? 0}
            resetsOn={resetsOn}
            onUpgrade={() => {
              setActive("Pricing");
              close();
            }}
          />

          {/* Profile row + popup with Log out */}
          <div className="profile-wrap" ref={profileRef}>
            {profileOpen && (
              <div className="profile-pop" role="menu">
                <div className="profile-pop-head">
                  <strong>{displayName}</strong>
                  <span>{user?.email}</span>
                </div>
                <button type="button" className="profile-pop-logout" role="menuitem" onClick={handleLogout}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <path d="M16 17l5-5-5-5" />
                    <path d="M21 12H9" />
                  </svg>
                  Log out
                </button>
              </div>
            )}

            <div
              className="profile"
              style={{ cursor: "pointer" }}
              onClick={() => setProfileOpen((v) => !v)}
            >
              <div className="profile-avatar">{displayName[0].toUpperCase()}</div>
              <div className="profile-copy">
                <strong className="profile-name">{displayName}</strong>
                <small>{roleLabel || "Member"}</small>
              </div>
              <button className="profile-menu" type="button" aria-label="Open profile menu">
                •••
              </button>
            </div>
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

function EmbedCenter({ organization }) {
  const [open, setOpen] = useState(false);
  const [chatbots, setChatbots] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [origins, setOrigins] = useState("");
  const [snippet, setSnippet] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedBot = chatbots.find((bot) => bot.id === selectedId);

  async function ensurePublicKey(bot) {
    if (bot.public_key) return bot.public_key;
    const publicKey = `pk_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const { data, error: updateError } = await supabase
      .from("chatbots")
      .update({ public_key: publicKey })
      .eq("id", bot.id)
      .select("id, name, status, public_key, allowed_origins")
      .single();
    if (updateError) throw updateError;
    setChatbots((current) => current.map((item) => item.id === data.id ? data : item));
    return data.public_key;
  }

  function makeSnippet(bot, publicKey) {
        // Always use the public (live) dashboard address, even when the code is copied from localhost
    const PRODUCTION_APP_URL = "https://varikode-ai-platform-cia6.vercel.app";
    const appBase = ["localhost", "127.0.0.1"].includes(window.location.hostname)
      ? PRODUCTION_APP_URL
      : window.location.origin;
    const scriptUrl = new URL("/embed.js", appBase).toString();
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-chat`;
    return `<script src="${scriptUrl}" data-bot-key="${publicKey}" data-api="${apiUrl}" data-title="${bot.name}" defer></script>`;
  }

  async function openEmbedSetup() {
    setOpen(true);
    setLoading(true);
    setError("");
    setNotice("");
    const { data, error: loadError } = await supabase
      .from("chatbots")
      .select("id, name, status, public_key, allowed_origins")
      .eq("organization_id", organization.id)
      .eq("status", "published")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (loadError) {
      setError(loadError.message);
      return;
    }
    setChatbots(data || []);
    if (!data?.length) {
      setSelectedId("");
      setSnippet("");
      setError("No published chatbot found. Publish a chatbot first, then return here.");
      return;
    }

    const bot = data[0];
    setSelectedId(bot.id);
    setOrigins(bot.allowed_origins || "");
    try {
      const publicKey = await ensurePublicKey(bot);
      setSnippet(makeSnippet(bot, publicKey));
    } catch (keyError) {
      setError(keyError.message || "Could not prepare a public key for this chatbot.");
    }
  }

  async function selectBot(botId) {
    setSelectedId(botId);
    setSnippet("");
    setError("");
    const bot = chatbots.find((item) => item.id === botId);
    if (!bot) return;
    setOrigins(bot.allowed_origins || "");
    try {
      const publicKey = await ensurePublicKey(bot);
      setSnippet(makeSnippet(bot, publicKey));
    } catch (keyError) {
      setError(keyError.message || "Could not prepare a public key for this chatbot.");
    }
  }

  async function saveOrigins() {
    setError("");
    setNotice("");
    const values = origins.split(",").map((value) => value.trim()).filter(Boolean);
    if (!values.length) {
      setError("Enter at least one allowed website origin, such as https://example.com.");
      return;
    }
    try {
      for (const value of values) {
        const url = new URL(value);
        if (!/^https?:$/.test(url.protocol) || url.origin !== value) throw new Error();
      }
    } catch {
      setError("Use website origins only, e.g. https://example.com (no page path). Separate multiple origins with commas.");
      return;
    }

    setSaving(true);
    const { data, error: saveError } = await supabase
      .from("chatbots")
      .update({ allowed_origins: values.join(",") })
      .eq("id", selectedId)
      .select("id, name, status, public_key, allowed_origins")
      .single();
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setChatbots((current) => current.map((item) => item.id === data.id ? data : item));
    setNotice("Allowed websites saved.");
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setNotice("Embed code copied.");
    } catch {
      setError("Clipboard access failed. Select and copy the code manually.");
    }
  }

  return (
    <>
      <Topbar title="Embed center" />
      <main className="main-content">
        <section className="welcome-row">
          <div>
            <div className="eyebrow">VARIKODE AI PLATFORM</div>
            <h1>Embed center</h1>
            <p className="welcome-subtitle">Bring your AI assistant to your website with a simple embed.</p>
          </div>
          <button className="primary-button" type="button" onClick={openEmbedSetup} disabled={!organization?.id}>
            <Icon name="plus" size={16} /> Get embed code
          </button>
        </section>
      </main>

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="panel chatbot-modal" role="dialog" aria-modal="true" aria-labelledby="embed-modal-title">
            <div className="modal-head">
              <div><div className="eyebrow">WEBSITE INSTALLATION</div><h2 id="embed-modal-title">Get embed code</h2></div>
              <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close dialog">×</button>
            </div>
            {loading ? <p>Loading published chatbots…</p> : chatbots.length > 0 && (
              <>
                <label className="field-label" htmlFor="embed-chatbot">Published chatbot</label>
                <select id="embed-chatbot" className="chatbot-input" value={selectedId} onChange={(event) => selectBot(event.target.value)}>
                  {chatbots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
                </select>
                <label className="field-label" htmlFor="allowed-origins">Allowed website origins</label>
                <input id="allowed-origins" className="chatbot-input" value={origins} onChange={(event) => setOrigins(event.target.value)} placeholder="https://example.com" />
                <p className="chatbot-help">Enter exact website origins (not page paths). For local testing, use {window.location.origin}.</p>
                <div className="modal-actions">
                  <button className="subtle-button" type="button" onClick={saveOrigins} disabled={saving || !selectedBot}>{saving ? "Saving…" : "Save websites"}</button>
                </div>
                {snippet && <>
                  <label className="field-label" htmlFor="embed-snippet">Website embed code</label>
                  <textarea id="embed-snippet" className="chatbot-input" rows={4} readOnly value={snippet} />
                  <div className="modal-actions"><button className="primary-button" type="button" onClick={copySnippet}>Copy code</button></div>
                </>}
              </>
            )}
            {error && <p className="modal-error" role="alert">{error}</p>}
            {notice && <p className="notice success" role="status">{notice}</p>}
            <p className="chatbot-help">The script URL uses this dashboard host. A customer website can load it only after the dashboard is deployed publicly; localhost works for local testing.</p>
          </section>
        </div>
      )}
    </>
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
/* Chatbot management                                                  */
/* ------------------------------------------------------------------ */


const EMPTY_CHATBOT_FORM = {
  
  name: "",
  description: "",
  welcome_message: "",
  theme: "ocean",
  collect_leads: true,
};
const MAX_CHATBOTS_PER_ORG = 1;

function ChatbotManagement() {
  const {
    organization,
    role,
    error: organizationError,
    loading: loadingOrganization,
  } = useWorkspaceMembership();
  const [chatbots, setChatbots] = useState([]);
  const [loadingChatbots, setLoadingChatbots] = useState(false);
  const [chatbotError, setChatbotError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_CHATBOT_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [removeLogo, setRemoveLogo] = useState(false);

  const canManage = role === "owner" || role === "admin";
  const limitReached = chatbots.length >= MAX_CHATBOTS_PER_ORG;

  function handleLogoPick(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setFormError("Logo must be a PNG, JPG or WebP image.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setFormError("Logo must be smaller than 1 MB.");
      return;
    }
    setFormError("");
    setLogoFile(file);
    setRemoveLogo(false);
    setLogoPreview(URL.createObjectURL(file));
  }

  function clearLogo() {
    setLogoFile(null);
    setLogoPreview("");
    setRemoveLogo(true);
  }

  useEffect(() => {
    if (!organization?.id) {
      return;
    }

    let cancelled = false;

    async function loadChatbots() {
      setLoadingChatbots(true);
      setChatbotError("");

      const { data, error } = await supabase
        .from("chatbots")
        .select(CHATBOT_COLUMNS)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        setChatbotError(error.message);
        setChatbots([]);
      } else {
        setChatbots(data || []);
      }

      setLoadingChatbots(false);
    }

    loadChatbots();
    return () => {
      cancelled = true;
    };
  }, [organization?.id]);

  const filteredChatbots = chatbots.filter((chatbot) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      chatbot.name.toLowerCase().includes(query) ||
      (chatbot.description || "").toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" || chatbot.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  function openCreateForm() {
    
  if (limitReached) {
    setSuccess("");
    setChatbotError("Each workspace can have only one chatbot. Edit or delete the existing chatbot to create a new one.");
    return;
  }
  setChatbotError("");
  setEditing(null);
  setForm(EMPTY_CHATBOT_FORM);
  setLogoFile(null);
  setLogoPreview("");
  setRemoveLogo(false);
  setFormError("");
  setSuccess("");
  setFormOpen(true);
}

  function openEditForm(chatbot) {
    setEditing(chatbot);
    setForm({
      name: chatbot.name || "",
      description: chatbot.description || "",
      welcome_message: chatbot.welcome_message || "",
      theme: chatbot.theme || "ocean",
      collect_leads: chatbot.collect_leads ?? true,
    });
    setLogoFile(null);
    setLogoPreview(chatbot.logo_url || "");
    setRemoveLogo(false);
    setFormError("");
    setSuccess("");
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
    setFormError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");
    setSuccess("");

    const name = form.name.trim();
    if (!name) {
      setFormError("Chatbot name is required.");
      return;
    }

    if (!organization?.id) {
      setFormError("Create an organization before managing chatbots.");
      return;
    }

    if (!canManage) {
      setFormError("Owner or admin permissions are required.");
      return;
    }

    const duplicate = chatbots.some(
      (chatbot) =>
        chatbot.id !== editing?.id &&
        chatbot.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      setFormError("A chatbot with this name already exists in this workspace.");
      return;
    }
    // new one chatbot per workspace
    if (!editing) {
  if (chatbots.length >= MAX_CHATBOTS_PER_ORG) {
    setFormError("Each workspace can have only one chatbot.");
    return;
  }

  //  confirm from DB 
  const { count, error: countError } = await supabase
    .from("chatbots")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organization.id);

  if (countError) {
    setFormError(countError.message);
    return;
  }
  if ((count ?? 0) >= MAX_CHATBOTS_PER_ORG) {
    setFormError("Each workspace can have only one chatbot.");
    return;
  }
}

    setSaving(true);

    const payload = {
      name,
      description: form.description.trim() || null,
      welcome_message: form.welcome_message.trim() || null,
      theme: form.theme,
      collect_leads: form.collect_leads,
    };

    const result = editing
      ? await supabase
          .from("chatbots")
          .update(payload)
          .eq("id", editing.id)
          .select(CHATBOT_COLUMNS)
          .single()
      : await supabase
          .from("chatbots")
          .insert({
            ...payload,
            organization_id: organization.id,
            status: "draft",
          })
          .select(CHATBOT_COLUMNS)
          .single();

    if (result.error) {
  setSaving(false);
  setFormError(
    result.error.code === "23505"
      ? "Each workspace can have only one chatbot."
      : result.error.message
  );
  return;
}

    let savedBot = result.data;
    let logoWarning = "";

    if (logoFile || removeLogo) {
      try {
        const nextUrl = logoFile ? await uploadChatbotLogo(savedBot.id, logoFile) : null;
        const { data: withLogo, error: logoError } = await supabase
          .from("chatbots")
          .update({ logo_url: nextUrl })
          .eq("id", savedBot.id)
          .select(CHATBOT_COLUMNS)
          .single();
        if (logoError) throw logoError;
        const oldPath = logoPathFromUrl(savedBot.logo_url);
        if (oldPath) await supabase.storage.from(LOGO_BUCKET).remove([oldPath]);
        savedBot = withLogo;
      } catch (logoErr) {
        logoWarning = ` The logo could not be saved: ${logoErr.message}`;
      }
    }

    setSaving(false);
    setChatbots((current) =>
      editing
        ? current.map((chatbot) => (chatbot.id === savedBot.id ? savedBot : chatbot))
        : [savedBot, ...current]
    );
    setFormOpen(false);
    setEditing(null);
    setSuccess((editing ? "Chatbot updated." : "Chatbot created.") + logoWarning);
  }

  async function toggleStatus(chatbot) {
    if (!canManage) return;

    const nextStatus = chatbot.status === "published" ? "draft" : "published";
    setBusyId(chatbot.id);
    setChatbotError("");
    setSuccess("");

    const { data, error } = await supabase
      .from("chatbots")
      .update({ status: nextStatus })
      .eq("id", chatbot.id)
      .select(CHATBOT_COLUMNS)
      .single();

    setBusyId(null);

    if (error) {
      setChatbotError(error.message);
      return;
    }

    setChatbots((current) => current.map((item) => (item.id === data.id ? data : item)));
    setSuccess(nextStatus === "published" ? "Chatbot published." : "Chatbot unpublished.");
  }

  async function deleteChatbot(chatbot) {
    if (!canManage) return;

    const confirmed = window.confirm(`Delete "${chatbot.name}"? This cannot be undone.`);
    if (!confirmed) return;

    setBusyId(chatbot.id);
    setChatbotError("");
    setSuccess("");

    const { error } = await supabase
      .from("chatbots")
      .delete()
      .eq("id", chatbot.id);

    setBusyId(null);

    if (error) {
      setChatbotError(error.message);
      return;
    }

    setChatbots((current) => current.filter((item) => item.id !== chatbot.id));
    setSuccess("Chatbot deleted.");
  }

  const showEmptySearch = !loadingChatbots && chatbots.length > 0 && filteredChatbots.length === 0;

  return (
    <>
      <Topbar title="Chatbots" />
      <main className="main-content">
        <section className="welcome-row chatbot-heading">
          <div>
            <div className="eyebrow"><span className="status-dot" /> CHATBOT MANAGEMENT</div>
            <h1>Chatbots</h1>
            <p className="welcome-subtitle">Create, publish, and manage the assistants available to your workspace.</p>
          </div>
          <button
  className="primary-button"
  type="button"
  onClick={openCreateForm}
  disabled={!canManage || !organization || loadingChatbots || limitReached}
  title={limitReached ? "One chatbot per workspace is allowed" : undefined}
>
  <Icon name="plus" size={16} />
  Create chatbot
</button>
{limitReached && (
  <p
    style={{
      margin: "8px 0 0",
      fontSize: "10px",
      color: "#8fa3bf",
      maxWidth: "260px",
      lineHeight: 1.4,
    }}
  >
    Your workspace already has a chatbot. Edit or delete it to create a new one.
  </p>
)}
        </section>

        {(organizationError || chatbotError || success || (!loadingOrganization && organization && !canManage)) && (
          <div className="chatbot-notices" aria-live="polite">
            {organizationError && <p className="notice error">{organizationError}</p>}
            {chatbotError && <p className="notice error">{chatbotError}</p>}
            {success && <p className="notice success">{success}</p>}
            {!loadingOrganization && organization && !canManage && (
              <p className="notice">You can view chatbots. Owner or admin permissions are required to make changes.</p>
            )}
          </div>
        )}

        {loadingOrganization ? (
          <article className="panel chatbot-empty">
            <span className="chatbot-empty-icon"><Icon name="bot" size={24} /></span>
            <strong>Loading workspace</strong>
            <p>Checking your organization membership.</p>
          </article>
        ) : !organization ? (
          <article className="panel chatbot-empty">
            <span className="chatbot-empty-icon"><Icon name="bot" size={24} /></span>
            <strong>Create an organization first</strong>
            <p>Your chatbots are scoped to an organization. Use the workspace card in the sidebar to create one.</p>
          </article>
        ) : (
          <>
            <section className="chatbot-toolbar">
              <label className="chatbot-search">
                <Icon name="search" size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search chatbots"
                  aria-label="Search chatbots"
                />
              </label>

              <div className="chatbot-filters" aria-label="Filter chatbots by status">
                {["all", "published", "draft"].map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={statusFilter === status ? "active" : ""}
                    onClick={() => setStatusFilter(status)}
                  >
                    {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </section>

            {loadingChatbots ? (
              <section className="chatbot-grid" aria-label="Loading chatbots">
                {[0, 1, 2].map((item) => (
                  <article className="panel chatbot-card chatbot-card-skeleton" key={item} />
                ))}
              </section>
            ) : chatbots.length === 0 ? (
              <article className="panel chatbot-empty">
                <span className="chatbot-empty-icon"><Icon name="bot" size={24} /></span>
                <strong>No chatbots yet</strong>
                <p>Create your first chatbot, keep it as a draft while configuring it, then publish when it is ready.</p>
                <button className="primary-button" type="button" onClick={openCreateForm} disabled={!canManage}>
                  <Icon name="plus" size={16} />
                  Create chatbot
                </button>
              </article>
            ) : showEmptySearch ? (
              <article className="panel chatbot-empty">
                <span className="chatbot-empty-icon"><Icon name="search" size={24} /></span>
                <strong>No matching chatbots</strong>
                <p>Try a different search term or status filter.</p>
              </article>
            ) : (
              <section className="chatbot-grid" aria-label="Chatbots">
                {filteredChatbots.map((chatbot) => (
                  <article className="panel chatbot-card" key={chatbot.id}>
                    <div className="chatbot-card-top">
                      <span className="chatbot-avatar">
                        {chatbot.logo_url ? (
                          <img
                            src={chatbot.logo_url}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                          />
                        ) : (
                          <Icon name="bot" size={18} />
                        )}
                      </span>
                      <span className={`chatbot-status ${chatbot.status}`}>{chatbot.status}</span>
                    </div>
                    <h2>{chatbot.name}</h2>
                    <p>{chatbot.description || "No description added yet."}</p>
                    <dl>
                      <div>
                        <dt>Created</dt>
                        <dd>{formatDate(chatbot.created_at)}</dd>
                      </div>
                      <div>
                        <dt>Theme</dt>
                        <dd>{chatbot.theme}</dd>
                      </div>
                    </dl>
                    {chatbot.welcome_message && (
                      <blockquote>{chatbot.welcome_message}</blockquote>
                    )}
                    <div className="chatbot-actions">
                      <button className="subtle-button" type="button" onClick={() => openEditForm(chatbot)} disabled={!canManage || busyId === chatbot.id}>
                        Edit
                      </button>
                      <button className="subtle-button" type="button" onClick={() => toggleStatus(chatbot)} disabled={!canManage || busyId === chatbot.id}>
                        {chatbot.status === "published" ? "Unpublish" : "Publish"}
                      </button>
                      <button className="subtle-button danger" type="button" onClick={() => deleteChatbot(chatbot)} disabled={!canManage || busyId === chatbot.id}>
                        <Icon name="trash" size={14} />
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </main>

      {formOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeForm}>
          <form className="chatbot-modal panel" onSubmit={handleSubmit} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">{editing ? "EDIT CHATBOT" : "NEW CHATBOT"}</div>
                <h2>{editing ? "Update chatbot" : "Create chatbot"}</h2>
              </div>
              <button type="button" className="icon-button" onClick={closeForm} aria-label="Close dialog">x</button>
            </div>

            <label className="field-label" htmlFor="chatbot-name">Chatbot name</label>
            <input
              id="chatbot-name"
              className="chatbot-input"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Sales concierge"
              maxLength={80}
              required
            />

            <label className="field-label" htmlFor="chatbot-description">Description</label>
            <textarea
              id="chatbot-description"
              className="chatbot-input"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Handles product questions and routes high-intent leads."
              maxLength={280}
              rows={3}
            />

            <label className="field-label" htmlFor="chatbot-welcome">Welcome message</label>
            <textarea
              id="chatbot-welcome"
              className="chatbot-input"
              value={form.welcome_message}
              onChange={(event) => setForm((current) => ({ ...current, welcome_message: event.target.value }))}
              placeholder="Hi, I can help you find the right solution today."
              maxLength={360}
              rows={3}
            />

            <label className="field-label" htmlFor="chatbot-theme">Appearance theme</label>
            <select
              id="chatbot-theme"
              className="chatbot-input"
              value={form.theme}
              onChange={(event) => setForm((current) => ({ ...current, theme: event.target.value }))}
            >
              <option value="ocean">Ocean</option>
              <option value="slate">Slate</option>
              <option value="mint">Mint</option>
              <option value="violet">Violet</option>
            </select>

            <label className="field-label" htmlFor="chatbot-logo">Chatbot logo</label>
            <div className="logo-picker">
              <span className="logo-preview">
                {logoPreview ? <img src={logoPreview} alt="" /> : <Icon name="bot" size={22} />}
              </span>
              <div>
                <input
                  id="chatbot-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoPick}
                />
                {logoPreview && (
                  <button type="button" className="subtle-button" onClick={clearLogo}>
                    Remove logo
                  </button>
                )}
                <small>PNG, JPG or WebP, up to 1 MB. Shown on the chat button and header.</small>
              </div>
            </div>

            <label className="check-row">
              <input
                type="checkbox"
                checked={form.collect_leads}
                onChange={(event) =>
                  setForm((current) => ({ ...current, collect_leads: event.target.checked }))
                }
              />
              Ask visitors for name, email and phone before chatting (all optional)
            </label>

            {formError && <p className="modal-error" role="alert">{formError}</p>}

            <div className="modal-actions">
              <button type="button" className="subtle-button" onClick={closeForm} disabled={saving}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Saving..." : editing ? "Save changes" : "Create chatbot"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
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
function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  if (h >= 17 && h < 21) return "Good evening";
  return "Good night";
}

function Overview({ active, setActive }) {
  const { user } = useAuth();
  const { organization } = useWorkspaceMembership();
  const firstName = getDisplayName(user).split(/[ @]/)[0];
    const greeting = getGreeting();
    const { stats } = useOverviewStats(organization?.id, 30);

  const daily = (stats?.daily ?? []).map((d) => d.count);
    const areaData = (stats?.daily ?? []).map((d) => ({
    label: new Date(d.day + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: d.count,
  }));
  const sparkOf = (arr) => (arr.length >= 2 ? arr.slice(-12) : [0, 0]);
  const convChange = stats ? pctChange(stats.conversations.current, stats.conversations.previous) : null;
  const msgChange = stats ? pctChange(stats.messages_answered.current, stats.messages_answered.previous) : null;
  const fmtChange = (v) => (v === null ? "New" : `${v >= 0 ? "↗" : "↘"} ${Math.abs(v)}%`);
  const sourcesTotal = stats?.knowledge_sources?.total ?? 0;
  const MONTHLY_LIMIT = 10000;
  const monthMessages = stats?.month_messages ?? 0;
    const resolvedN = stats?.outcomes?.resolved ?? 0;
  const handoffN = stats?.outcomes?.handoff ?? 0;
  const outcomeTotal = resolvedN + handoffN;
  const resRate = outcomeTotal ? Math.round((resolvedN / outcomeTotal) * 1000) / 10 : 0;
  const prevRes = stats?.outcomes?.prev_resolved ?? 0;
  const prevTotal = prevRes + (stats?.outcomes?.prev_handoff ?? 0);
  const prevRate = prevTotal ? (prevRes / prevTotal) * 100 : 0;
  const resChange = prevTotal ? pctChange(resRate, prevRate) : null;
  const barData = (stats?.daily ?? []).slice(-14).map((d) => ({
    label: new Date(d.day + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    a: d.resolved,
    b: d.handoff,
  }));

  if (active === "Embed center") {
    return <EmbedCenter organization={organization} />;
  }

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
            <h1>{greeting}, {firstName}<span className="wave">✳</span></h1>
            <p className="welcome-subtitle">Here’s what’s happening with your AI assistant today.</p>
          </div>
          <button className="date-filter"><Icon name="clock" size={15} /> Last 30 days <span>⌄</span></button>
        </section>

        {/* Stat cards with line graphs */}
        <section className="stats-grid" aria-label="Workspace statistics">
          <article className="stat-card">
            <div className="stat-top"><span>Total conversations</span><span className="stat-icon violet"><Icon name="bot" size={18} /></span></div>
            <div className="stat-value">{stats ? stats.conversations.current.toLocaleString() : "…"}</div>
<div className="stat-foot"><span className="trend">{fmtChange(convChange)}</span><span>vs. previous month</span></div>
            <Spark id="conv" color="#3aa0ff" data={sparkOf(daily)} />
          </article>
          <article className="stat-card">
            <div className="stat-top"><span>Messages answered</span><span className="stat-icon mint"><Icon name="send" size={17} /></span></div>
            <div className="stat-value">{stats ? stats.messages_answered.current.toLocaleString() : "…"}</div>
<div className="stat-foot"><span className="trend">{fmtChange(msgChange)}</span><span>vs. previous month</span></div>
            <Spark id="conv" color="#3aa0ff" data={sparkOf(daily)} />
          </article>
          <article className="stat-card">
            <div className="stat-top"><span>Knowledge sources</span><span className="stat-icon amber"><Icon name="book" size={17} /></span></div>
            <div className="stat-value">{String(sourcesTotal).padStart(2, "0")}</div>
<div className="stat-foot"><span className="stat-neutral">+{stats?.knowledge_sources?.added_this_month ?? 0} added</span><span>this month</span></div>

          </article>
          <article className="stat-card">
            <div className="stat-top"><span>Resolution rate</span><span className="stat-icon blue"><Icon name="spark" size={18} /></span></div>
            <div className="stat-foot"><span className="trend">{fmtChange(resChange)}</span><span>vs. previous month</span></div>
<Spark id="res" color="#60a5fa" data={sparkOf((stats?.daily ?? []).map((d) => d.resolved))} />

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
              {areaData.length >= 2 ? <AreaChart data={areaData} /> : null}
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
              {barData.length >= 2 ? <StackedBars data={barData} /> : null}
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
              <Gauge value={resRate} />
              <div style={{ display: "flex", justifyContent: "space-around", marginTop: 14, textAlign: "center" }}>
                <div><strong style={{ display: "block", fontSize: 16 }}>{outcomeTotal.toLocaleString()}</strong><span style={{ fontSize: 11, color: AXIS_TEXT }}>chats</span></div>
                <div><strong style={{ display: "block", fontSize: 16 }}>{resolvedN.toLocaleString()}</strong><span style={{ fontSize: 11, color: AXIS_TEXT }}>resolved</span></div>
                <div><strong style={{ display: "block", fontSize: 16 }}>{handoffN.toLocaleString()}</strong><span style={{ fontSize: 11, color: AXIS_TEXT }}>handoff</span></div>
              </div>
            </div>
          </article>

          <article className="panel activity-panel">
            <div className="panel-heading compact"><div><div className="panel-title">Recent activity</div><p>What’s happening in your workspace</p></div><button className="dots-button" aria-label="More options">•••</button></div>
            <div className="activity-list">
  {(stats?.recent_conversations ?? []).map((c) => (
    <div className="activity-item" key={c.id}>
      <div className="activity-icon mint"><Icon name="bot" size={16} /></div>
      <div>
        <strong>New conversation</strong>
        <p>“{c.title}”</p>
        <small>{new Date(c.created_at).toLocaleString()}</small>
      </div>
    </div>
  ))}
  {(stats?.recent_sources ?? []).slice(0, 2).map((s) => (
    <div className="activity-item" key={s.id}>
      <div className="activity-icon violet"><Icon name="file" size={16} /></div>
      <div>
        <strong>Knowledge source added</strong>
        <p>{s.title}</p>
        <small>{new Date(s.created_at).toLocaleString()}</small>
      </div>
    </div>
  ))}
  {stats && !stats.recent_conversations?.length && !stats.recent_sources?.length && (
    <div className="activity-item">
      <div>
        <strong>No activity yet</strong>
        <p>Chats and new sources will appear here.</p>
      </div>
    </div>
  )}
</div>
          </article>

          <article className="panel sources-panel">
            <div className="panel-heading compact"><div><div className="panel-title">Your knowledge base</div><p>Content powering your assistant</p></div><button className="small-add" aria-label="Add knowledge source" onClick={() => setActive("Knowledge sources")}><Icon name="plus" size={17} /></button></div>
            <div className="chart-body" style={{ display: "flex", alignItems: "center", gap: 18, paddingBottom: 8 }}>
              <Donut total={sourcesTotal || 1} parts={[{ label: "Sources", value: sourcesTotal, color: "#1e90ff" }]} />
              
              <div style={{ display: "grid", gap: 10, fontSize: 12, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: "#1e90ff", display: "inline-block" }} /> Sources <strong style={{ marginLeft: "auto" }}>{sourcesTotal}</strong></div>
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
    // storage full or blocked
  }
}
function KnowledgeSourcesPage() {
  const { organization, role, error, loading } = useWorkspaceMembership();

  return (
    <KnowledgeSources
      topbar={<Topbar title="Knowledge sources" />}
      organization={organization}
      role={role}
      orgError={error}
      loadingOrg={loading}
    />
  );
}
/* ------------------------------------------------------------------ */
/* Mobile navigation: horizontal menu bar shown only on phones         */
/* ------------------------------------------------------------------ */
const MOBILE_LINKS = [
  { id: "Overview", icon: "grid" },
  { id: "Chatbots", icon: "bot" },
  { id: "Knowledge sources", icon: "book" },
  { id: "Embed center", icon: "code" },
  { id: "Assistant settings", icon: "sliders" },
  { id: "Chats", icon: "chat" },
  { id: "Leads", icon: "chat" },
];

const mobileTabsCss = `
.mobile-tabs { display: none; }
@media (max-width: 900px) {
  .mobile-tabs {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 10px 12px;
    position: sticky;
    top: 0;
    z-index: 50;
    background: #0b1220;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .mobile-tabs::-webkit-scrollbar { display: none; }
  .mobile-tabs button {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.05);
    color: #cbd5e1;
    font-size: 13px;
    white-space: nowrap;
    cursor: pointer;
  }
  .mobile-tabs button.active {
    background: #1e90ff;
    border-color: #1e90ff;
    color: #fff;
  }
}
`;

function MobileTabs({ active, setActive }) {
  return (
    <>
      <style>{mobileTabsCss}</style>
      <nav className="mobile-tabs" aria-label="Mobile navigation">
        {MOBILE_LINKS.map((link) => (
          <button
            key={link.id}
            type="button"
            className={active === link.id ? "active" : ""}
            onClick={() => setActive(link.id)}
          >
            <Icon name={link.icon} size={15} />
            {link.id}
          </button>
        ))}
      </nav>
    </>
  );
}
function LeadsPage() {
  const { organization, role } = useWorkspaceMembership();
  return <Leads topbar={<Topbar title="Leads" />} organization={organization} role={role} />;
}

export default function App() {
  const { organization } = useWorkspaceMembership();
  const { chats, loading: loadingChats, error: chatsError, reload: reloadChats } = useChats(organization?.id);
  const [active, setActive] = useState("Overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [assistant, setAssistant] = useState(loadAssistant);
 // const [chats, setChats] = useState(loadChats);

  // Delete a conversation from Supabase, then reload the chat list
  const deleteChat = async (id) => {
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) {
      window.alert(error.message);
      return;
    }
    reloadChats();
  };

  const saveAssistant = (data) => {
    setAssistant(data);
    try {
      localStorage.setItem("assistant", JSON.stringify(data));
    } catch {
   // Storage full or blocked: The state will still be updated
    }
  };

  return (
    <div className="app-shell">
      <Sidebar active={active} setActive={setActive} open={menuOpen} close={() => setMenuOpen(false)} />
      <div className="main-shell">
        <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
                <MobileTabs active={active} setActive={setActive} />

                        {active !== "Pricing" && (
          <CreditsBanner
            organizationId={organization?.id}
            limit={getPlan(organization?.plan ?? "free").messages ?? 0}
            onUpgrade={() => setActive("Pricing")}
          />
        )}

        {active === "Chatbots" && <ChatbotManagement />}
        {active === "Chats" && <ChatHistory assistant={assistant} chats={chats} onDelete={deleteChat} />}
        {active === "Leads" && <LeadsPage />}
        {active === "Assistant settings" && <AssistantSettings assistant={assistant} onSave={saveAssistant} />}
        {active === "Knowledge sources" && <KnowledgeSourcesPage />}
        {active === "Pricing" && (
          <>
            <Topbar title="Pricing" />
            <PricingPage currentPlanId={organization?.plan ?? "free"} currency="INR" />
          </>
        )}
        {active !== "Chatbots" && active !== "Knowledge sources" && active !== "Chats" && active !== "Leads" && active !== "Assistant settings" && active !== "Pricing" && <Overview active={active} setActive={setActive} />}
      
      </div>
        <ChatWidget organizationId={organization?.id} assistant={assistant} onMessageSaved={reloadChats} />
    </div>
  );
}
