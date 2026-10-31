import "./billing.css";

// Sidebar "Monthly usage" card.
//
// Props (all come from your database, nothing is hardcoded):
//   planName   "Free" | "Starter" | ...
//   used       messages used this billing period
//   limit      messages allowed on the plan
//   resetsOn   Date or ISO string, when usage resets
//   onUpgrade  click handler (e.g. () => navigate("/pricing"))
//   href       optional, renders a link instead of a button

const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

function ArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 9L9 3M4.5 3H9v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function UsageCard({ planName = "Free", used = 0, limit = 0, resetsOn, onUpgrade, href }) {
  const ratio = limit > 0 ? used / limit : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  const barWidth = used > 0 ? Math.max(pct, 2) : 0; // keep tiny usage visible
  const state = ratio >= 1 ? "full" : ratio >= 0.8 ? "warn" : "ok";

  const resetLabel = resetsOn
    ? new Date(resetsOn).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : null;

  const note =
    state === "full"
      ? "You've used all your messages. Upgrade to keep your assistant replying."
      : state === "warn"
      ? "You're running low on messages this month."
      : null;

  const cta = (
    <>
      Upgrade plan <ArrowIcon />
    </>
  );

  return (
    <div className="vk-usage" data-state={state}>
      <div className="vk-usage__head">
        <span>Monthly usage</span>
        <span className="vk-usage__pct">{pct}%</span>
      </div>
      <div className="vk-usage__plan">{planName} plan</div>

      <div
        className="vk-usage__bar"
        role="progressbar"
        aria-label="Messages used this month"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
      >
        <span style={{ width: `${barWidth}%` }} />
      </div>

      <div className="vk-usage__nums">
        <strong>{fmt(used)}</strong>
        <span>of {fmt(limit)} messages</span>
      </div>

      {resetLabel && <div className="vk-usage__reset">Resets on {resetLabel}</div>}
      {note && (
        <p className="vk-usage__note" role="status">
          {note}
        </p>
      )}

      {href ? (
        <a className="vk-usage__cta" href={href}>
          {cta}
        </a>
      ) : (
        <button type="button" className="vk-usage__cta" onClick={onUpgrade}>
          {cta}
        </button>
      )}
    </div>
  );
}
