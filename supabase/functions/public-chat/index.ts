import { createClient } from "npm:@supabase/supabase-js@2";

const VISITOR_DAILY_LIMIT = 20;   
const BOT_DAILY_LIMIT = 500;      
const HISTORY_LIMIT = 20;


const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.6-flash";


const GEMINI_TOTAL_TIMEOUT_MS = 25_000;


const MAX_OUTPUT_TOKENS = 2048;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

type GeminiResult = { ok: boolean; status: number; text: string };

function timeoutError() {
  const e = new Error("Gemini timeout");
  e.name = "AbortError";
  return e;
}


async function callGemini(contents: unknown[], systemPrompt: string | null): Promise<GeminiResult> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("MISSING_API_KEY");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const payload = JSON.stringify({
    ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
    contents,
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
  });

  const deadline = Date.now() + GEMINI_TOTAL_TIMEOUT_MS;
  let last: GeminiResult | null = null;

  for (let attempt = 0; attempt <= 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw timeoutError();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), remaining);
    try {
      const started = Date.now();
      const res = await fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: payload,
      });
      const text = await res.text();
      console.log(`Gemini ${MODEL} attempt ${attempt + 1}: status ${res.status} in ${Date.now() - started}ms`);
      last = { ok: res.ok, status: res.status, text };
    } finally {
      clearTimeout(timer);
    }

   
    if (last.status !== 500 && last.status !== 503) return last;
    const wait = 1000 * (attempt + 1);
    if (attempt === 2 || deadline - Date.now() <= wait + 1500) return last;
    await new Promise((r) => setTimeout(r, wait));
  }
  return last!;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const h = corsHeaders(origin);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json" } });
  const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });


  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Use POST");

  try {
    // 1. Validate
    const body = await req.json().catch(() => null);
    const publicKey = typeof body?.publicKey === "string" ? body.publicKey : "";
    const visitorId = typeof body?.visitorId === "string" ? body.visitorId : "";
    const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!publicKey) return fail(400, "VALIDATION_ERROR", "publicKey required");
    if (!UUID.test(visitorId)) return fail(400, "VALIDATION_ERROR", "Invalid visitorId");
    if (!message || message.length > 2000) return fail(400, "VALIDATION_ERROR", "Message must be 1 to 2000 characters");

  
    const { data: bot } = await admin.from("chatbots").select("*").eq("public_key", publicKey).maybeSingle();
    if (!bot) return fail(404, "BOT_NOT_FOUND", "Chatbot not found");

    // 3. Domain check
    const allowed = String(bot.allowed_origins ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes("*") && (!origin || !allowed.includes(origin)))
      return fail(403, "ORIGIN_NOT_ALLOWED", "This website is not allowed to use this chatbot");

   
    const day = new Date().toISOString().slice(0, 10);
    const { data: mine } = await admin.from("visitor_usage_daily").select("requests")
      .eq("chatbot_id", bot.id).eq("visitor_id", visitorId).eq("day", day).maybeSingle();
    if (mine && mine.requests >= VISITOR_DAILY_LIMIT)
      return fail(429, "QUOTA_EXCEEDED", "Daily message limit reached. Please come back tomorrow.");

    const { data: all } = await admin.from("visitor_usage_daily").select("requests")
      .eq("chatbot_id", bot.id).eq("day", day);
    const botTotal = (all ?? []).reduce((s: number, r: { requests: number }) => s + r.requests, 0);
    if (botTotal >= BOT_DAILY_LIMIT)
      return fail(429, "BOT_BUSY", "This assistant is unavailable right now. Please try later.");


    let history: { role: string; content: string }[] = [];
    let convoId: string | null = null;
    if (conversationId) {
      const { data: convo } = await admin.from("conversations").select("id")
        .eq("id", conversationId).eq("chatbot_id", bot.id).eq("visitor_id", visitorId).maybeSingle();
      if (!convo) return fail(404, "NOT_FOUND", "Conversation not found");
      convoId = convo.id;
      const { data: recent } = await admin.from("messages").select("role,content")
        .eq("conversation_id", convoId).order("created_at", { ascending: false }).limit(HISTORY_LIMIT);
      history = (recent ?? []).reverse();
    }

    // 6. Gemini
    const contents = [...history, { role: "user", content: message }].map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    let result: GeminiResult;
    try {
      result = await callGemini(contents, bot.system_prompt ?? null);
    } catch (e) {
      const err = e as Error;
      if (err.message === "MISSING_API_KEY") {
        console.error("GEMINI_API_KEY secret set nahi hai");
        return fail(500, "AI_NOT_CONFIGURED", "AI service is not configured.");
      }
      if (err.name === "AbortError") return fail(504, "AI_TIMEOUT", "The AI took too long. Please try again.");
      console.error("Gemini fetch failed:", err);
      return fail(502, "AI_UNREACHABLE", "Could not reach the AI service.");
    }

    if (!result.ok) {
      
      console.error("Gemini error", result.status, "model:", MODEL, result.text);
      if (result.status === 429) return fail(503, "AI_BUSY", "AI is busy, try again shortly.");
      if (result.status === 400 || result.status === 403 || result.status === 404)
        return fail(502, "AI_AUTH_ERROR", "AI service is misconfigured.");
      return fail(502, "AI_UPSTREAM_ERROR", "The AI service returned an error.");
    }

    let ai: any;
    try {
      ai = JSON.parse(result.text);
    } catch {
      console.error("Gemini returned non-JSON:", result.text.slice(0, 500));
      return fail(502, "AI_UPSTREAM_ERROR", "The AI service returned an error.");
    }

    const candidate = ai.candidates?.[0];
    const reply = candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
    if (!reply) {
      console.error("Empty reply. finishReason:", candidate?.finishReason, "blockReason:", ai.promptFeedback?.blockReason);
      return fail(502, "EMPTY_AI_RESPONSE", "The AI returned an empty response");
    }
    if (candidate?.finishReason === "MAX_TOKENS") {
      console.warn("Reply MAX_TOKENS par kat gaya, MAX_OUTPUT_TOKENS badhane par vichar karein");
    }
    const pt = ai.usageMetadata?.promptTokenCount ?? 0;
    const ct = ai.usageMetadata?.candidatesTokenCount ?? 0;

    
    if (!convoId) {
      const { data: created, error: cErr } = await admin.from("conversations").insert({
        organization_id: bot.organization_id,
        chatbot_id: bot.id,
        visitor_id: visitorId,
        user_id: null,
        title: message.slice(0, 50),
        system_prompt: bot.system_prompt ?? null,
        model: MODEL,
      }).select("id").single();
      if (cErr) throw cErr;
      convoId = created.id;
    }
    const now = Date.now();
    const { error: mErr } = await admin.from("messages").insert([
      { conversation_id: convoId, role: "user", content: message, created_at: new Date(now).toISOString() },
      { conversation_id: convoId, role: "assistant", content: reply, prompt_tokens: pt,
        completion_tokens: ct, created_at: new Date(now + 1).toISOString() },
    ]);
    if (mErr) throw mErr;
    await admin.rpc("record_visitor_usage", { p_bot: bot.id, p_visitor: visitorId, p_tokens: pt + ct });
    await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convoId);

    return json(200, { conversationId: convoId, reply });
  } catch (e) {
    console.error("Unhandled:", e);
    return fail(500, "INTERNAL_ERROR", "Something went wrong");
  }
});