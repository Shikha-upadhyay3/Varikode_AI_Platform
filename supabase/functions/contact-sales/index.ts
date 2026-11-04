// contact-sales: sends a "Contact us" message from the dashboard to Varikode's email.
//
// Secrets to set in Supabase (Edge Functions > Secrets):
//   RESEND_API_KEY       API key of the email service (this file uses Resend)
//   CONTACT_FROM_EMAIL   sender address on a domain verified in that service,
//                        e.g. "Varikode.ai <noreply@varikode.com>"
//   CONTACT_TO_EMAIL     optional, defaults to info@varikode.com
//
// The function needs a signed-in user (Supabase checks the JWT by default),
// so only logged-in dashboard users can call it.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+()\-\s]{7,20}$/;

const TO = Deno.env.get("CONTACT_TO_EMAIL") ?? "info@varikode.com";
const FROM = Deno.env.get("CONTACT_FROM_EMAIL") ?? "";
const API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

Deno.serve(async (req) => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Use POST" });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const org = typeof body?.organizationName === "string" ? body.organizationName.trim().slice(0, 120) : "";

  if (!name || name.length > 80) return json(400, { error: "Please enter your name." });
  if (!email || email.length > 254 || !EMAIL.test(email)) return json(400, { error: "Please enter a valid email." });
  if (!PHONE.test(phone)) return json(400, { error: "Please enter a valid contact number." });
  if (!message || message.length > 2000) return json(400, { error: "Message must be 1 to 2000 characters." });

  if (!API_KEY || !FROM) {
    console.error("contact-sales: RESEND_API_KEY or CONTACT_FROM_EMAIL is not set");
    return json(500, { error: "Email sending is not configured." });
  }

  const html =
    `<p><strong>Name:</strong> ${esc(name)}</p>` +
    `<p><strong>Email:</strong> ${esc(email)}</p>` +
    `<p><strong>Phone:</strong> ${esc(phone)}</p>` +
    (org ? `<p><strong>Workspace:</strong> ${esc(org)}</p>` : "") +
    `<p><strong>Message:</strong></p><p>${esc(message).replace(/\n/g, "<br>")}</p>`;

const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
     from: FROM,
      to: [TO],
      reply_to: email,
      subject: `Varikode.ai enquiry from ${name}`,
      html,
    }),
  });

  if (!res.ok) {
    console.error("contact-sales: email service error", res.status, await res.text());
    return json(502, { error: "Could not send the message." });
  }
  return json(200, { ok: true });
});