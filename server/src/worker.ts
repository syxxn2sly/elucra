/**
 * API proxy. holds the Anthropic key server-side.
 *
 * the app used to call api.anthropic.com directly with an EXPO_PUBLIC_ key,
 * which ships in the binary and can be pulled out of it.
 *
 * a plain forwarder wouldn't fix that — it would just move the open endpoint
 * here, spending the same money with less visibility. so this also requires a
 * client token, rate-limits per IP, allows only the one upstream path the app
 * uses, and caps the body size.
 *
 * this doesn't make abuse impossible; the client token ships in the app too.
 * it buys containment: a token you can rotate without an App Store release, a
 * spend ceiling per IP, and somewhere to see it happening.
 */

interface Env {
  /** the real key. set with `wrangler secret put` — never in wrangler.toml. */
  ANTHROPIC_API_KEY: string;
  /** shared token the app sends. rotate to cut off a leaked build. */
  CLIENT_TOKEN: string;
  /** rate-limit counters, keyed by IP. */
  RATE_LIMIT: KVNamespace;
}

const UPSTREAM = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** the app resizes to 3 MB before encoding; this leaves room for the JSON. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/*
  this used to forward the body untouched, which left `model` and `max_tokens`
  under the caller's control. since the client token ships in the app, anyone
  who extracted it could ask for any model at any length — well into the
  hundreds of dollars an hour from a single IP, all inside the rate limit.

  the app only asks for one model and never more than 8000 tokens, so pinning
  both costs nothing and turns "any Claude request" back into "the requests this
  app makes".
*/
const ALLOWED_MODELS = new Set(["claude-sonnet-5"]);
const MAX_OUTPUT_TOKENS = 8192;
/** extract sends one image plus prompts; nothing legitimate is longer. */
const MAX_MESSAGES = 8;

/** per-IP ceiling. a real user scans a few documents a day, not sixty. */
const RATE_LIMIT_REQUESTS = 60;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

/*
  Browsers preflight this endpoint; the native app does not. `expo start --web`
  runs on some localhost port, so without CORS every AI call fails in a browser
  while working fine on device.

  Only localhost is reflected, and deliberately so. Answering every origin would
  turn this into an endpoint any web page could call with a token lifted from
  the app bundle, which is precisely the exposure the proxy exists to contain.
  A real web build gets its own origin added here, explicitly.
*/
function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" ? origin : null;
  } catch {
    return null;
  }
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = allowedOrigin(request);
  if (!origin) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type, x-clairity-token",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function json(body: unknown, status: number, request?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(request ? corsHeaders(request) : {}),
    },
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

/**
 * Narrow the forwarded body to the shape the app actually sends.
 *
 * Returns an error string to reject with, or null to allow. This is a
 * containment check, not a schema validator: Anthropic will reject genuinely
 * malformed bodies itself, and duplicating its schema here would mean keeping
 * two copies of it correct. What this stops is a *well-formed* request that
 * costs far more than any request the app makes.
 */
function rejectionReason(body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return "Malformed request.";
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return "Malformed request.";
  }
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.model !== "string" || !ALLOWED_MODELS.has(obj.model)) {
    return "Unsupported model.";
  }
  const maxTokens = obj.max_tokens;
  if (typeof maxTokens !== "number" || !Number.isFinite(maxTokens) || maxTokens < 1) {
    return "Invalid max_tokens.";
  }
  if (maxTokens > MAX_OUTPUT_TOKENS) {
    return "Requested response is too long.";
  }
  if (!Array.isArray(obj.messages) || obj.messages.length === 0) {
    return "Malformed request.";
  }
  if (obj.messages.length > MAX_MESSAGES) {
    return "Too many messages in one request.";
  }
  // `stream` is never used by the app, and streaming responses would bypass the
  // pass-through below in ways not worth supporting for an endpoint this narrow.
  if (obj.stream === true) {
    return "Streaming is not supported.";
  }
  return null;
}

/*
  One line per rejected request, so there is something to alert on.

  Deliberately metadata only: never the body, never the token, never any part
  of a document. This proxy carries medical records, and a log that captured
  them would be a worse liability than the attack it was meant to catch.

  Shows up in `wrangler tail` live, and in Workers Logs for querying, which is
  what the dashboard notification policies read.
*/
function reject(
  event: string,
  request: Request,
  body: unknown,
  status: number,
): Response {
  /*
    Logged as an object, not a JSON string. Workers Logs extracts and indexes
    the fields of an object; a string arrives as one opaque `message` that can
    only be substring-matched, which makes it useless to alert on.
  */
  console.log({
    // named reject_reason, not "event": the query builder's own namespace is
    // full of $workers.event.*, and a custom key called event is a nuisance to
    // find among them.
    reject_reason: event,
    status,
    ip: request.headers.get("cf-connecting-ip") ?? "unknown",
    country: request.headers.get("cf-ipcountry") ?? "??",
    agent: (request.headers.get("user-agent") ?? "").slice(0, 80),
  });
  return json(body, status, request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // The preflight carries no token: browsers send it before the real request,
    // and refusing it here would mean the real request is never sent at all.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== "POST") {
      return reject("bad_method", request, { error: { message: "Only POST is supported." } }, 405);
    }
    if (new URL(request.url).pathname !== "/v1/messages") {
      return reject("bad_path", request, { error: { message: "Unknown endpoint." } }, 404);
    }

    // Constant-time-ish comparison is overkill for a shared token, but an early
    // length check avoids leaking its length through timing on a long guess.
    // header name is part of the deployed contract; the shipped app sends this.
    const token = request.headers.get("x-clairity-token") ?? "";
    if (token.length !== env.CLIENT_TOKEN.length || token !== env.CLIENT_TOKEN) {
      return reject("bad_token", request, { error: { message: "Not authorised." } }, 401);
    }

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) {
      return reject("too_large", request, { error: { message: "That document is too large to process." } }, 413);
    }

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    if (!(await underRateLimit(ip, env))) {
      return reject(
        "rate_limited",
        request,
        { error: { message: "Too many requests. Please try again later." } },
        429,
      );
    }

    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return reject("too_large", request, { error: { message: "That document is too large to process." } }, 413);
    }

    const rejection = rejectionReason(body);
    if (rejection) {
      return reject("body_rejected", request, { error: { message: rejection } }, 400);
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
      headers: { "content-type": "application/json", ...corsHeaders(request) },
    });
  },
};
