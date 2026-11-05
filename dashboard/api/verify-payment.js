
import crypto from "crypto";
import { rzp } from "./_lib/razorpay.js";
import { PLANS } from "./_lib/plans.js";
import { getWorkspaceId } from "./_lib/auth.js";

// Verify Razorpay subscription payment
export async function POST(req) {
  try {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      plan,
    } = await req.json();

    const workspaceId = await getWorkspaceId(req);

    if (!workspaceId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!plan || !Object.hasOwn(PLANS, plan)) {
      return Response.json({ error: "Invalid plan" }, { status: 400 });
    }

    if (!PLANS[plan].planId) {
      return Response.json(
        { error: "Razorpay Plan ID is not configured" },
        { status: 500 }
      );
    }

    if (
      !razorpay_payment_id ||
      !razorpay_subscription_id ||
      !razorpay_signature
    ) {
      return Response.json(
        { error: "Missing payment verification details" },
        { status: 400 }
      );
    }

    // Verify Razorpay payment signature
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return Response.json(
        { error: "Invalid payment signature" },
        { status: 400 }
      );
    }

    // Fetch subscription directly from Razorpay
    const subscription = await rzp.subscriptions.fetch(
      razorpay_subscription_id
    );

    // Confirm that the subscription belongs to this workspace and plan
    if (
      subscription.plan_id !== PLANS[plan].planId ||
      subscription.notes?.workspaceId !== workspaceId ||
      subscription.notes?.plan !== plan
    ) {
      return Response.json(
        { error: "Subscription details do not match" },
        { status: 400 }
      );
    }

    // Webhook will activate the plan after Razorpay confirms activation.
    return Response.json({
      ok: true,
      message: "Payment signature verified. Waiting for subscription activation.",
    });
  } catch (error) {
    console.error("Payment verification error:", error);

    return Response.json(
      { error: "Payment verification failed" },
      { status: 500 }
    );
  }
}
