import { rzp } from "./_lib/razorpay.js";
import { PLANS } from "./_lib/plans.js";
import { getWorkspaceId } from "./_lib/auth.js";

// Creates a Razorpay subscription for the logged-in user's organization
export async function POST(req) {
  const { plan } = await req.json();
  const workspaceId = await getWorkspaceId(req);

  if (!workspaceId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!PLANS[plan]) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  if (!PLANS[plan].planId) {
  return Response.json(
    { error: "Razorpay Plan ID is not configured" },
    { status: 500 }
  );
}

  const subscription = await rzp.subscriptions.create({
    plan_id: PLANS[plan].planId,
    total_count: 120, // billing cycles (120 months = 10 years of auto-renew)
    customer_notify: 1, // Razorpay also emails/SMS the customer
    notes: { workspaceId, plan }, // used later by the webhook to find the organization
  });

  return Response.json({ subscriptionId: subscription.id });
}