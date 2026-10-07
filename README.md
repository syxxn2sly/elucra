# Elucra

An iOS app that reads a medical document you already hold — a lab report, a
prescription, a discharge summary, a referral — and explains it in plain English,
with every sentence tied back to the line on the page it came from.

Built with Expo and React Native. Ships to TestFlight from a local archive.

---

## The problem this is actually solving

Handing a page of clinical language to a model and asking for a friendly summary
produces something fluent, confident, and occasionally wrong in ways a patient
cannot detect. A number that never appeared on the page reads exactly like a
number that did. For a document someone may act on, that failure mode is the
whole problem, not an edge case.

So the interesting part of this codebase is not the prompt. It is the structure
around the prompt that makes an invented figure fail to reach the screen.

## How a document is read

Three stages, in `expo/lib/ai-service.ts`. Each one only receives what the
previous stage produced.

**1. Extract.** A vision pass transcribes the page into structured facts. Every
fact carries `sourceBlockIds` naming the regions of the page it came from.
Nothing is interpreted here. Content that genuinely cannot be deciphered is
marked unknown rather than guessed — deliberately tolerant of creased, dim and
handwritten pages, because real documents are all three.

**2. Communicate.** A second pass receives *only those facts* — never the image.
It rewrites them at roughly a grade 5–6 reading level. Because it cannot see the
original and has no other input, there is no outside medical knowledge available
for it to helpfully add.

**3. Verify.** On-device, in TypeScript. The explanation is checked back against
the extracted facts: numbers are compared by value rather than by spelling, so
`11.20` and `11.2` match but an invented figure does not. Any item that cannot
be traced to a source block is pruned before render. This stage is not a model
call, which is the point — it cannot be talked out of its answer.

The UI then renders that provenance rather than hiding it: each explanation
links to the lines it came from.

### Translation, and why it happens last

Sixteen languages, translated *after* verification, never before. Machine
translating the source first would hand every downstream safety check a
mistranslated document to validate.

Two failure modes drive the design (`expo/lib/translate.ts`):

- **A dropped negation** — "do not take with food" becoming "take with food" —
  reads perfectly fluently and is dangerous. This cannot be prevented with a
  translation engine, so the UI keeps the English alongside the translation for
  instructions and warnings instead of pretending otherwise.
- **A mangled dose.** This one *is* preventable: numbers, strengths and units
  are required to pass through byte-identical.

## Keys and the proxy

`EXPO_PUBLIC_*` values are compiled into the JS bundle and can be extracted from
any installed build, so the Anthropic key does not live in the app. `server/`
is a Cloudflare Worker that holds it instead, requires a client token,
rate-limits per IP, allows only `/v1/messages`, and caps the request body.

The client token ships in the binary too, and that is understood rather than
overlooked. What the proxy buys is containment: a token that can be rotated from
a dashboard instead of through an App Store release, a ceiling on spend, and
somewhere to see abuse happening. `expo/lib/ai-service.ts` supports both paths
and takes the proxy whenever `EXPO_PUBLIC_API_BASE` is set.

## What else the app holds

Explaining one document helps once; most of what makes an appointment stressful
is not having the rest to hand. So it also keeps medications (normalised against
a drug reference), vaccines including part-finished multi-dose courses,
appointments, home readings with their reference ranges, preventive screening
filtered by age, province and conditions, and a health card behind Face ID.

## Layout

```
expo/          the app
  app/         Expo Router screens
  components/  shared primitives
  constants/   colors.ts and theme.ts — every spacing, radius and type value
  lib/         ai-service.ts, translate.ts, store.ts, types.ts
  scripts/     ship.mjs (EAS), ship-local.mjs (local archive)
server/        the Cloudflare Worker holding the Anthropic key
site/          the marketing and support site, including privacy.html
docs/          release runbook, roadmap, store listing
testing/       a sample lab report for reviewers and manual testing
```

## Running it

```bash
cd expo && npm install && npm start
```

Copy `expo/.env.example` to `expo/.env` and fill it in. With
`EXPO_PUBLIC_API_BASE` set the app goes through the proxy; without it, it calls
Anthropic directly with a bundled key, which is for local development only and
must never be in a build that leaves your machine.

## Shipping a build

```bash
cd expo && npm run ship:local
```

Bumps the build number, commits it, writes it into the native `Info.plist`,
archives, exports a signed `.ipa`, and then reads the build number back out of
that `.ipa` to confirm it matches. That last check exists because Expo syncs the
native build number on its own schedule — in practice one build behind — and the
failure is otherwise invisible until App Store Connect rejects the upload.

The archive path must stay outside `ios/build`, which Expo's codegen owns and
clears mid-build.

## What it is not

It does not diagnose. It will not tell you whether a result is good or bad news,
and it will not suggest starting, stopping or changing a medication. Software
reading a page can misread it, which is why every fact is source-linked and the
app asks you to check anything that matters against the original.

Not a medical device.
