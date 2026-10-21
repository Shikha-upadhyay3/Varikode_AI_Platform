// Shared helpers for the knowledge-base Edge Functions.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Errors whose message is safe to show to the end user.
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

// Must match the vector(1536) column in knowledge_chunks.
export const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_MODEL = "gemini-embedding-001";
const BATCH_SIZE = 50;

function normalize(values: number[]): number[] {
  // Gemini only returns unit-length vectors at 3072 dimensions,
  // so we normalise the shorter ones ourselves for cosine search.
  let sum = 0;
  for (const v of values) sum += v * v;
  const norm = Math.sqrt(sum) || 1;
  return values.map((v) => v / norm);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedBatch(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
  apiKey: string,
): Promise<number[][]> {
  const body = JSON.stringify({
    requests: texts.map((text) => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: EMBEDDING_DIMENSIONS,
    })),
  });

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body,
        signal: AbortSignal.timeout(60_000),
      },
    );

    if (res.ok) {
      const data = await res.json();
      const list = data?.embeddings;
      if (!Array.isArray(list) || list.length !== texts.length) {
        throw new Error("Unexpected embedding response");
      }
      return list.map((e: { values: number[] }) => normalize(e.values));
    }

    // Rate limit or temporary server problem: wait and retry.
    if (res.status === 429 || res.status >= 500) {
      await res.body?.cancel();
      await sleep(1500 * 2 ** attempt);
      continue;
    }

    await res.body?.cancel();
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new UserError(
        "The embedding service rejected the request. Check the GEMINI_API_KEY secret.",
      );
    }
    throw new Error(`Embedding request failed (${res.status})`);
  }

  throw new UserError(
    "The embedding service is busy or rate limited. Please try again in a minute.",
  );
}

export async function embedTexts(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[][]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new UserError("GEMINI_API_KEY secret is not configured.");

  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const part = await embedBatch(texts.slice(i, i + BATCH_SIZE), taskType, apiKey);
    all.push(...part);
  }
  return all;
}

// pgvector accepts the "[0.1,0.2,...]" text form through PostgREST.
export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}