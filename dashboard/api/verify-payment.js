import crypto from "crypto";
import { PLANS } from "./_lib/plans.js";
import { getWorkspaceId } from "./_lib/auth.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

// Verifies the Razorpay payment signature and upgrades the organization
export async function POST(req) {
  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, plan } =
    await req.json();

  const workspaceId = await getWorkspaceId(req);
  if (!workspaceId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!PLANS[plan]) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  // For subscriptions the signed string is: payment_id|subscription_id
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_payment_id + "|" + razorpay_subscription_id)
    .digest("hex");

  if (expected !== razorpay_signature) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Signature is valid: upgrade now. The webhook fills in renewal_date later.
  await supabaseAdmin
    .from("organizations")
    .update({
      plan,
      message_limit: PLANS[plan].limit,
      subscription_id: razorpay_subscription_id,
      subscription_status: "active",
    })
    .eq("id", workspaceId);

  return Response.json({ ok: true });
}