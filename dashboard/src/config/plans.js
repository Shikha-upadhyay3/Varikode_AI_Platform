// Single source of truth for plans. All prices are in US dollars.
//
// HOW THE MESSAGE LIMITS ARE CALCULATED
//   messages = price x (1 - TARGET_MARGIN) / COST_PER_REPLY_USD, rounded down to 50
// Change the three numbers below and every plan updates.
//
// PROVISIONAL INPUTS (replace when you have better data):
// - COST_PER_REPLY_USD: Google cost of one chatbot reply with gemini-3.6-flash.
//   Measured on 2 replies in the database, thinking tokens included, using the
//   price that starts on 1 Jan 2027 ($1.50 in / $7.50 out per 1M tokens).
//   Those 2 replies were long questions, so this is a cautious (high) number.
//   Re-measure with 30-50 replies and update it.
// - TARGET_MARGIN: share of the price you keep after Google's cost. 0.5 is a
//   starting value. It does NOT yet include Razorpay fees or tax.

export const COST_PER_REPLY_USD = 0.0065;
export const TARGET_MARGIN = 0.5;
const ROUND_DOWN_TO = 50;

// Must match the FREE_MONTHLY_MESSAGES secret of the public-chat function.
const FREE_MESSAGES = 50;

// Discount for paying a year at once (0.3 = 30%). Set to 0 to hide the toggle.
// A yearly plan also needs to exist in Razorpay before checkout can use it.
export const YEARLY_DISCOUNT = 0.3;

// Varikode contact details, copied from https://www.varikode.com (footer).
export const CONTACT = {
  email: "info@varikode.com",
  phone: "+91 8707857268",
  address: "Vikrant Khand 3/4 Gomtinagar, Lucknow 226010",
  website: "https://www.varikode.com/contact-ecommerce-development",
};

const messagesFor = (usd) =>
  Math.floor((usd * (1 - TARGET_MARGIN)) / COST_PER_REPLY_USD / ROUND_DOWN_TO) * ROUND_DOWN_TO;

export const PLANS = [
  { id: "free", name: "Free", price: { USD: 0 }, messages: FREE_MESSAGES },
  { id: "starter", name: "Starter", price: { USD: 1 }, messages: messagesFor(1) },
  { id: "growth", name: "Growth", price: { USD: 2 }, messages: messagesFor(2) },
  { id: "scale", name: "Scale", price: { USD: 3 }, messages: messagesFor(3) },
  { id: "enterprise", name: "Enterprise", custom: true },
];

// Returns null when the plan is unknown, so the UI never pretends.
export const getPlan = (id) => PLANS.find((p) => p.id === id) || null;

const SYMBOL = { INR: "₹", USD: "$" };

export function formatMoney(amount, currency) {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return (
    SYMBOL[currency] +
    amount.toLocaleString(currency === "INR" ? "en-IN" : "en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  );
}

// Price per month for "monthly" or "yearly" billing.
export function monthlyPrice(plan, cycle, currency) {
  const base = plan.price[currency];
  if (cycle !== "yearly") return base;
  return Math.round(base * (1 - YEARLY_DISCOUNT) * 100) / 100;
}

// Price per 1,000 messages, calculated from the plan's own price and limit.
export function pricePerThousand(plan, cycle, currency) {
  if (!plan.messages || !plan.price || !plan.price[currency]) return null;
  return Math.round((monthlyPrice(plan, cycle, currency) / plan.messages) * 1000 * 100) / 100;
}

const n = (v) => v.toLocaleString("en-IN");
const count = (v, one, many) => `${n(v)} ${v === 1 ? one : many}`;

// Lists only the limits that are defined for the plan.
export function planFeatures(plan) {
  const out = [];
  if (plan.messages != null) out.push(`${n(plan.messages)} messages per month`);
  if (plan.chatbots != null) out.push(count(plan.chatbots, "chatbot", "chatbots"));
  if (plan.knowledgeSources != null) out.push(count(plan.knowledgeSources, "knowledge source", "knowledge sources"));
  if (plan.teamMembers != null) out.push(count(plan.teamMembers, "team member", "team members"));
  return out;
}

// Things that exist in the dashboard for every workspace today.
// If you later lock a feature to certain plans, remove it from this list.
export const INCLUDED_IN_EVERY_PLAN = [
  "Website chatbot with embed code",
  "Knowledge sources for your own content",
  "Lead capture (name, email, phone)",
  "Full chat history",
  "Overview analytics",
];