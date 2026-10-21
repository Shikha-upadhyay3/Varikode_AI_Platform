import { createClient } from "npm:@supabase/supabase-js@2";

const DAILY_REQUEST_LIMIT = 50;
const DAILY_TOKEN_LIMIT = 50000;
const HISTORY_LIMIT = 20;
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash";

const cors = {
  "Access-Control-Allow-Origin": "*", // production me apna domain likhna
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (status: number, code: string, message: string) =>
  json(status, { error: { code, message } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Use POST");

  try {
    // 1. Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail(401, "UNAUTHORIZED", "Missing authentication");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return fail(401, "UNAUTHORIZED", "Invalid session");

    // 2. Validate
    const body = await req.json().catch(() => null);
    const conversationId = body?.conversationId;
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!conversationId) return fail(400, "VALIDATION_ERROR", "conversationId required");
    if (!content || content.length > 4000)
      return fail(400, "VALIDATION_ERROR", "Message must be 1 to 4000 characters");

    // 3. Ownership (RLS ki wajah se dusre ki conversation null aayegi)
    const { data: convo } = await userClient
      .from("conversations").select("*").eq("id", conversationId).maybeSingle();
    if (!convo) return fail(404, "NOT_FOUND", "Conversation not found");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 4. Quota
    const day = new Date().toISOString().slice(0, 10);
    const { data: usage } = await admin
      .from("usage_daily").select("requests,tokens")
      .eq("user_id", user.id).eq("day", day).maybeSingle();
    if (usage && (usage.requests >= DAILY_REQUEST_LIMIT || usage.tokens >= DAILY_TOKEN_LIMIT))
      return fail(429, "QUOTA_EXCEEDED", "Daily usage limit reached. Try again tomorrow.");

    // 5. History
    const { data: recent } = await admin
      .from("messages").select("role,content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }).limit(HISTORY_LIMIT);
    const history = (recent ?? []).reverse();

    
        // 6. Gemini call (30s timeout)
    const contents = [...history, { role: "user", content }].map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    let ai;
    try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
      const init = {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")!,
        },
        body: JSON.stringify({
          ...(convo.system_prompt
            ? { systemInstruction: { parts: [{ text: convo.system_prompt }] } }
            : {}),
          contents,
          generationConfig: { maxOutputTokens: 500 },
        }),
      };

      // 500/503 par 2 baar dobara try karo
      let res = await fetch(url, init);
      for (let attempt = 1; attempt <= 2 && (res.status === 500 || res.status === 503); attempt++) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        res = await fetch(url, init);
      }
      if (!res.ok) {
        console.error("Gemini error", res.status, await res.text());
        if (res.status === 429) return fail(503, "AI_BUSY", "AI is busy, try again shortly.");
        if (res.status === 400 || res.status === 403)
          return fail(502, "AI_AUTH_ERROR", "AI service is misconfigured.");
        return fail(502, "AI_UPSTREAM_ERROR", "The AI service returned an error.");
      }
      ai = await res.json();
    } catch (e) {
      if ((e as Error).name === "AbortError")
        return fail(504, "AI_TIMEOUT", "The AI took too long. Please try again.");
      return fail(502, "AI_UNREACHABLE", "Could not reach the AI service.");
    } finally {
      clearTimeout(timer);
    }

    const reply = ai.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
    if (!reply) return fail(502, "EMPTY_AI_RESPONSE", "The AI returned an empty response");
    const pt = ai.usageMetadata?.promptTokenCount ?? 0;
    const ct = ai.usageMetadata?.candidatesTokenCount ?? 0;

    // 7. Save
    const now = Date.now();
    const { data: saved, error: saveErr } = await admin.from("messages").insert([
      { conversation_id: conversationId, role: "user", content, created_at: new Date(now).toISOString() },
      { conversation_id: conversationId, role: "assistant", content: reply,
        prompt_tokens: pt, completion_tokens: ct, created_at: new Date(now + 1).toISOString() },
    ]).select();
    if (saveErr) throw saveErr;

    await admin.rpc("record_usage", { p_user: user.id, p_tokens: pt + ct });
    await admin.from("conversations").update({
      updated_at: new Date().toISOString(),
      ...(history.length === 0 && convo.title === "New conversation" ? { title: content.slice(0, 50) } : {}),
    }).eq("id", conversationId);

    return json(200, { reply, messages: saved });
  } catch (e) {
    console.error("Unhandled:", e);
    return fail(500, "INTERNAL_ERROR", "Something went wrong");
  }
});