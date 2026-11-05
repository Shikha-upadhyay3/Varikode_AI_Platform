
import { supabase } from "./lib/supabaseClient";

// Sends authenticated requests to backend APIs
export async function authFetch(url, options = {}) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error("Unable to verify login session. Please log in again.");
  }

  if (!session?.access_token) {
    throw new Error("Your session has expired. Please log in again.");
  }

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}
