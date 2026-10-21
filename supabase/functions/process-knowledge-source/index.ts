// Edge Function: process-knowledge-source
// pending -> processing -> ready / failed
// Reads a file (PDF/TXT) or a public web page, splits the text into chunks,
// creates embeddings and stores them in knowledge_chunks.

import { createClient } from "npm:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import { isIP } from "node:net";
import {
  corsHeaders,
  embedTexts,
  json,
  toVectorLiteral,
  UserError,
  UUID_RE,
} from "../_shared/common.ts";

const BUCKET = "knowledge-files";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // same as the bucket limit
const MAX_PAGE_BYTES = 2 * 1024 * 1024; // website HTML limit
const MAX_PDF_PAGES = 300;
const MAX_CHARS = 250_000;
const MAX_CHUNKS = 200;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

/* ------------------------------------------------------------------ */
/* Website fetching with SSRF protection                               */
/* ------------------------------------------------------------------ */
function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::" || s === "::1") return true;
  if (/^fe[89ab]/.test(s)) return true; // link-local
  if (/^f[cd]/.test(s)) return true; // unique local
  if (s.startsWith("::ffff:")) {
    const v4 = s.slice(7);
    return v4.includes(".") ? isPrivateIPv4(v4) : true;
  }
  return false;
}

const BLOCKED = "This website address is not allowed.";

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UserError("The website link is not valid.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new UserError("Only http and https links are supported.");
  }
  if (url.username || url.password) {
    throw new UserError("Links with embedded credentials are not allowed.");
  }
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new UserError("Only standard web ports (80 and 443) are allowed.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new UserError(BLOCKED);
  }

  let addresses: string[] = [];
  if (isIP(host)) {
    addresses = [host];
  } else {
    const v4 = (await Deno.resolveDns(host, "A").catch(() => [])) as string[];
    const v6 = (await Deno.resolveDns(host, "AAAA").catch(() => [])) as string[];
    addresses = [...v4, ...v6];
    if (addresses.length === 0) {
      throw new UserError("Could not resolve this website address.");
    }
  }

  for (const ip of addresses) {
    const isPrivate = isIP(ip) === 6 ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
    if (isPrivate) throw new UserError(BLOCKED);
  }
  return url;
}

async function readLimited(res: Response, limit: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new UserError("This page is too large (limit 2 MB).");
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = Number(n);
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : " ";
    });
}

function htmlToText(html: string): string {
  const stripped = html
    .replace(/<(script|style|noscript|svg|head|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?(br|p|div|li|ul|ol|h[1-6]|tr|section|article|header|footer|table)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchPublicPage(raw: string): Promise<string> {
  let current = raw;
  for (let hop = 0; hop <= 3; hop++) {
    // Every redirect target is checked again.
    const url = await assertPublicUrl(current);

    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "User-Agent": "VarikodeBot/1.0 (knowledge ingestion)",
          Accept: "text/html,text/plain",
        },
      });
    } catch {
      throw new UserError("The website could not be reached.");
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location) throw new UserError("The website redirected without a destination.");
      current = new URL(location, url).toString();
      continue;
    }

    if (!res.ok) {
      await res.body?.cancel();
      throw new UserError(`The website returned an error (${res.status}).`);
    }

    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml\+xml/i.test(type)) {
      await res.body?.cancel();
      throw new UserError("Only HTML or plain text pages are supported.");
    }

    const body = await readLimited(res, MAX_PAGE_BYTES);
    return /text\/plain/i.test(type) ? body : htmlToText(body);
  }
  throw new UserError("The website redirected too many times.");
}

/* ------------------------------------------------------------------ */
/* File text extraction                                                */
/* ------------------------------------------------------------------ */
async function extractFileText(path: string, bytes: Uint8Array): Promise<string> {
  const ext = path.split(".").pop()?.toLowerCase();

  if (ext === "txt") {
    return new TextDecoder("utf-8").decode(bytes);
  }

  if (ext === "pdf") {
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    if (header !== "%PDF-") throw new UserError("This file is not a valid PDF.");
    try {
      const pdf = await getDocumentProxy(bytes);
      if (pdf.numPages > MAX_PDF_PAGES) {
        throw new UserError(`This PDF has too many pages (limit ${MAX_PDF_PAGES}).`);
      }
      const { text } = await extractText(pdf, { mergePages: true });
      return Array.isArray(text) ? text.join("\n") : text;
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError(
        "This PDF could not be read. It may be damaged or password-protected.",
      );
    }
  }

  throw new UserError("Only PDF and TXT files are supported.");
}

/* ------------------------------------------------------------------ */
/* Chunking                                                            */
/* ------------------------------------------------------------------ */
function chunkText(text: string): string[] {
  const clean = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);

    if (end < clean.length) {
      // Prefer to cut at a paragraph or sentence boundary.
      const window = clean.slice(start, end);
      const cut = Math.max(
        window.lastIndexOf("\n\n"),
        window.lastIndexOf(". "),
        window.lastIndexOf("\n"),
      );
      if (cut > CHUNK_SIZE * 0.5) end = start + cut + 1;
    }

    const piece = clean.slice(start, end).trim();
    if (piece.length > 0) chunks.push(piece);

    if (end >= clean.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return chunks;
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization" }, 401);

  let sourceId = "";
  try {
    const body = await req.json();
    sourceId = String(body?.source_id ?? "");
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!UUID_RE.test(sourceId)) return json({ error: "Invalid source_id" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Client that acts as the signed-in user, so Row Level Security applies.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Not signed in" }, 401);

  // Claim the source. The UPDATE only succeeds when RLS says this user is an
  // owner/admin of the chatbot's organization, so it doubles as the permission
  // check. A "processing" row older than 10 minutes counts as stuck.
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: claimed, error: claimError } = await userClient
    .from("knowledge_sources")
    .update({ status: "processing", error_message: null })
    .eq("id", sourceId)
    .or(
      `status.in.(pending,failed),and(status.eq.processing,updated_at.lt.${staleBefore})`,
    )
    .select("id, chatbot_id, source_type, file_path, url, metadata")
    .maybeSingle();

  if (claimError) {
    console.error("claim failed", claimError.message);
    return json({ error: "Could not start processing" }, 500);
  }
  if (!claimed) {
    return json(
      {
        error:
          "Source not found, already processing, or you do not have permission.",
      },
      409,
    );
  }

  // From here on we use the service role, after authorization above.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    let text: string;

    if (claimed.source_type === "file") {
      if (!claimed.file_path) throw new UserError("This source has no stored file.");
      const { data: blob, error: downloadError } = await admin.storage
        .from(BUCKET)
        .download(claimed.file_path);
      if (downloadError || !blob) throw new UserError("The stored file could not be read.");
      if (blob.size > MAX_FILE_BYTES) throw new UserError("The file is larger than 10 MB.");
      text = await extractFileText(
        claimed.file_path,
        new Uint8Array(await blob.arrayBuffer()),
      );
    } else {
      if (!claimed.url) throw new UserError("This source has no website link.");
      text = await fetchPublicPage(claimed.url);
    }

    text = text.replace(/\u0000/g, "").trim();
    if (!text) {
      throw new UserError(
        "No readable text was found. Scanned or image-only PDFs are not supported.",
      );
    }

    let truncated = text.length > MAX_CHARS;
    let chunks = chunkText(truncated ? text.slice(0, MAX_CHARS) : text);
    if (chunks.length > MAX_CHUNKS) {
      chunks = chunks.slice(0, MAX_CHUNKS);
      truncated = true;
    }

    const embeddings = await embedTexts(chunks, "RETRIEVAL_DOCUMENT");

    // Remove old chunks first so a retry never creates duplicates.
    const { error: clearError } = await admin
      .from("knowledge_chunks")
      .delete()
      .eq("source_id", claimed.id);
    if (clearError) throw new Error(clearError.message);

    const rows = chunks.map((content, index) => ({
      source_id: claimed.id,
      chatbot_id: claimed.chatbot_id,
      chunk_index: index,
      content,
      embedding: toVectorLiteral(embeddings[index]),
    }));

    for (let i = 0; i < rows.length; i += 50) {
      const { error: insertError } = await admin
        .from("knowledge_chunks")
        .insert(rows.slice(i, i + 50));
      if (insertError) throw new Error(insertError.message);
    }

    const { error: doneError } = await admin
      .from("knowledge_sources")
      .update({
        status: "ready",
        error_message: null,
        metadata: {
          ...(claimed.metadata ?? {}),
          chunk_count: chunks.length,
          char_count: Math.min(text.length, MAX_CHARS),
          truncated,
        },
      })
      .eq("id", claimed.id);
    if (doneError) throw new Error(doneError.message);

    return json({ ok: true, chunks: chunks.length, truncated });
  } catch (error) {
    const message =
      error instanceof UserError
        ? error.message
        : "Processing failed. Please try again.";

    // Log the reason, never the document text or any key.
    console.error(
      "process-knowledge-source failed:",
      sourceId,
      error instanceof Error ? error.message.slice(0, 200) : "unknown error",
    );

    await admin.from("knowledge_chunks").delete().eq("source_id", claimed.id);
    await admin
      .from("knowledge_sources")
      .update({ status: "failed", error_message: message })
      .eq("id", claimed.id);

    return json({ ok: false, error: message });
  }
});