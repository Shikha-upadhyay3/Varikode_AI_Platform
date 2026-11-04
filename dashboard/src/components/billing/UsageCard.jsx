import "./billing.css";

// Sidebar "Monthly usage" card. Shows only what is known.
//
// Props:
//   used       messages used this month (from the database)
//   planName   optional. Hidden when the plan is not known yet
//   limit      optional. When missing, only the used count is shown
//   resetsOn   optional Date/ISO string. Hidden when not known
//   onUpgrade  click handler
//   href       optional, renders a link instead of a button

const fmt = (v) => Number(v || 0).toLocaleString("en-IN");

function ArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 9L9 3M4.5 3H9v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function UsageCard({ planName, used = 0, limit, resetsOn, onUpgrade, href }) {
  const hasLimit = Number(limit) > 0;
  const ratio = hasLimit ? used / limit : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  const barWidth = used > 0 ? Math.max(pct, 2) : 0;
  const state = !hasLimit ? "ok" : ratio >= 1 ? "full" : ratio >= 0.8 ? "warn" : "ok";

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
        {hasLimit && <span className="vk-usage__pct">{pct}%</span>}
      </div>
      {planName && <div className="vk-usage__plan">{planName} plan</div>}

      {hasLimit && (
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
      )}

      <div className="vk-usage__nums" style={hasLimit ? undefined : { marginTop: 10 }}>
        <strong>{fmt(used)}</strong>
        <span>{hasLimit ? `of ${fmt(limit)} messages` : "messages this month"}</span>
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
