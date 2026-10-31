import { useState } from "react";
import "./billing.css";
import {
  PLANS,
  YEARLY_DISCOUNT,
  formatMoney,
  monthlyPrice,
  planFeatures,
} from "../../config/plans";

// Pricing / upgrade page (frontend only).
//
// Props:
//   currentPlanId   id of the workspace's plan, e.g. "free"
//   currency        "INR" | "USD"
//   onSelectPlan    (planId, cycle) => void   <- backend dev connects Razorpay here
//   contactHref     where "Talk to sales" goes (mailto: or a URL)

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const FAQ = [
  {
    q: "What counts as a message?",
    a: "Every AI reply your chatbot sends to a visitor uses one message. Messages from visitors don't count.",
  },
  {
    q: "What happens when I reach my limit?",
    a: "Your chatbot pauses and visitors see a short, polite message. They never see pricing. Upgrade your plan and replies resume right away.",
  },
  {
    q: "Do unused messages roll over?",
    a: "No. Your message allowance resets at the start of each billing period.",
  },
  {
    q: "Who pays, and how?",
    a: "The workspace owner pays for the plan. Your website visitors are never charged.",
  },
];

export default function PricingPage({
  currentPlanId = "free",
  currency = "INR",
  onSelectPlan,
  contactHref = "mailto:sales@varikode.ai",
}) {
  const [cycle, setCycle] = useState("monthly");
  const [notice, setNotice] = useState("");

  const currentRank = PLANS.findIndex((p) => p.id === currentPlanId);

  function handleSelect(plan) {
    setNotice("");
    if (onSelectPlan) return onSelectPlan(plan.id, cycle);
    setNotice(`Checkout for the ${plan.name} plan isn't connected yet.`);
  }

  return (
    <section className="vk-pricing" aria-labelledby="vk-pricing-title">
      <div className="vk-pricing__top">
        <div>
          <h1 id="vk-pricing-title" className="vk-pricing__title">
            Choose your plan
          </h1>
          <p className="vk-pricing__sub">
            Start free. Upgrade when your assistant needs to answer more conversations.
          </p>
        </div>

        <div className="vk-toggle" role="group" aria-label="Billing period">
          <button type="button" aria-pressed={cycle === "yearly"} onClick={() => setCycle("yearly")}>
            Pay yearly
            {YEARLY_DISCOUNT > 0 && (
              <span className="vk-toggle__save">-{Math.round(YEARLY_DISCOUNT * 100)}%</span>
            )}
          </button>
          <button type="button" aria-pressed={cycle === "monthly"} onClick={() => setCycle("monthly")}>
            Pay monthly
          </button>
        </div>
      </div>

      <div className="vk-grid">
        {PLANS.map((plan, i) => {
          const isCurrent = plan.id === currentPlanId;
          const perMonth = plan.custom ? null : monthlyPrice(plan, cycle, currency);
          const yearlyTotal =
            !plan.custom && plan.price[currency] > 0 && cycle === "yearly" ? perMonth * 12 : null;

          let button;
          if (plan.custom) {
            button = (
              <a className="vk-plan__btn" href={contactHref}>
                Talk to sales
              </a>
            );
          } else if (isCurrent) {
            button = (
              <button type="button" className="vk-plan__btn" disabled>
                Your current plan
              </button>
            );
          } else {
            const isUpgrade = i > currentRank;
            button = (
              <button
                type="button"
                className="vk-plan__btn"
                data-variant={isUpgrade ? undefined : "ghost"}
                onClick={() => handleSelect(plan)}
              >
                {isUpgrade ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
              </button>
            );
          }

          return (
            <article key={plan.id} className="vk-plan" data-popular={plan.popular ? "true" : "false"}>
              <h2 className="vk-plan__name">
                {plan.name}
                {plan.popular && <span className="vk-plan__badge">Most popular</span>}
              </h2>
              <p className="vk-plan__tagline">{plan.tagline}</p>

              <div className="vk-plan__price">
                {plan.custom ? (
                  "Custom"
                ) : (
                  <>
                    {formatMoney(perMonth, currency)}
                    {perMonth > 0 && <small>/month</small>}
                  </>
                )}
              </div>
              <div className="vk-plan__billed">
                {plan.custom
                  ? ""
                  : perMonth === 0
                  ? "Free forever"
                  : yearlyTotal
                  ? `${formatMoney(yearlyTotal, currency)} billed yearly`
                  : "billed monthly"}
              </div>

              {button}

              {!plan.custom && (
                <ul className="vk-plan__list">
                  {planFeatures(plan).map((f) => (
                    <li key={f}>
                      <Check />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
              {plan.custom && (
                <ul className="vk-plan__list">
                  {["Custom message volume", "Custom limits on chatbots and sources", "Priority support"].map((f) => (
                    <li key={f}>
                      <Check />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>

      <p className="vk-live" role="status" aria-live="polite">
        {notice}
      </p>

      <div className="vk-faq">
        <h2>Questions</h2>
        {FAQ.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
