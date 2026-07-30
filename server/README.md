# CLAIRITY API proxy

Holds the Anthropic key server-side so it stops shipping inside the app binary.

## Why this exists

`EXPO_PUBLIC_*` values are compiled into the JavaScript bundle. Anyone who
installs the app — from TestFlight, or especially from a shared APK — can extract
the Anthropic key and spend against it. There is no per-user metering and no
spend cap protecting you.

This proxy holds the key instead. The app sends a client token, which *also*
ships in the binary, so this is not a cure — but it changes what a leak costs:

| | Key in the app | Behind this proxy |
|---|---|---|
| What leaks | a billable Anthropic key | a token that only works here |
| Rotating it | App Store release | one command, takes effect immediately |
| Spend ceiling | none | 60 requests/hour per IP |
| Visibility | Anthropic usage only | per-request logs, per-IP counts |

## Deploy

Requires a Cloudflare account. The free Workers tier is ample for this.

```bash
cd server
npm install --save-dev wrangler

# 1. Rate-limit storage. Paste the printed id into wrangler.toml.
npx wrangler kv namespace create RATE_LIMIT

# 2. Secrets. Never put these in wrangler.toml — it is committed.
npx wrangler secret put ANTHROPIC_API_KEY     # the real Anthropic key
npx wrangler secret put CLIENT_TOKEN          # any long random string

# 3. Ship it
npx wrangler deploy
```

Generate a client token with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Point the app at it

In `expo/.env`:

```
EXPO_PUBLIC_API_BASE=https://clairity-api.<your-subdomain>.workers.dev
EXPO_PUBLIC_CLIENT_TOKEN=<the same token you set as the secret>
```

Then **remove `EXPO_PUBLIC_ANTHROPIC_API_KEY`** from `expo/.env` and from the EAS
production environment, and **rotate that key in the Anthropic console** — every
build already shipped contains it, so it must be treated as public.

With `EXPO_PUBLIC_API_BASE` unset the app calls Anthropic directly, exactly as
before. That is deliberate: local development keeps working and deploying is a
config flip, not a hard cutover.

## Not covered

- **Translation.** `expo/lib/translate.ts` reaches Azure directly when
  `EXPO_PUBLIC_AZURE_TRANSLATOR_KEY` is set. That key has the same problem and
  should route through here too. It is currently unset, so translation runs
  through Anthropic — and therefore through this proxy — but setting it would
  reintroduce an exposed key.
- **Attestation.** The client token is shared, not per-install. App Attest (iOS)
  and Play Integrity (Android) would let the proxy verify a genuine install, and
  are the real answer if this ever gets meaningful traffic.
- **Cost alerts.** Worth setting a billing alert in the Anthropic console
  regardless; the rate limit bounds abuse per IP, not in total.
