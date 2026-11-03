// Edge Function: process-knowledge-source
// pending -> processing -> ready / failed
// Reads a file (PDF/TXT) or a public website, splits the text into chunks,
// creates embeddings and stores them in knowledge_chunks.
//
// WEBSITES: the start page AND the pages it links to (plus sitemap.xml pages)
// are crawled. Every chunk begins with "Title: <title>" and "URL: <url>", so the
// chatbot can answer about inner pages and give the exact link.

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
const MAX_CHUNKS = 150;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

// Website crawl limits (raise carefully: edge functions have a time limit)
const MAX_PAGES = 25; // pages read per website source
const MAX_PAGE_CHARS = 20_000; // text used from one page
const CRAWL_BUDGET_MS = 40_000; // stop fetching new pages after this
const CONCURRENCY = 5;

// Embedding is done in small batches so the free Gemini limits are not hit
const EMBED_BATCH = 20;
const EMBED_PAUSE_MS = 4_000;

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
      throw new UserError("This page is too large.");
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

/* ------------------------------------------------------------------ */
/* URL helpers                                                         */
/* ------------------------------------------------------------------ */
const SKIP_EXT = /\.(jpe?g|png|gif|webp|svg|ico|pdf|zip|gz|css|js|json|xml|mp4|mp3|woff2?|ttf|eot)$/i;
const TRACKING_PARAM = /^(utm_|gclid$|fbclid$|mc_|ref$)/i;

// Absolute, clean URL (no #hash, no tracking params), or null if not a web page link.
function normalizeUrl(raw: string, base: URL): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim(), base);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(u.protocol)) return null;
  u.hash = "";
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
  }
  if (SKIP_EXT.test(u.pathname)) return null;
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
  return u.toString();
}

function sameSite(a: string, b: URL): boolean {
  try {
    return new URL(a).hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

function htmlToText(html: string, base?: URL): string {
  let src = html;
  if (base) {
    // Keep link targets in the text: "Diamond Rings (https://site.com/diamond-rings)"
    src = src.replace(
      /<a\s[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, inner: string) => {
        const label = decodeEntities(String(inner).replace(/<[^>]+>/g, " "))
          .replace(/\s+/g, " ")
          .trim();
        const abs = normalizeUrl(href, base);
        if (!label || label.length > 80 || !abs || !sameSite(abs, base)) return ` ${label} `;
        return ` ${label} (${abs}) `;
      },
    );
  }
  const stripped = src
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

function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim().slice(0, 120) : "";
}

function extractLinks(html: string, base: URL): string[] {
  const out: string[] = [];
  const re = /<a\s[^>]*?href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const n = normalizeUrl(m[1], base);
    if (n && sameSite(n, base)) out.push(n);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Fetch one public URL (every redirect target is checked again)       */
/* ------------------------------------------------------------------ */
async function fetchPublic(
  raw: string,
  opts: { xml?: boolean; limit?: number } = {},
): Promise<{ body: string; type: string; finalUrl: string }> {
  let current = raw;
  for (let hop = 0; hop <= 3; hop++) {
    const url = await assertPublicUrl(current);

    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "User-Agent": "VarikodeBot/1.0 (knowledge ingestion)",
          Accept: opts.xml ? "text/html,text/plain,application/xml,text/xml" : "text/html,text/plain",
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
    const allowed = opts.xml
      ? /text\/html|text\/plain|application\/xhtml\+xml|xml/i
      : /text\/html|text\/plain|application\/xhtml\+xml/i;
    if (!allowed.test(type)) {
      await res.body?.cancel();
      throw new UserError("Only HTML or plain text pages are supported.");
    }

    const body = await readLimited(res, opts.limit ?? MAX_PAGE_BYTES);
    return { body, type, finalUrl: url.toString() };
  }
  throw new UserError("The website redirected too many times.");
}

/* ------------------------------------------------------------------ */
/* Website crawl                                                       */
/* ------------------------------------------------------------------ */
type CrawledPage = { url: string; title: string; text: string };

async function sitemapUrls(start: URL): Promise<string[]> {
  const locs: string[] = [];
  const readLocs = (xml: string) => {
    const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
    let m: RegExpExecArray | null;
    const found: string[] = [];
    while ((m = re.exec(xml)) !== null) found.push(decodeEntities(m[1]));
    return found;
  };
  try {
    const root = await fetchPublic(`${start.origin}/sitemap.xml`, { xml: true, limit: 5 * 1024 * 1024 });
    const first = readLocs(root.body);
    if (/<sitemapindex/i.test(root.body)) {
      // Index of sitemaps: read the first few
      for (const child of first.slice(0, 3)) {
        try {
          const c = await fetchPublic(child, { xml: true, limit: 5 * 1024 * 1024 });
          locs.push(...readLocs(c.body));
        } catch { /* skip this sitemap */ }
        if (locs.length > 500) break;
      }
    } else {
      locs.push(...first);
    }
  } catch { /* site has no readable sitemap: fine */ }
  return locs.slice(0, 500);
}

async function crawlSite(startRaw: string): Promise<CrawledPage[]> {
  const deadline = Date.now() + CRAWL_BUDGET_MS;

  // The start page itself must work; its errors are shown to the user.
  const first = await fetchPublic(startRaw);
  const startUrl = new URL(first.finalUrl);
  const isHtml = !/text\/plain/i.test(first.type);

  const pages: CrawledPage[] = [];
  const doneUrls = new Set<string>();
  const addPage = (finalUrl: string, html: string, plain: boolean) => {
    const key = normalizeUrl(finalUrl, startUrl) ?? finalUrl;
    if (doneUrls.has(key)) return;
    const text = plain ? html : htmlToText(html, new URL(finalUrl));
    if (text.trim().length < 40) return;
    doneUrls.add(key);
    pages.push({ url: key, title: plain ? "" : extractTitle(html), text });
  };
  addPage(first.finalUrl, first.body, !isHtml);

  // Candidate pages: links on the start page first, then the sitemap.
  const seen = new Set<string>([normalizeUrl(first.finalUrl, startUrl) ?? first.finalUrl]);
  const queue: string[] = [];
  const push = (raw: string) => {
    const n = normalizeUrl(raw, startUrl);
    if (n && sameSite(n, startUrl) && !seen.has(n)) {
      seen.add(n);
      queue.push(n);
    }
  };
  if (isHtml) extractLinks(first.body, startUrl).forEach(push);
  (await sitemapUrls(startUrl)).forEach(push);

  let next = 0;
  async function worker() {
    while (pages.length < MAX_PAGES && Date.now() < deadline) {
      const target = queue[next++];
      if (!target) return;
      try {
        const r = await fetchPublic(target);
        if (!sameSite(r.finalUrl, startUrl)) continue; // never leave the customer's site
        addPage(r.finalUrl, r.body, /text\/plain/i.test(r.type));
      } catch { /* skip pages that fail */ }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return pages.slice(0, MAX_PAGES);
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
/* Embeddings in small batches (waits when the service is busy)        */
/* ------------------------------------------------------------------ */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedInBatches(chunks: string[]): Promise<Awaited<ReturnType<typeof embedTexts>>> {
  const out: Awaited<ReturnType<typeof embedTexts>> = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    for (let attempt = 0; ; attempt++) {
      try {
        out.push(...(await embedTexts(batch, "RETRIEVAL_DOCUMENT")));
        break;
      } catch (error) {
        const busy = error instanceof UserError && /busy or rate limited/i.test(error.message);
        if (!busy || attempt >= 3) throw error;
        await sleep(20_000); // rate limited: wait, then try this batch again
      }
    }
    if (i + EMBED_BATCH < chunks.length) await sleep(EMBED_PAUSE_MS);
  }
  return out;
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
    let chunks: string[] = [];
    let truncated = false;
    let charCount = 0;
    let pagesCrawled = 0;

    if (claimed.source_type === "file") {
      if (!claimed.file_path) throw new UserError("This source has no stored file.");
      const { data: blob, error: downloadError } = await admin.storage
        .from(BUCKET)
        .download(claimed.file_path);
      if (downloadError || !blob) throw new UserError("The stored file could not be read.");
      if (blob.size > MAX_FILE_BYTES) throw new UserError("The file is larger than 10 MB.");
      let text = await extractFileText(
        claimed.file_path,
        new Uint8Array(await blob.arrayBuffer()),
      );
      text = text.replace(/\u0000/g, "").trim();
      if (!text) {
        throw new UserError(
          "No readable text was found. Scanned or image-only PDFs are not supported.",
        );
      }
      truncated = text.length > MAX_CHARS;
      charCount = Math.min(text.length, MAX_CHARS);
      chunks = chunkText(truncated ? text.slice(0, MAX_CHARS) : text);
    } else {
      if (!claimed.url) throw new UserError("This source has no website link.");
      const pages = await crawlSite(claimed.url);
      pagesCrawled = pages.length;
      for (const page of pages) {
        const body = page.text.replace(/\u0000/g, "").trim();
        if (!body) continue;
        charCount += Math.min(body.length, MAX_PAGE_CHARS);
        // Every chunk carries the page title and link so the bot can share them.
        const header = `Title: ${page.title || page.url}\nURL: ${page.url}\n\n`;
        const usable = body.length > MAX_PAGE_CHARS ? body.slice(0, MAX_PAGE_CHARS) : body;
        for (const piece of chunkText(usable)) chunks.push(header + piece);
      }
      if (chunks.length === 0) {
        throw new UserError(
          "No readable text was found on this website. Sites that load their content only with JavaScript may not be readable.",
        );
      }
    }

    if (chunks.length > MAX_CHUNKS) {
      chunks = chunks.slice(0, MAX_CHUNKS);
      truncated = true;
    }

    const embeddings = await embedInBatches(chunks);

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
          char_count: charCount,
          truncated,
          ...(claimed.source_type === "file" ? {} : { pages_crawled: pagesCrawled }),
        },
      })
      .eq("id", claimed.id);
    if (doneError) throw new Error(doneError.message);

    return json({ ok: true, chunks: chunks.length, truncated, pages: pagesCrawled });
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