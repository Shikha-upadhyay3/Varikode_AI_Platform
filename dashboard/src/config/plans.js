// Single source of truth for plans.
// Change numbers HERE and both the usage card and the pricing page update.
//
// IMPORTANT before selling:
// - `messages` is the real metered limit (1 AI reply = 1 message).
// - chatbots / knowledgeSources / teamMembers are shown to customers, so the
//   backend must enforce them too. Edit or delete any you do not plan to enforce.
// - INR prices are placeholders. Set them after you check Razorpay fees and
//   your actual Gemini cost per message.

export const YEARLY_DISCOUNT = 0.3; // 30% off when billed yearly (set 0 to hide)

export const PLANS = [
  {
    id: "free",
    name: "Free",
    tagline: "Try Varikode.ai with a small monthly allowance",
    price: { INR: 0, USD: 0 },
    messages: 50,
    chatbots: 1,
    knowledgeSources: 1,
    teamMembers: 1,
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "For a single website getting started",
    price: { INR: 749, USD: 9 },
    messages: 1000,
    chatbots: 1,
    knowledgeSources: 5,
    teamMembers: 2,
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "For growing teams with steady traffic",
    price: { INR: 2399, USD: 29 },
    messages: 5000,
    chatbots: 3,
    knowledgeSources: 20,
    teamMembers: 5,
    popular: true,
  },
  {
    id: "scale",
    name: "Scale",
    tagline: "For high volume and multiple brands",
    price: { INR: 6499, USD: 79 },
    messages: 20000,
    chatbots: 10,
    knowledgeSources: 100,
    teamMembers: 15,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Need more? Tell us about your plans",
    custom: true,
  },
];

export const getPlan = (id) => PLANS.find((p) => p.id === id) || PLANS[0];

const SYMBOL = { INR: "₹", USD: "$" };

// Price per month for a billing cycle ("monthly" | "yearly").
export function monthlyPrice(plan, cycle, currency) {
  const base = plan.price[currency];
  if (cycle === "yearly") return Math.round(base * (1 - YEARLY_DISCOUNT));
  return base;
}

export function formatMoney(amount, currency) {
  return SYMBOL[currency] + amount.toLocaleString(currency === "INR" ? "en-IN" : "en-US");
}

export function planFeatures(plan) {
  const n = (v) => v.toLocaleString("en-IN");
  return [
    `${n(plan.messages)} AI messages per month`,
    `${n(plan.chatbots)} ${plan.chatbots === 1 ? "chatbot" : "chatbots"}`,
    `${n(plan.knowledgeSources)} knowledge ${plan.knowledgeSources === 1 ? "source" : "sources"}`,
    `${n(plan.teamMembers)} team ${plan.teamMembers === 1 ? "member" : "members"}`,
    "Lead capture and chat history",
  ];
}