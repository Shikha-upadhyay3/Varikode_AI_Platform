import { createClient } from "npm:@supabase/supabase-js@2";

const VISITOR_DAILY_LIMIT = 20;
const BOT_DAILY_LIMIT = 500;
const HISTORY_LIMIT = 20;
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash";
// Apne status ke hisaab se badlo
const PUBLISHED_STATUSES = ["published", "active"];
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

async function callGemini(contents: unknown[], systemPrompt: string | null) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`;
    const init = {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")! },
      body: JSON.stringify({
        ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
        contents,
        generationConfig: { maxOutputTokens: 500 },
      }),
    };
    let res = await fetch(url, init);
    for (let i = 1; i <= 2 && (res.status === 500 || res.status === 503); i++) {
      await new Promise((r) => setTimeout(r, 1000 * i));
      res = await fetch(url, init);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
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
    const body = await req.json().catch(() => null);
    const publicKey = typeof body?.publicKey === "string" ? body.publicKey : "";
    if (!publicKey) return fail(400, "VALIDATION_ERROR", "publicKey required");

    // 1. Bot + published check
    const { data: bot } = await admin.from("chatbots").select("*").eq("public_key", publicKey).maybeSingle();
    if (!bot || !PUBLISHED_STATUSES.includes(String(bot.status))) {
      return fail(404, "BOT_NOT_FOUND", "Chatbot not found");
    }

    // 2. Domain check
    const allowed = String(bot.allowed_origins ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes("*") && (!origin || !allowed.includes(origin))) {
      return fail(403, "ORIGIN_NOT_ALLOWED", "This website is not allowed to use this chatbot");
    }

    // 3. Config (widget load hote hi)
    if (body?.action === "config") {
      return json(200, {
        name: bot.name,
        welcomeMessage: bot.welcome_message ?? "Hi! How can I help you today?",
        theme: bot.theme ?? null,
      });
    }

    // 4. Validate
    const visitorId = typeof body?.visitorId === "string" ? body.visitorId : "";
    const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!UUID.test(visitorId)) return fail(400, "VALIDATION_ERROR", "Invalid visitorId");
    if (!message || message.length > 2000) return fail(400, "VALIDATION_ERROR", "Message must be 1 to 2000 characters");

    // 5. Limits
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

    // 6. History
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

    // 7. Gemini
    const contents = [...history, { role: "user", content: message }].map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    let res: Response;
    try {
      res = await callGemini(contents, bot.system_prompt ?? null);
    } catch (e) {
      if ((e as Error).name === "AbortError") return fail(504, "AI_TIMEOUT", "The AI took too long. Please try again.");
      return fail(502, "AI_UNREACHABLE", "Could not reach the AI service.");
    }
    if (!res.ok || !res.body) {
      console.error("Gemini error", res.status, await res.text());
      if (res.status === 429) return fail(503, "AI_BUSY", "AI is busy, try again shortly.");
      if (res.status === 400 || res.status === 403) return fail(502, "AI_AUTH_ERROR", "AI service is misconfigured.");
      return fail(502, "AI_UPSTREAM_ERROR", "The AI service returned an error.");
    }

    // 8. Stream -> SSE
    const enc = new TextEncoder();
    const geminiBody = res.body;
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        let full = "";
        let pt = 0;
        let ct = 0;
        try {
          const reader = geminiBody.getReader();
          const dec = new TextDecoder();
          let buf = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload) continue;
              const chunk = JSON.parse(payload);
              const text = chunk.candidates?.[0]?.content?.parts
                ?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
              if (text) { full += text; send({ type: "delta", text }); }
              if (chunk.usageMetadata) {
                pt = chunk.usageMetadata.promptTokenCount ?? pt;
                ct = chunk.usageMetadata.candidatesTokenCount ?? ct;
              }
            }
          }
          if (!full) {
            send({ type: "error", code: "EMPTY_AI_RESPONSE", message: "The AI returned an empty response. Please try again." });
            return;
          }
          if (!convoId) {
            const { data: created, error: cErr } = await admin.from("conversations").insert({
              organization_id: bot.organization_id, chatbot_id: bot.id, visitor_id: visitorId,
              user_id: null, title: message.slice(0, 50),
              system_prompt: bot.system_prompt ?? null, model: MODEL,
            }).select("id").single();
            if (cErr) throw cErr;
            convoId = created.id;
          }
          const now = Date.now();
          const { error: mErr } = await admin.from("messages").insert([
            { conversation_id: convoId, role: "user", content: message, created_at: new Date(now).toISOString() },
            { conversation_id: convoId, role: "assistant", content: full, prompt_tokens: pt,
              completion_tokens: ct, created_at: new Date(now + 1).toISOString() },
          ]);
          if (mErr) throw mErr;
          await admin.rpc("record_visitor_usage", { p_bot: bot.id, p_visitor: visitorId, p_tokens: pt + ct });
          await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convoId);
          send({ type: "done", conversationId: convoId });
        } catch (e) {
          console.error("Stream error:", e);
          send({ type: "error", code: "STREAM_FAILED", message: "The connection was interrupted. Please try again." });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { ...h, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("Unhandled:", e);
    return fail(500, "INTERNAL_ERROR", "Something went wrong");
  }
});