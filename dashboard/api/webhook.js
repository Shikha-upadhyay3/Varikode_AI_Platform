import crypto from "crypto";
import { PLANS, FREE_LIMIT } from "./_lib/plans.js";
import { supabaseAdmin as db } from "./_lib/supabaseAdmin.js";

// Creates a dashboard notification for an organization
async function notify(workspaceId, type, title, message) {
  await db.from("notifications").insert({ workspace_id: workspaceId, type, title, message });
}

export async function POST(req) {
  // Raw body is required for signature verification (do not use req.json())
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(raw)
    .digest("hex");

  if (expected !== signature) {
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(raw);
  const sub = event.payload?.subscription?.entity;
  const workspaceId = sub?.notes?.workspaceId;
  const plan = sub?.notes?.plan;

  // Ignore events not linked to one of our organizations
  if (!workspaceId || !PLANS[plan]) return new Response("ok");

  // Razorpay sends unix seconds; convert to ISO date
  const renewal = sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null;

  switch (event.event) {
    case "subscription.activated":
    case "subscription.charged":
      await db.from("organizations").update({
        plan,
        message_limit: PLANS[plan].limit,
        subscription_id: sub.id,
        subscription_status: "active",
        renewal_date: renewal,
        reminder_sent_for: null, // allow a fresh 7-day reminder for the new cycle
      }).eq("id", workspaceId);

      if (event.event === "subscription.charged" && renewal) {
        await notify(workspaceId, "success", "Plan renewed",
          `Your ${plan} plan has been renewed. Next renewal: ${new Date(renewal).toDateString()}.`);
      }
      break;

    case "subscription.pending": // a charge failed, Razorpay will retry
      await db.from("organizations").update({ subscription_status: "past_due" }).eq("id", workspaceId);
      await notify(workspaceId, "warning", "Payment failed",
        "We could not renew your plan. Please check your payment method.");
      break;

    case "subscription.halted": // all retries failed, downgrade to free
      await db.from("organizations").update({
        plan: "free", message_limit: FREE_LIMIT, subscription_status: "halted",
      }).eq("id", workspaceId);
      await notify(workspaceId, "error", "Plan downgraded to Free",
        "Repeated payment failures moved your workspace to the Free plan. Please upgrade again.");
      break;

    case "subscription.cancelled":
    case "subscription.completed":
      await db.from("organizations").update({
        plan: "free", message_limit: FREE_LIMIT, subscription_status: "cancelled",
      }).eq("id", workspaceId);
      await notify(workspaceId, "info", "Subscription ended",
        "Your workspace is now on the Free plan.");
      break;
  }

  return new Response("ok");
}