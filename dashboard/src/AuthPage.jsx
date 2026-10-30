import { useState } from "react";
import { useAuth } from "./AuthContext";
import "./auth.css";

/* =====================================================
   Logo component
   Inline SVG "V" mark + "varikode.ai" text.
   `size` controls the overall scale (used in hero & card).
   ===================================================== */
const Logo = ({ size = 64 }) => (
  <div className="logo">
    <svg width={size * 0.95} height={size * 0.85} viewBox="0 0 64 56" aria-hidden="true">
      <defs>
        {/* Two gradients to mimic the two-tone V logo */}
        <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f6bff" />
          <stop offset="1" stopColor="#12b6ff" />
        </linearGradient>
        <linearGradient id="lg2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#12c8ff" />
          <stop offset="1" stopColor="#19e0d2" />
        </linearGradient>
      </defs>
      <polygon points="2,4 20,4 34,40 25,54" fill="url(#lg1)" />
      <polygon points="62,4 43,4 32,28 38,40" fill="url(#lg2)" />
    </svg>
    <div className="logo-text" style={{ fontSize: size * 0.62 }}>
      varikode<span>.ai</span>
    </div>
  </div>
);

/* =====================================================
   Svg helper
   Wrapper so every icon shares the same stroke style.
   Pass the icon's <path> / <circle> elements as children.
   ===================================================== */
const Svg = ({ children, ...p }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    {children}
  </svg>
);

/* =====================================================
   Feature list shown on the left side.
   t = title, s = short description,
   c = icon background colour class (see auth.css),
   i = SVG shapes for the icon.
   ===================================================== */
const features = [
  {
    t: "Web Development",
    s: "Modern, scalable and high-performance websites.",
    c: "c-blue",
    i: (
      <>
        <path d="M8 7l-5 5 5 5" />
        <path d="M16 7l5 5-5 5" />
        <path d="M14 4l-4 16" />
      </>
    ),
  },
  {
    t: "Shopify Solutions",
    s: "Custom stores, themes and eCommerce support.",
    c: "c-teal",
    i: (
      <>
        <path d="M5 8h14l-1 12H6z" />
        <path d="M9 8a3 3 0 0 1 6 0" />
      </>
    ),
  },
  {
    t: "SEO & AI Visibility",
    s: "Rank higher, get discovered across AI search engines.",
    c: "c-purple",
    i: (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="M20 20l-4.5-4.5" />
      </>
    ),
  },
  {
    t: "AI Automation",
    s: "Smart solutions to save time and boost productivity.",
    c: "c-orange",
    i: (
      <>
        <rect x="7" y="7" width="10" height="10" rx="2" />
        <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
      </>
    ),
  },
  {
    t: "Custom Applications",
    s: "Tailored solutions for your unique needs.",
    c: "c-blue2",
    i: <path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 11a3.5 3.5 0 0 1-.5 7z" />,
  },
];

export default function AuthPage() {
  // Auth functions come from AuthContext (Supabase wrapper)
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth();

  /* ---------- Form state ---------- */
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  /* ---------- UI state ---------- */
  const [error, setError] = useState(""); // red error message
  const [info, setInfo] = useState(""); // green success message
  const [busy, setBusy] = useState(false); // disables button + shows spinner
  const [showPw, setShowPw] = useState(false); // show / hide password
  const [remember, setRemember] = useState(true); // "Remember me" checkbox (visual only for now)

  /* ---------- Email + password submit ---------- */
  const handleSubmit = async (e) => {
    e.preventDefault(); // stop the browser from reloading the page
    setError("");
    setInfo("");
    setBusy(true);

    // Call signIn or signUp depending on the current mode
    const { data, error } =
      mode === "login"
        ? await signIn(email, password)
        : await signUp(email, password, fullName);

    setBusy(false);

    // Show the error returned by Supabase (wrong password, etc.)
    if (error) return setError(error.message);

    // If email confirmation is ON, signup returns no session yet
    if (mode === "signup" && !data.session) {
      setInfo(
        "Your account has been created. Please check your email to confirm it, then log in."
      );
    }
  };

  /* ---------- Google sign-in ---------- */
  const handleGoogle = async () => {
    setError("");
    setInfo("");
    // Guard: function is missing if AuthContext was not updated yet
    if (!signInWithGoogle) return setError("Google login is not set up yet.");
    const { error } = await signInWithGoogle(); // redirects to Google on success
    if (error) setError(error.message);
  };

  /* ---------- Forgot password ---------- */
  const handleForgot = async () => {
    setError("");
    setInfo("");
    // The reset link is sent to the email typed in the form
    if (!email) return setError("Enter your email first, then click Forgot password.");
    if (!resetPassword) return setError("Password reset is not set up yet.");
    const { error } = await resetPassword(email);
    if (error) setError(error.message);
    else setInfo("Password reset link sent. Check your email.");
  };

  return (
    <div className="auth-shell">
      {/* ---------- Background decorations ---------- */}
      <div className="bg-dots" /> {/* dotted pattern, top-right */}
      <svg className="bg-wave" viewBox="0 0 800 300" preserveAspectRatio="none" aria-hidden="true">
        {/* three glowing wave lines, bottom-left */}
        <path d="M0 220 C150 150 260 280 420 200 S650 90 800 140" />
        <path d="M0 240 C160 180 270 290 430 220 S660 120 800 170" />
        <path d="M0 260 C170 210 280 300 440 240 S670 150 800 200" />
      </svg>

      {/* =====================================================
          LEFT SIDE: brand message, services, CTA, footer
          (hidden on screens smaller than 980px)
          ===================================================== */}
      <section className="auth-hero">
        {/* Top row: logo + handwritten tagline */}
        <header className="hero-top">
          <div>
            <Logo size={72} />
            <div className="logo-sub">
              TECHNOLOGY <b>|</b> AI <b>|</b> GROWTH
            </div>
          </div>
          <div className="script">
            Your Growth<br />Our Code
            <svg viewBox="0 0 120 20">
              <path d="M2 16 C40 4 80 4 118 2" />
            </svg>
          </div>
        </header>

        {/* Main headline (last line is orange) */}
        <h1>
          Build Better.<br />Grow Smarter.<br />
          <span className="grad">Get Discovered.</span>
        </h1>

        <p className="hero-sub">
          Varikode is a technology company that helps businesses build modern
          websites, powerful applications and AI-driven solutions. We turn your
          ideas into digital success.
        </p>

        {/* Service cards, generated from the `features` array above */}
        <div className="feat-grid">
          {features.map((f) => (
            <div className="feat" key={f.t}>
              <div className={`feat-ico ${f.c}`}>
                <Svg>{f.i}</Svg>
              </div>
              <div>
                <h4>{f.t}</h4>
                <p>{f.s}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Call-to-action bar linking to the company website */}
        <div className="cta-bar">
          <div className="cta-ico">
            <Svg>
              <path d="M5 19c1-4 3-6 6-8l6-6c2 4 2 8-2 12l-6 2z" />
              <path d="M9 15l-4 4" />
              <circle cx="14" cy="9" r="1.2" />
            </Svg>
          </div>
          <div className="cta-text">
            <b>Let's build something great together.</b>
            <span>Your ideas. Our expertise. Real results.</span>
          </div>
          <a
            href="https://www.varikode.com"
            target="_blank"
            rel="noreferrer"
            className="cta-link"
          >
            Explore Our Services
            <Svg width="16" height="16">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </Svg>
          </a>
        </div>

        {/* Footer: website + official social links only */}
        <footer className="hero-foot">
          {/* Company website */}
          <a href="https://www.varikode.com" target="_blank" rel="noreferrer" className="site">
            <Svg width="18" height="18">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
            </Svg>
            www.varikode.com
          </a>

          <span className="vr" /> {/* thin vertical divider */}

          {/* LinkedIn (official company page) */}
          <a
            href="https://www.linkedin.com/company/varikodetechnology"
            target="_blank"
            rel="noreferrer"
            aria-label="LinkedIn"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3.4 6.5H5v9h2.4v-9zM6.2 5.8a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zM19 18.5v-5c0-2.4-1.3-3.6-3-3.6-1.3 0-2 .7-2.3 1.3V9.5h-2.4v9h2.4v-5c0-.8.4-1.6 1.4-1.6s1.5.7 1.5 1.7v4.9H19z" />
            </svg>
          </a>

          {/* Instagram (official company page) */}
          <a
            href="https://www.instagram.com/varikodetech"
            target="_blank"
            rel="noreferrer"
            aria-label="Instagram"
          >
            <Svg>
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
            </Svg>
          </a>
        </footer>
      </section>

      {/* =====================================================
          RIGHT SIDE: login / signup card
          ===================================================== */}
      <section className="auth-panel">
        <form className="auth-card" onSubmit={handleSubmit}>
          <Logo size={56} />

          {/* Heading changes with the current mode */}
          <h2>
            {mode === "login" ? (
              <>
                Welcome back <span className="wave">👋</span>
              </>
            ) : (
              "Create your account"
            )}
          </h2>
          <p className="auth-muted">
            {mode === "login"
              ? "Log in to continue to your dashboard"
              : "Start your free journey with Varikode AI"}
          </p>

          {/* Full name field: shown only while signing up */}
          {mode === "signup" && (
            <div className="field">
              <Svg className="f-ico">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </Svg>
              <input
                required
                placeholder="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          )}

          {/* Email field */}
          <div className="field">
            <Svg className="f-ico">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 6 9-6" />
            </Svg>
            <input
              type="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Password field with show / hide toggle */}
          <div className="field">
            <Svg className="f-ico">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </Svg>
            <input
              type={showPw ? "text" : "password"}
              required
              minLength={6}
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="eye"
              onClick={() => setShowPw(!showPw)}
              aria-label="Toggle password"
            >
              <Svg>
                <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
                {/* diagonal line = "eye closed" when password is visible */}
                {showPw && <path d="M3 3l18 18" />}
              </Svg>
            </button>
          </div>

          {/* Remember me + Forgot password: login mode only */}
          {mode === "login" && (
            <div className="row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span className="box">
                  <Svg width="12" height="12" strokeWidth="3">
                    <path d="M5 12l5 5 9-10" />
                  </Svg>
                </span>
                Remember me
              </label>
              <button type="button" className="link" onClick={handleForgot}>
                Forgot password?
              </button>
            </div>
          )}

          {/* Error / success messages */}
          {error && <div className="msg err">{error}</div>}
          {info && <div className="msg ok">{info}</div>}

          {/* Main submit button (spinner while busy) */}
          <button className="btn-primary" disabled={busy}>
            {busy ? (
              <span className="spinner" />
            ) : (
              <>
                {mode === "login" ? "Log in" : "Sign up"}
                <Svg width="20" height="20">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </Svg>
              </>
            )}
          </button>

          <div className="or">
            <span>or</span>
          </div>

          {/* Google sign-in button (uses official 4-colour G logo) */}
          <button type="button" className="btn-google" onClick={handleGoogle}>
            <svg viewBox="0 0 48 48" width="22" height="22">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
              <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
            </svg>
            Continue with Google
          </button>

          {/* Switch between login and signup */}
          <p className="switch">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </p>

          {/* Trust note */}
          <div className="safe">
            <Svg width="18" height="18">
              <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
              <path d="M9 12l2 2 4-4" />
            </Svg>
            Your data is safe with us
          </div>
        </form>

        {/* Small tagline under the card (hidden on mobile) */}
        <div className="tag-foot">
          Innovate <i>•</i> Automate <i>•</i> Grow
        </div>
      </section>
    </div>
  );
}