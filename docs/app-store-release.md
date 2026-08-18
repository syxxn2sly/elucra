# Shipping CLAIRITY to the App Store

Written 2026-08-17, against build 26. TestFlight is already working, so the
mechanics of building and submitting are proven. What follows is what changes
when the audience stops being people you know.

The order matters in places, and where it does, it is called out.

---

## 1. Blockers — do not release without these

### 1.1 The Anthropic key ships inside the app

This is the one that costs money rather than a rejection. Every build so far
embeds `EXPO_PUBLIC_ANTHROPIC_API_KEY`; the EAS build log says so out loud:

```
Environment variables with visibility "Plain text" and "Sensitive" loaded from
the "production" environment on EAS: EXPO_PUBLIC_ANTHROPIC_API_KEY
```

`EXPO_PUBLIC_*` values are compiled into the JavaScript bundle. Anyone who
downloads the app can extract that key and spend against your account until you
notice. Acceptable for a handful of known testers; not acceptable in public.

The proxy that fixes this is already written and never deployed:
`server/src/worker.ts` — it holds the key server-side, requires a client token,
rate-limits per IP (60/hour), allows only `/v1/messages`, and caps the body.
`lib/ai-service.ts` already supports both modes and picks the proxy whenever
`EXPO_PUBLIC_API_BASE` is set.

**Sequence matters — rotating the key too early breaks every existing tester.**

1. Create the KV namespace and deploy the worker (`server/README.md` has the
   commands). Set `ANTHROPIC_API_KEY` and `CLIENT_TOKEN` with
   `wrangler secret put`, never in `wrangler.toml`.
2. Verify the worker directly with `curl` — token accepted, missing token
   rejected, rate limit trips.
3. Add `EXPO_PUBLIC_API_BASE` and `EXPO_PUBLIC_CLIENT_TOKEN` to the EAS
   **production** environment.
4. Remove `EXPO_PUBLIC_ANTHROPIC_API_KEY` from the EAS production environment.
5. Build, install from TestFlight, and confirm "Simplify a document" still works
   — that proves traffic is going through the proxy.
6. **Only then** revoke the old key in the Anthropic console.

### 1.2 Someone has to pay for every user's document scan

Not a technical blocker; the one most likely to hurt. Every document a stranger
scans bills your Anthropic account. The worker's per-IP ceiling contains abuse,
not popularity — a thousand honest users are a thousand honest bills.

Decide before launch, not after the first invoice:

- a spend cap in the Anthropic console, and what the app does when it is hit
- whether there is a free limit per user, and how it is enforced
- whether this is free forever, and if so what the ceiling on that generosity is

### 1.3 App Privacy details in App Store Connect

A form, not code, and it must match `docs/privacy.html`. The app handles Health
& Fitness data and sends documents to Anthropic, so declare:

- **Health & Fitness → Health** — collected, not linked to identity, not used
  for tracking
- Everything the policy's table lists as leaving the device

There are no accounts, no analytics and no ad identifiers, which makes this
short and honest. Do not answer "no data collected" — documents leave the device
when the user asks, and Apple treats that as collection.

---

## 2. Likely to cause a rejection

### 2.1 Privacy manifest

Apple requires `PrivacyInfo.xcprivacy` for apps using "required reason" APIs.
This is a managed Expo project (no `ios/` directory) on SDK 54, and `app.json`
has no `ios.privacyManifests` key. Expo generates a manifest covering its own
modules during prebuild, but **I have not verified what ends up in the built
IPA**, and I am not going to claim it is handled without looking.

Before submitting: download the IPA from the EAS build page, unzip it, and
confirm `PrivacyInfo.xcprivacy` exists and covers file timestamp, user defaults
and disk space APIs. Add `ios.privacyManifests` to `app.json` if it does not.

### 2.2 Medical app review — Guideline 1.4.1 and 5.1.1

Health apps get read properly by a human. Two things help, and both already
exist:

- **The app never diagnoses.** The disclaimers in `document-detail.tsx:694`,
  `settings.tsx:355`, `visit-summary.tsx:200` and `preventive-care.tsx:105` all
  say so, and the screening feature was deliberately built to report what a
  programme offers rather than whether you are due. That posture is the single
  best defence in review.
- **`testing/sample-lab-report.pdf`** gives the reviewer something to scan
  without inventing their own medical document.

Write review notes that state plainly: the app explains documents the user
already holds, an AI service reads them, it does not diagnose or advise
treatment, and Canadian screening ages come from a cited local dataset.

### 2.3 Age rating

The questionnaire has a "Medical/Treatment Information" question. Answer it
honestly — the app is full of it. Expect the rating to land above 4+; do not try
to talk it down.

### 2.4 Export compliance

`ITSAppUsesNonExemptEncryption: false` is already set and is the right answer
for an app that only uses HTTPS and the system keychain.

---

## 3. Known defects worth fixing first

- **Android date picker in dark mode.** `themeVariant` is iOS-only, so on an
  Android phone in dark mode the picker draws dark text on a light sheet. Real,
  known, and unfixed — it needs a themed wrapper, not a prop. Blocks a
  comfortable Play Store release; harmless if iOS ships first.
- **No crash reporting.** Nothing tells you when the app fails on someone
  else's phone. Fine for testers you can text; blind once strangers have it.

---

## 4. Store listing

Both pages are already written and hosted: `docs/index.html` (marketing) and
`docs/privacy.html` (privacy). Still needed in App Store Connect:

- Screenshots for every required device size
- Description, keywords, promotional text
- **Support URL with a real contact route** — a page with no way to reach you
  fails review
- Category (Medical, or Health & Fitness)

Account deletion requirements do not apply: there are no accounts.

---

## 5. Suggested order

1. Deploy the proxy and rotate the key (§1.1) — everything else is moot if the
   key is loose
2. Decide the spend model (§1.2)
3. Verify the privacy manifest in the IPA (§2.1)
4. Fill in App Privacy details (§1.3), age rating, review notes
5. Fix the Android picker if Android is launching too (§3)
6. Add crash reporting (§3)
7. Screenshots and listing copy (§4)
8. Submit

Steps 1 and 2 are the ones that cost real money if skipped. The rest cost time.
