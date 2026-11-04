import { getWorkspaceId } from "./_lib/auth.js";
import { supabaseAdmin as db } from "./_lib/supabaseAdmin.js";

// Returns the latest unread notifications of the current organization
export async function GET(req) {
  const workspaceId = await getWorkspaceId(req);
  if (!workspaceId) return Response.json([], { status: 401 });

  const { data } = await db
    .from("notifications")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(5);

  return Response.json(data || []);
}

// Marks a notification as read (only if it belongs to the current organization)
export async function PATCH(req) {
  const { id } = await req.json();
  const workspaceId = await getWorkspaceId(req);
  if (!workspaceId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await db
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  return Response.json({ ok: true });
}