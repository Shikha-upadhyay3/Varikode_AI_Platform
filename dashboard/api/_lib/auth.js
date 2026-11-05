
import { supabaseAdmin } from "./supabaseAdmin.js";

// Gets the authenticated user's organization ID
export async function getWorkspaceId(req) {
  try {
    const header = req.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ")
      ? header.slice(7).trim()
      : "";

    if (!token) return null;

    // Verify the Supabase access token
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) return null;

    // Find the user's organization
    const { data, error } = await supabaseAdmin
      .from("memberships")
      .select("organization_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Workspace lookup error:", error);
      return null;
    }

    return data?.organization_id ?? null;
  } catch (error) {
    console.error("Authentication error:", error);
    return null;
  }
}
