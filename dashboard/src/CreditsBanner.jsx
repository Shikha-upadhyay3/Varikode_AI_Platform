import { useState } from "react";
import { useOverviewStats } from "./useOverviewStats";

// Show a warning once this share of the monthly messages is used
const WARN_AT = 0.8;

const css = `
.credits-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 11px 42px;
  border-bottom: 1px solid #202127;
}
.credits-banner.warning {
  color: #f3dfae;
  background: linear-gradient(90deg, rgba(237, 189, 115, .16), rgba(237, 189, 115, .05));
  border-bottom-color: #4a3d1f;
}
.credits-banner.exhausted {
  color: #ffd1d1;
  background: linear-gradient(90deg, rgba(255, 107, 107, .20), rgba(255, 107, 107, .06));
  border-bottom-color: #5a2a2a;
}
.credits-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 14px;
}
.warning .credits-icon { color: #edbd73; background: #382d21; }
.exhausted .credits-icon { color: #ff8a8a; background: #3a2222; }
.credits-text { flex: 1; min-width: 0; font-size: 12.5px; line-height: 1.5; }
.credits-text strong { display: block; color: #fff; font-size: 13px; font-weight: 600; }
.credits-upgrade {
  flex: 0 0 auto;
  padding: 8px 14px;
  color: #fff;
  background: linear-gradient(90deg, #1e90ff, #14b8c8);
  border: 0;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.credits-upgrade:hover { filter: brightness(1.1); }
.credits-close {
  flex: 0 0 auto;
  color: inherit;
  background: transparent;
  border: 0;
  font-size: 18px;
  line-height: 1;
  opacity: .7;
  cursor: pointer;
}
.credits-close:hover { opacity: 1; }
@media (max-width: 900px) {
  .credits-banner { padding: 10px 14px 10px 64px; flex-wrap: wrap; }
}
`;

/**
 * Props
 *  - organizationId: id of the current organization
 *  - limit:          monthly message allowance of the current plan (free plan = 50).
 *                    Keep it equal to FREE_MONTHLY_MESSAGES in the public-chat function.
 *  - onUpgrade:      called when the person clicks "Upgrade plan" (open the Pricing page)
 */
export default function CreditsBanner({ organizationId, limit = 50, onUpgrade }) {
  const { stats } = useOverviewStats(organizationId, 30);
  const [dismissed, setDismissed] = useState(false);

  // Nothing to show until the real usage numbers have loaded
  if (!stats || !limit) return null;

  const used = stats.month_messages ?? 0;
  const ratio = used / limit;
  const exhausted = used >= limit;
  const warning = !exhausted && ratio >= WARN_AT;

  if (!exhausted && !warning) return null;
  // The "limit reached" banner can never be closed; the 80% warning can
  if (warning && dismissed) return null;

  const pct = Math.min(100, Math.round(ratio * 100));

  return (
    <>
      <style>{css}</style>
      <div className={`credits-banner ${exhausted ? "exhausted" : "warning"}`} role={exhausted ? "alert" : "status"}>
        <span className="credits-icon" aria-hidden="true">!</span>
        <div className="credits-text">
          {exhausted ? (
            <>
              <strong>You have used all {limit.toLocaleString()} messages this month</strong>
              Your website chatbot has stopped replying to visitors. Upgrade your plan to turn it back on.
            </>
          ) : (
            <>
              <strong>{pct}% of your monthly messages used</strong>
              {used.toLocaleString()} of {limit.toLocaleString()} used. Upgrade your plan before the chatbot stops replying.
            </>
          )}
        </div>
        <button type="button" className="credits-upgrade" onClick={onUpgrade}>Upgrade plan</button>
        {warning && (
          <button type="button" className="credits-close" onClick={() => setDismissed(true)} aria-label="Dismiss">×</button>
        )}
      </div>
    </>
  );
}
