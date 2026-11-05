import { supabaseAdmin as db } from "../_lib/supabaseAdmin.js";

// Runs daily (Vercel Cron). Creates a notification 7 days before renewal.
export async function GET(req) {
  // Only Vercel Cron (or someone with the secret) may call this
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Active organizations renewing within the next 7 days
  const { data: list } = await db
    .from("organizations")
    .select("id, plan, renewal_date, reminder_sent_for")
    .eq("subscription_status", "active")
    .gte("renewal_date", now.toISOString())
    .lte("renewal_date", in7Days.toISOString());

  for (const w of list || []) {
    // Skip if we already reminded for this renewal date
    if (
      w.reminder_sent_for &&
      new Date(w.reminder_sent_for).getTime() === new Date(w.renewal_date).getTime()
    ) {
      continue;
    }

    const date = new Date(w.renewal_date).toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric",
    });

    await db.from("notifications").insert({
      workspace_id: w.id,
      type: "renewal_reminder",
      title: "Your plan renews soon",
      message: `Your ${w.plan} plan will renew automatically on ${date}. Cancel before then if you do not want to be charged.`,
    });

    // Remember that this renewal date has been reminded
    await db.from("organizations").update({ reminder_sent_for: w.renewal_date }).eq("id", w.id);
  }

  return Response.json({ checked: list?.length || 0 });
}