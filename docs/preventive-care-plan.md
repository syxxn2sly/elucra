# Chunk 5 — Preventive care

Re-derived 2026-08-17. The originally approved plan was never written to disk;
this replaces it. The roadmap's one-line summary survived and still holds as the
*intent*: "Canadian screening rules decide timing, MyHealthfinder supplies the
explanation." Verification below shows the second half needs changing.

## What the feature is

From the age and gender already in the profile, show which routine screenings
generally apply to someone in that group in Canada, in plain English, with a
short note on what each test is and roughly how often it is offered.

## What it is not

It does not say the user is *due* or *overdue*. CLAIRITY does not know when they
were last screened, what their family history means, or what their clinician has
already decided. The framing is "this is what is generally offered at your age;
ask your doctor what applies to you." Anything stronger is the app forming
clinical judgement, which is the line the roadmap's Risk section draws.

## Verified before planning

- **MyHealthfinder v4 is live.** `GET odphp.health.gov/myhealthfinder/api/v4/
  myhealthfinder.json?age=45&sex=female` → HTTP 200, 24 topics, no API key.
- **Its body text carries US ages inline.** The colorectal topic opens "If you're
  between ages 45 and 75 years, get screened". The Canadian guideline is 50–74.
  Showing that text to a Canadian 46-year-old tells them to book a test their
  guideline does not call for yet.

That second point is the finding that changes the design. MyHealthfinder cannot
"supply the explanation" verbatim, because its explanations *are* the US timing.

## Proposed design

1. **A curated Canadian screening table in `lib/screening-data.ts`**, the same
   shape and spirit as the existing `VACCINE_CATALOG` — a local, reviewed dataset
   rather than a live feed. Each entry: what the screening is, the age band, the
   usual interval, who it applies to, and a citation.
2. **Explanations written for this app**, two or three sentences each, matching
   the voice already used in `vitals-data.ts` — context, never verdict.
3. **MyHealthfinder relegated to an optional outbound link**, clearly labelled as
   a US source, or dropped entirely. It stays useful for "what happens during the
   test", which is not jurisdiction-specific.

## Open questions for Syaan

- **Province.** Canadian screening varies by province — cervical start age and
  breast screening start age differ. The profile has no province field; the only
  province-ish data is `HealthCardData.issuer`, which is optional and behind
  biometrics. Either add a province question, or present national guidance with a
  "your province may differ" note.
- **Gender vs anatomy.** `gender` is optional and identity-based (Male / Female /
  Other / Prefer not to say), while screening is anatomy-based. The app must not
  guess. Proposal: always show the screenings that apply regardless (blood
  pressure, diabetes, colorectal), and for the anatomy-specific ones say plainly
  that they depend on anatomy and history rather than inferring.

## Sourcing requirement

Every age and interval in the table must carry a citation to CTFPHC or the
relevant provincial program, checked at the time of writing. These numbers are
the entire feature; a wrong one is worse than not shipping it. I do not have
these memorised to the precision required and will verify each against source
before writing the table.

## Verification

- A 45-year-old sees colorectal framed by the Canadian age band, not 45.
- Nothing anywhere reads "due" or "overdue".
- With gender unset or "Prefer not to say", no anatomy-specific screening is
  asserted and nothing is misgendered.
- Every entry's citation resolves to a real page saying what the entry claims.
