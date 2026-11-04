
import { useEffect, useRef, useState } from "react";
import "./billing.css";
import {
  PLANS,
  YEARLY_DISCOUNT,
  CONTACT,
  INCLUDED_IN_EVERY_PLAN,
  formatMoney,
  getPlan,
  monthlyPrice,
  planFeatures,
  pricePerThousand,
} from "../../config/plans";

// Pricing page. Shows only plan data from config/plans.js and real usage.
//
// Props:
//   currentPlanId   plan id from the database, or null when not known
//   usedMessages    messages used this month, or null while loading
//   currency        "USD" (default). Prices are in dollars
//   defaultName     pre-fills the contact form
//   defaultEmail    pre-fills the contact form
//   onSelectPlan    (planId, cycle) => void   <- connect Razorpay checkout here
//   onContactSales  async ({ name, email, phone, message }) => void
//                   Sends the message to Varikode's email. Must throw if sending fails.
//                   If it is missing or throws, the form opens the user's email app
//                   with the message ready to send to CONTACT.email.
//   openContact     true => open the contact form as soon as the page shows
//   onContactHandled () => void   called after the form has been opened (resets openContact)

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function mailtoUrl({ name, email, phone, message }) {
  const lines = [`Name: ${name}`, `Email: ${email}`, `Phone: ${phone}`, "", message];
  return `mailto:${CONTACT.email}?subject=${encodeURIComponent("Varikode.ai enquiry")}&body=${encodeURIComponent(
    lines.join("\n"),
  )}`;
}

const telHref = `tel:${CONTACT.phone.replace(/\s/g, "")}`;

// Floating "Contact us" button (bottom right) that opens a small message form.
function ContactWidget({ open, setOpen, defaultName, defaultEmail, onSubmit }) {
  const [name, setName] = useState(defaultName || "");
  const [email, setEmail] = useState(defaultEmail || "");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null); // null | "sent" | "mailto"
  const nameRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    nameRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  async function submit(e) {
    e.preventDefault();
    const payload = { name: name.trim(), email: email.trim(), phone: phone.trim(), message: message.trim() };
    setSending(true);
    try {
      if (!onSubmit) throw new Error("No sender configured");
      await onSubmit(payload);
      setStatus("sent");
    } catch (err) {
      // Automatic sending is not available: open the user's email app instead.
      console.error("Contact form:", err);
      window.location.href = mailtoUrl(payload);
      setStatus("mailto");
    } finally {
      setSending(false);
    }
  }

  function close() {
    setOpen(false);
    if (status) {
      setStatus(null);
      setMessage("");
    }
  }

  return (
    <div className="vk-cw">
      {open && (
        <div className="vk-cw__panel" role="dialog" aria-label="Contact Varikode">
          <div className="vk-cw__head">
            <h2>Contact Varikode</h2>
            <button type="button" className="vk-cw__x" onClick={close} aria-label="Close">
              ×
            </button>
          </div>

          {status ? (
            <>
              <p className="vk-cw__text">
                {status === "sent"
                  ? `Your message has been sent. We will reply to ${email}.`
                  : `We could not send it automatically, so your email app should open with the message ready to send. If it does not, write to ${CONTACT.email}.`}
              </p>
              <button type="button" className="vk-plan__btn" onClick={close}>
                Done
              </button>
            </>
          ) : (
            <form onSubmit={submit}>
              <label htmlFor="vk-cw-name">Your name</label>
              <input id="vk-cw-name" ref={nameRef} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />

              <label htmlFor="vk-cw-email">Email</label>
              <input id="vk-cw-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />

              <label htmlFor="vk-cw-phone">Contact number</label>
              <input
                id="vk-cw-phone"
                type="tel"
                required
                pattern="[0-9+() \-]{7,20}"
                title="Digits, spaces, + ( ) and - only (7 to 20 characters)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />

              <label htmlFor="vk-cw-msg">Your message or problem</label>
              <textarea id="vk-cw-msg" rows={4} required maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />

              <button type="submit" className="vk-plan__btn" disabled={sending}>
                {sending ? "Sending..." : "Send message"}
              </button>
              <p className="vk-cw__direct">
                Or email <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> or call <a href={telHref}>{CONTACT.phone}</a>
              </p>
            </form>
          )}
        </div>
      )}

      <button type="button" className="vk-cw__fab" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <MailIcon />
        Contact us
      </button>
    </div>
  );
}

export default function PricingPage({
  currentPlanId = null,
  usedMessages = null,
  currency: currencyProp = "USD",
  defaultName = "",
  defaultEmail = "",
  onSelectPlan,
  onContactSales,
  openContact = false,
  onContactHandled,
}) {
  // Plans are priced in dollars. Any other currency falls back to USD.
  const currency = currencyProp in PLANS[1].price ? currencyProp : "USD";
  const [cycle, setCycle] = useState("monthly");
  const [notice, setNotice] = useState("");
  const [contactOpen, setContactOpen] = useState(false);

  // When the dashboard's floating "Contact us" button was clicked, open the form right away.
  useEffect(() => {
    if (openContact) {
      setContactOpen(true);
      onContactHandled?.();
    }
  }, [openContact, onContactHandled]);

  const currentRank = PLANS.findIndex((p) => p.id === currentPlanId);
  const currentPlan = getPlan(currentPlanId);
  const showToggle = YEARLY_DISCOUNT > 0;

  function handleSelect(plan) {
    setNotice("");
    if (onSelectPlan) return onSelectPlan(plan.id, cycle);
    setNotice(`Checkout for the ${plan.name} plan isn't connected yet.`);
  }

  function renderButton(plan, i) {
    if (plan.custom) {
      return (
        <button type="button" className="vk-plan__btn" onClick={() => setContactOpen(true)}>
          Contact us
        </button>
      );
    }
    if (plan.id === currentPlanId) {
      return (
        <button type="button" className="vk-plan__btn" disabled>
          Your current plan
        </button>
      );
    }
    if (plan.price[currency] === 0 && currentRank === -1) {
      return (
        <button type="button" className="vk-plan__btn" data-variant="ghost" disabled>
          No payment needed
        </button>
      );
    }
    const lower = currentRank !== -1 && i < currentRank;
    return (
      <button
        type="button"
        className="vk-plan__btn"
        data-variant={lower ? "ghost" : undefined}
        onClick={() => handleSelect(plan)}
      >
        {lower ? `Switch to ${plan.name}` : `Upgrade to ${plan.name}`}
      </button>
    );
  }

  return (
    <section className="vk-pricing" aria-labelledby="vk-pricing-title">
      <header className="vk-pricing__top">
        <h1 id="vk-pricing-title" className="vk-pricing__title">
          Upgrade your plan
        </h1>
        <p className="vk-pricing__sub">
          Every plan includes the full dashboard. Plans differ in how many messages your workspace gets each month.
        </p>

        {showToggle && (
          <div className="vk-toggle" role="group" aria-label="Billing period">
            <button type="button" aria-pressed={cycle === "monthly"} onClick={() => setCycle("monthly")}>
              Pay monthly
            </button>
            <button type="button" aria-pressed={cycle === "yearly"} onClick={() => setCycle("yearly")}>
              Pay yearly
              <span className="vk-toggle__save">-{Math.round(YEARLY_DISCOUNT * 100)}%</span>
            </button>
          </div>
        )}
      </header>

      {usedMessages != null && (
        <div className="vk-strip">
          <div>
            <strong>{Number(usedMessages).toLocaleString("en-IN")}</strong>
            {currentPlan?.messages
              ? ` of ${currentPlan.messages.toLocaleString("en-IN")} messages used this month`
              : " messages used this month"}
          </div>
          <span>Counted for your whole workspace</span>
        </div>
      )}

      <div className="vk-grid">
        {PLANS.map((plan, i) => {
          const isCurrent = plan.id === currentPlanId;
          const perMonth = plan.custom ? null : monthlyPrice(plan, cycle, currency);
          const unit = plan.custom ? null : pricePerThousand(plan, cycle, currency);
          const features = plan.custom ? ["Message volume set to your needs"] : planFeatures(plan);

          return (
            <article key={plan.id} className="vk-plan" data-current={isCurrent ? "true" : "false"}>
              <h2 className="vk-plan__name">
                {plan.name}
                {isCurrent && <span className="vk-plan__badge">Current</span>}
              </h2>

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
              <div className="vk-plan__sub">
                {plan.custom
                  ? "Priced for your volume"
                  : perMonth === 0
                  ? "No charge"
                  : cycle === "yearly"
                  ? `${formatMoney(perMonth * 12, currency)} billed yearly`
                  : "Billed monthly"}
              </div>
              <div className="vk-plan__unit">{unit ? `${formatMoney(unit, currency)} per 1,000 messages` : ""}</div>

              {renderButton(plan, i)}

              <ul className="vk-plan__list">
                {features.map((f, k) => (
                  <li key={f} data-strong={k === 0 ? "true" : undefined}>
                    <Check />
                    <span>{f}</span>
                  </li>
                ))}
                {INCLUDED_IN_EVERY_PLAN.map((f) => (
                  <li key={f}>
                    <Check />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      <p className="vk-live" role="status" aria-live="polite">
        {notice}
      </p>

      <ContactWidget
        open={contactOpen}
        setOpen={setContactOpen}
        defaultName={defaultName}
        defaultEmail={defaultEmail}
        onSubmit={onContactSales}
      />
    </section>
  );
}
