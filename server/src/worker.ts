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
  /**
   * Hourly spend budget, keyed by IP.
   *
   * KV reads are eventually consistent, so a burst of read-modify-write loses
   * updates — 25 rapid requests measured as 7. It is kept because an approximate
   * hourly ceiling is still worth having, but it undercounts, which means it errs
   * toward letting traffic through. The two limiters below are the precise ones.
   */
  RATE_LIMIT: KVNamespace;
  /** Exact per-ip rejection counter. One Durable Object per ip. */
  PROBE_COUNTER: DurableObjectNamespace;
  /** Accepted requests per IP per minute, to cap a burst. */
  BURST_LIMITER: RateLimit;
  /**
   * Where to post an incident. Optional — set it with
   * `wrangler secret put ALERT_WEBHOOK` when there is somewhere to send.
   * Without it incidents are still detected, logged and recorded in KV.
   */
  ALERT_WEBHOOK?: string;
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
  Token probing. A handful of 401s is ordinary — a stale build, a half-filled
  local .env. Twenty from ONE ip inside fifteen minutes is somebody working
  through guesses against a token they pulled out of the app.

  Counted per ip rather than globally for that reason: a global count of 401s is
  dominated by harmless noise and would either never fire or fire constantly.
*/
/** Rejections from one ip within the window before an incident is raised. */
const PROBE_THRESHOLD = 20;
/** How long one incident suppresses repeats for the same ip. */
const PROBE_WINDOW_SECONDS = 900;

/*
  Incidents are kept for a week so there is a history to look at, rather than
  only a notification that may have been missed. Read them with:
    npx wrangler kv key list --binding RATE_LIMIT --prefix incident:
*/
const INCIDENT_TTL_SECONDS = 604800;

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

/**
 * Count one rejection for this ip and raise an incident when it crosses the
 * threshold.
 *
 * Fires once per window, not on every request past the line: the counter keeps
 * climbing but `fired:` is set the first time, so a sustained probe produces one
 * incident rather than hundreds of notifications.
 */
async function noteProbe(ip: string, env: Env, request: Request): Promise<void> {
  const counter = env.PROBE_COUNTER.get(env.PROBE_COUNTER.idFromName(ip));
  const { count, raise } = await counter
    .fetch("https://probe/count")
    .then((r) => r.json<{ count: number; raise: boolean }>());
  if (!raise) return;

  const incident = {
    kind: "token_probe",
    ip,
    count,
    window_seconds: PROBE_WINDOW_SECONDS,
    country: request.headers.get("cf-ipcountry") ?? "??",
    agent: (request.headers.get("user-agent") ?? "").slice(0, 120),
    at: new Date().toISOString(),
  };

  /*
    console.error, not console.log: the Observability tab counts and surfaces
    errors on its own, so an incident is visible there without any alert having
    been configured. Ordinary rejections stay at log level so they do not drown it.
  */
  console.error({ incident_raised: true, ...incident });

  await env.RATE_LIMIT.put(`incident:${incident.at}:${ip}`, JSON.stringify(incident), {
    expirationTtl: INCIDENT_TTL_SECONDS,
  });

  if (!env.ALERT_WEBHOOK) return;

  const summary =
    `Elucra proxy: ${count} rejected tokens from ${ip} (${incident.country})` +
    ` in ${PROBE_WINDOW_SECONDS / 60} minutes. Agent: ${incident.agent || "none"}`;

  try {
    await fetch(env.ALERT_WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      /*
        Both `content` and `text`, because the two services that take a plain
        webhook URL disagree. Discord reads `content` and rejects a body without
        it as an empty message; Slack reads `text`. Each ignores the other's
        field, so one body satisfies both and the URL can be swapped without a
        redeploy.
      */
      body: JSON.stringify({ content: summary, text: summary, incident }),
    });
  } catch {
    // A webhook that is down must not take the proxy with it. The incident is
    // already in KV and in the logs either way.
  }
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
  A strongly-consistent counter, because nothing else here is one.

  KV loses writes under a burst — 25 requests measured as 7. The rate limiting
  binding is documented as "permissive, eventually consistent, and intentionally
  designed to not be used as an accurate accounting system", and in testing it
  did not trip at all for 30 requests over 48 seconds. Neither can answer "has
  this ip been refused twenty times", which is the whole question.

  A Durable Object is single-threaded per key, so the read and the write cannot
  interleave. One instance per ip.
*/
export class ProbeCounter {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(): Promise<Response> {
    const now = Date.now();
    const windowStart = (await this.state.storage.get<number>("windowStart")) ?? 0;
    const fired = (await this.state.storage.get<boolean>("fired")) ?? false;
    let count = (await this.state.storage.get<number>("count")) ?? 0;

    // Expired window: start a new one and clear the fired flag with it.
    if (now - windowStart > PROBE_WINDOW_SECONDS * 1000) {
      await this.state.storage.put({ windowStart: now, count: 1, fired: false });
      return Response.json({ count: 1, raise: false });
    }

    count += 1;
    // Raise once per window, not on every request past the line.
    const raise = count >= PROBE_THRESHOLD && !fired;
    await this.state.storage.put(raise ? { count, fired: true } : { count });
    return Response.json({ count, raise });
  }
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
    const clientIp = request.headers.get("cf-connecting-ip") ?? "unknown";

    const token = request.headers.get("x-clairity-token") ?? "";
    if (token.length !== env.CLIENT_TOKEN.length || token !== env.CLIENT_TOKEN) {
      // waitUntil, so counting the attempt never delays the refusal.
      ctx.waitUntil(noteProbe(clientIp, env, request));
      return reject("bad_token", request, { error: { message: "Not authorised." } }, 401);
    }

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) {
      return reject("too_large", request, { error: { message: "That document is too large to process." } }, 413);
    }

    /*
      Two limits, doing different jobs. This one is consistent and catches a
      burst; the KV budget below is approximate and caps the hour. A real person
      photographs a few documents in a sitting, not twelve in a minute.
    */
    const burst = await env.BURST_LIMITER.limit({ key: clientIp });
    if (!burst.success) {
      return reject(
        "burst_limited",
        request,
        { error: { message: "Too many requests. Please try again in a moment." } },
        429,
      );
    }

    if (!(await underRateLimit(clientIp, env))) {
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
