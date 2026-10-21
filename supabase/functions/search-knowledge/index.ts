// Edge Function: search-knowledge
// Finds the knowledge chunks most similar to a question.
// Runs as the signed-in user, so RLS only returns chunks of chatbots
// from organizations the user belongs to.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  embedTexts,
  json,
  toVectorLiteral,
  UserError,
  UUID_RE,
} from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization" }, 401);

  let chatbotId = "";
  let query = "";
  let count = 5;
  try {
    const body = await req.json();
    chatbotId = String(body?.chatbot_id ?? "");
    query = String(body?.query ?? "").trim();
    count = Math.min(10, Math.max(1, Number(body?.match_count) || 5));
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!UUID_RE.test(chatbotId)) return json({ error: "Invalid chatbot_id" }, 400);
  if (query.length === 0 || query.length > 1000) {
    return json({ error: "Query must be between 1 and 1000 characters" }, 400);
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  );

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Not signed in" }, 401);

  try {
    const [embedding] = await embedTexts([query], "RETRIEVAL_QUERY");

    const { data, error } = await userClient.rpc("match_knowledge_chunks", {
      query_embedding: toVectorLiteral(embedding),
      match_chatbot_id: chatbotId,
      match_count: count,
    });

    if (error) {
      console.error("search failed", error.message);
      return json({ error: "Search failed" }, 500);
    }

    return json({ matches: data ?? [] });
  } catch (error) {
    if (error instanceof UserError) return json({ error: error.message }, 502);
    console.error("search-knowledge failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return json({ error: "Search failed" }, 500);
  }
});