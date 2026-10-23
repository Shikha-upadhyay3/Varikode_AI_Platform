import { createClient } from "npm:@supabase/supabase-js@2";

const VISITOR_DAILY_LIMIT = 20;   // ek visitor ke din ke messages
const BOT_DAILY_LIMIT = 500;      // ek bot ke total din ke messages (budget bachane ke liye)
const HISTORY_LIMIT = 20;
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash";
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
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

  // Browser preflight: bot ka pata abhi nahi, asli check POST par hota hai
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Use POST");

  try {
    // 1.     // 1. Validate request
    const body = await req.json().catch(() => null);
    const action = typeof body?.action === "string" ? body.action : "message";
    const publicKey = typeof body?.publicKey === "string" ? body.publicKey : "";
    const visitorId = typeof body?.visitorId === "string" ? body.visitorId : "";
    const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!publicKey) return fail(400, "VALIDATION_ERROR", "publicKey required");

    // 2. Find chatbot
    const { data: bot, error: botError } = await admin
      .from("chatbots")
      .select("*")
      .eq("public_key", publicKey)
      .maybeSingle();

    if (botError) throw botError;
    if (!bot) return fail(404, "BOT_NOT_FOUND", "Chatbot not found");

    // 3. Check website origin
    const allowed = String(bot.allowed_origins ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (!allowed.includes("*") && (!origin || !allowed.includes(origin))) {
      return fail(403, "ORIGIN_NOT_ALLOWED", "This website is not allowed to use this chatbot");
    }

    // 3a. Widget configuration
    if (action === "config") {
      return json(200, {
        name: bot.name,
        welcomeMessage: bot.welcome_message ?? "Hi! How can I help you today?",
        theme: bot.theme ?? null,
      });
    }

    // 3b. Save a visitor's request to talk to a human
    if (action === "handoff") {
      if (!UUID.test(visitorId)) {
        return fail(400, "VALIDATION_ERROR", "Invalid visitorId");
      }

      let handoffConversationId: string;

      if (conversationId) {
        if (!UUID.test(conversationId)) {
          return fail(400, "VALIDATION_ERROR", "Invalid conversationId");
        }

        const { data: existingConversation, error: conversationError } = await admin
          .from("conversations")
          .select("id")
          .eq("id", conversationId)
          .eq("chatbot_id", bot.id)
          .eq("visitor_id", visitorId)
          .maybeSingle();

        if (conversationError) throw conversationError;
        if (!existingConversation) {
          return fail(404, "NOT_FOUND", "Conversation not found");
        }

        handoffConversationId = existingConversation.id;
      } else {
        const { data: createdConversation, error: createError } = await admin
          .from("conversations")
          .insert({
            organization_id: bot.organization_id,
            chatbot_id: bot.id,
            visitor_id: visitorId,
            user_id: null,
            title: "Human support request",
            system_prompt: bot.system_prompt ?? null,
            model: MODEL,
          })
          .select("id")
          .single();

        if (createError) throw createError;
        handoffConversationId = createdConversation.id;
      }

      const handoffMessage = message
        ? `Visitor requested human support: ${message.slice(0, 2000)}`
        : "Visitor requested to talk to a human.";
      const now = Date.now();

      const { error: saveHandoffError } = await admin.from("messages").insert([
        {
          conversation_id: handoffConversationId,
          role: "user",
          content: handoffMessage,
          created_at: new Date(now).toISOString(),
        },
        {
          conversation_id: handoffConversationId,
          role: "assistant",
          content: "Your request has been recorded for the support team.",
          created_at: new Date(now + 1).toISOString(),
        },
      ]);

      if (saveHandoffError) throw saveHandoffError;

      await admin
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", handoffConversationId);

      return json(200, {
        conversationId: handoffConversationId,
        handoff: true,
        reply: "Your request has been recorded for the support team.",
      });
    }

    if (action !== "message") {
      return fail(400, "VALIDATION_ERROR", "Unknown action");
    }

    // 4. Validate a normal chat message
    if (!UUID.test(visitorId)) {
      return fail(400, "VALIDATION_ERROR", "Invalid visitorId");
    }
    if (!message || message.length > 2000) {
      return fail(400, "VALIDATION_ERROR", "Message must be 1 to 2000 characters");
    }

    // 5. Purani conversation (agar hai) aur history
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
    let res: Response;
    try {
      res = await callGemini(contents, bot.system_prompt ?? null);
    } catch (e) {
      if ((e as Error).name === "AbortError") return fail(504, "AI_TIMEOUT", "The AI took too long. Please try again.");
      return fail(502, "AI_UNREACHABLE", "Could not reach the AI service.");
    }
    if (!res.ok) {
      console.error("Gemini error", res.status, await res.text());
      if (res.status === 429) return fail(503, "AI_BUSY", "AI is busy, try again shortly.");
      if (res.status === 400 || res.status === 403) return fail(502, "AI_AUTH_ERROR", "AI service is misconfigured.");
      return fail(502, "AI_UPSTREAM_ERROR", "The AI service returned an error.");
    }
    const ai = await res.json();
    const reply = ai.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
    if (!reply) return fail(502, "EMPTY_AI_RESPONSE", "The AI returned an empty response");
    const pt = ai.usageMetadata?.promptTokenCount ?? 0;
    const ct = ai.usageMetadata?.candidatesTokenCount ?? 0;

    // 7. Save (nayi conversation sirf success ke baad banti hai)
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