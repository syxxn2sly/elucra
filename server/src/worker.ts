/**
 * CLAIRITY API proxy.
 *
 * The app used to call api.anthropic.com directly with an EXPO_PUBLIC_ key,
 * which ships inside the binary and can be extracted from it by anyone who
 * installs the app. This holds the key server-side instead.
 *
 * A plain forwarder would not actually fix anything — it would just move the
 * open endpoint from Anthropic to here, still spending the same money, only now
 * without even a per-key dashboard to notice it. So this also:
 *
 *   - requires a client token, so the endpoint is not usable by a bare curl
 *   - rate-limits per client IP, so one caller cannot drain the budget
 *   - allows only the one upstream path the app actually uses
 *   - caps the request body, since the app already resizes below this
 *
 * None of that makes abuse impossible: the client token ships in the app too,
 * and a determined person will find it. What it buys is containment — a token
 * you can rotate without an App Store release, a ceiling on spend per IP, and
 * somewhere to see it happening.
 */

interface Env {
  /** The real Anthropic key. `wrangler secret put ANTHROPIC_API_KEY` — never in wrangler.toml. */
  ANTHROPIC_API_KEY: string;
  /** Shared token the app sends. Rotate this to cut off a leaked build. */
  CLIENT_TOKEN: string;
  /** Durable rate-limit counters, keyed by IP. */
  RATE_LIMIT: KVNamespace;
}

const UPSTREAM = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** The app resizes to 3 MB before encoding; this leaves room for the JSON around it. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/** Per-IP ceiling. A real user scans a handful of documents a day, not sixty. */
const RATE_LIMIT_REQUESTS = 60;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function underRateLimit(ip: string, env: Env): Promise<boolean> {
  const key = `rl:${ip}`;
  const current = Number((await env.RATE_LIMIT.get(key)) ?? "0");
  if (current >= RATE_LIMIT_REQUESTS) return false;
  // The TTL is the window: the count simply expires rather than needing a reset
  // job, which keeps this to one read and one write per request.
  await env.RATE_LIMIT.put(key, String(current + 1), {
    expirationTtl: RATE_LIMIT_WINDOW_SECONDS,
  });
  return true;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return json({ error: { message: "Only POST is supported." } }, 405);
    }
    if (new URL(request.url).pathname !== "/v1/messages") {
      return json({ error: { message: "Unknown endpoint." } }, 404);
    }

    // Constant-time-ish comparison is overkill for a shared token, but an early
    // length check avoids leaking its length through timing on a long guess.
    const token = request.headers.get("x-clairity-token") ?? "";
    if (token.length !== env.CLIENT_TOKEN.length || token !== env.CLIENT_TOKEN) {
      return json({ error: { message: "Not authorised." } }, 401);
    }

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) {
      return json({ error: { message: "That document is too large to process." } }, 413);
    }

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    if (!(await underRateLimit(ip, env))) {
      return json(
        { error: { message: "Too many requests. Please try again later." } },
        429,
      );
    }

    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return json({ error: { message: "That document is too large to process." } }, 413);
    }

    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body,
    });

    // Pass the upstream status and body through untouched — the app already
    // maps 401/413/429/5xx to specific messages, and rewriting them here would
    // mean maintaining that mapping twice.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  },
};
