import { rzp } from "./_lib/razorpay.js";
import { getWorkspaceId } from "./_lib/auth.js";
import { supabaseAdmin as db } from "./_lib/supabaseAdmin.js";

// Cancels the subscription at the end of the current billing cycle
export async function POST(req) {
  const workspaceId = await getWorkspaceId(req);
  if (!workspaceId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: org } = await db
    .from("organizations")
    .select("subscription_id")
    .eq("id", workspaceId)
    .single();

  if (!org?.subscription_id) {
    return Response.json({ error: "No subscription" }, { status: 400 });
  }

  // true = cancel at cycle end (user keeps access until then)
  await rzp.subscriptions.cancel(org.subscription_id, true);
  await db.from("organizations").update({ subscription_status: "cancelling" }).eq("id", workspaceId);

  return Response.json({ ok: true });
}