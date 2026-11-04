import { supabase } from "./lib/supabaseClient";

// fetch() wrapper that attaches the logged-in user's token,
// so our /api functions know which user is calling.
export async function authFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
      ...(options.headers || {}),
    },
  });
}