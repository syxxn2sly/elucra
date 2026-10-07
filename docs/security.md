# Security posture

Last reviewed 2026-10-07, against build 34 and worker version `fb25d8f9`.

This exists so the dependency triage below is a decision with evidence behind it
rather than something re-argued every time `npm audit` prints a number.

---

## What the architecture rules out

Elucra has no accounts, no login, no sessions, and no server-side database. Health
records live on the device in AsyncStorage; the health card lives in the iOS
Keychain through SecureStore. The only server is `server/src/worker.ts`, a proxy
that forwards to Anthropic and stores nothing.

That removes most of the usual list by construction rather than by control:

- no cross-tenant data leak, because there are no tenants
- no SQL injection, because there is no SQL anywhere in the repo
- no session fixation or timeout question, because there are no sessions
- no credential stuffing surface, because there is nothing to log in to

The flip side is that the device is the security boundary. If the phone is
unlocked, the data is readable, which is why the health card has its own lock.

## Dependencies

`npm audit --omit=dev` in `expo/` reports **48 advisories (1 critical, 31 high,
16 moderate)**. None of them reach the shipped app.

`server/`, the only internet-facing code, reports **0**.

### Why the 48 are not shipped

They arrive through the Expo CLI, Metro, prebuild tooling and react-devtools —
build-time code that runs on a developer machine and is not bundled. Verified
rather than assumed, by building the production bundle and searching it:

```bash
cd expo
npx expo export --platform ios --output-dir /tmp/elucra-export
BUNDLE=$(find /tmp/elucra-export -name '*.hbc')

# positive controls — these are app strings and MUST be found
strings "$BUNDLE" | grep -c "Understand a document"   # 1
strings "$BUNDLE" | grep -c "x-clairity-token"        # 1

# every advisory package — all 0
for p in shell-quote react-devtools-core xmldom node-forge postcss \
         source-map-js undici image-size js-yaml brace-expansion \
         sprintf-js decode-uri-component; do
  echo "$p: $(strings "$BUNDLE" | grep -ci "$p")"
done
```

The positive controls matter. The bundle is Hermes bytecode, not JavaScript, so
a naive `find -name '*.js'` matches nothing and every grep returns zero — which
looks exactly like a clean result. Do not repeat that check without controls.

The advisory classes are also mostly denial of service in build tooling, where
the only inputs are your own source files.

### What this does not excuse

`shell-quote` (critical, via `react-native` → `react-devtools-core`) is still
worth clearing when the upstream fix lands. The route is
`npx expo install --check`, which aligns packages with what the installed SDK
expects. Do **not** run `npm audit fix --force`: it moves packages off the
versions the Expo SDK pins and breaks the build.

Dependabot watches both `expo/` and `server/` — see `.github/dependabot.yml`.
Patch-level version PRs are suppressed for `expo/` because they are noise;
security alerts still fire regardless, since `ignore` suppresses version updates
only.

## The proxy

- Client token required; a request without it gets 401 and nothing else.
- Rate limited to 60 requests/hour per IP, in KV.
- Only `POST /v1/messages`. Every other path and method is refused.
- Body capped at 8 MB; the app resizes to 3 MB before encoding.
- Model pinned to one, `max_tokens` capped at 8192, messages capped at 8. Before
  this, a token holder could request any model at any length.
- CORS allows only localhost origins, for `expo start --web`. Native apps send
  no `Origin`, so this costs nothing in production.
- Errors are generic: "Not authorised.", "Unknown endpoint.". Nothing enumerates.

The client token ships inside the app binary and can be extracted. That is
understood, not overlooked. It buys containment: it rotates with one
`wrangler secret put` and takes effect immediately, with no App Store release.

### Logging and alerting

Every rejection emits one JSON line — event, status, IP, country, truncated user
agent, timestamp. Deliberately **metadata only**: never the request body, never
the token, never any part of a document. This proxy carries medical records, and
a log holding them would be a worse liability than the attacks it catches.

Events: `bad_token`, `bad_path`, `bad_method`, `rate_limited`, `body_rejected`,
`too_large`.

Workers Logs is enabled in `wrangler.toml` (`[observability]`), so these are
retained and queryable rather than visible only in a live tail.

```bash
cd server && npx wrangler tail --format json    # live
```

**Still to do — the alerts themselves.** The log stream exists; nothing watches
it yet. In the Cloudflare dashboard, under Notifications, the two worth having:

1. A spike in `bad_token` from one IP — somebody probing an extracted token.
2. Sustained `rate_limited` — either abuse or the limit is too low for real use.

## The site

`site/_headers` is applied in production as of 2026-10-07. Verify with:

```bash
curl -sI https://clairity-d3x.pages.dev | grep -iE "content-security|strict-transport|x-frame"
```

CSP is `default-src 'self'; script-src 'self'`, which is why the one inline
script was extracted to `highlight.js`. HSTS is two years with `includeSubDomains`
and `preload`. `frame-ancestors 'none'` plus `X-Frame-Options: DENY`.

Pages is a **direct-upload** project with no Git provider, so deploys do not
happen on push. The site goes out only when someone runs:

```bash
npx wrangler pages deploy site --project-name=clairity
```

That is how the headers sat written-but-not-live for weeks. If you change
anything in `site/`, you have to deploy it.

## Secrets

- No key-shaped literals in the repo; scanned for `sk-ant-`, `sk_live`, AWS ids,
  private key blocks and long bearer tokens.
- `.env` is gitignored and has never been committed on any branch.
- Worker secrets are set with `wrangler secret put`, never in `wrangler.toml`.
- `EXPO_PUBLIC_*` values compile into the bundle and are extractable. Only the
  API base and the client token live there. The Anthropic key does not.

## On-device data

| What | Where | Protection |
|---|---|---|
| Health card | SecureStore | iOS Keychain + device lock required to view |
| Everything else | AsyncStorage | app sandbox + device encryption |

The health card unlock requires a real authentication. It previously branched on
`isEnrolledAsync()`, which reports biometrics only, so a phone with a passcode
but no Face ID fell through to a branch that opened the card without asking
anything. It now uses `getEnrolledLevelAsync()`, and a device with no lock at
all is told to set one.

The XOR layer over the card is **not** encryption and does not claim to be — the
key is a constant in the source. SecureStore and the device lock are the real
boundary; the XOR only stops the value being readable at a glance.

Records other than the card are not in the Keychain. That is a deliberate
tradeoff for an app with no accounts and no sync, and it should be stated
honestly in the App Privacy answers rather than implied away.
