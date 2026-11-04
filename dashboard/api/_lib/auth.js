import { supabaseAdmin } from "./supabaseAdmin.js";

// Reads "Authorization: Bearer <token>" and returns the user's organization id (or null).
export async function getWorkspaceId(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.replace("Bearer ", "");
  if (!token) return null;

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data } = await supabaseAdmin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  return data?.organization_id ?? null;
}