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

## Decisions (Syaan, 2026-08-17)

- **Province: add it to the profile.** A province question joins onboarding and
  settings, and the screening table is keyed on it where programs differ. It is
  optional like gender — with it unset, fall back to national CTFPHC guidance
  with the variation stated plainly.
- **MyHealthfinder: dropped as a content source.** Explanations are written for
  this app. MyHealthfinder survives only as an optional outbound link, labelled
  as a US source, for what a test involves. No US age ever reaches the screen.

## Still to settle in build

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

## Sourced data (checked 2026-08-17)

Written into `expo/lib/screening-data.ts` with per-entry citations.

| Screening | Finding |
|---|---|
| Colorectal | Uniform nationally: 50–74, FIT every 2 years (AB and NT every 1–2). No province keying needed. |
| Cervical | Varies most. Start 21 or 25, stop 65–70, interval 2–5 years. YT has no organized programme. Per-province table recorded. |
| Breast | Mostly 50–74 every 2 years; AB starts at 45; NU is opportunistic only. Per-province table recorded. |

**Known staleness.** The breast and cervical tables are the Partnership's 2023–24
data, and several provinces are actively lowering start ages — Ontario began
expanding to 40–49 in late 2024, Saskatchewan added 40–42 in July 2026. Both are
noted on the affected entries. Each entry carries its source URL and check date
so drift is visible rather than silent, and the screen links out to the source.

**Not yet covered.** Blood pressure, type 2 diabetes and lung cancer screening
are risk-based rather than age-based in the CTFPHC statements, so they do not fit
the age-band shape and are deferred rather than guessed at.

## Yearly re-check — next due 2027-08-17

Agreed with Syaan 2026-08-17. The screening table is a snapshot, not a feed, and
provinces move: Ontario expanded breast screening to 40–49 in late 2024,
Saskatchewan added 40–42 in July 2026. A wrong age here is the worst failure this
app can have, and it fails silently — a stale number looks exactly as confident
as a current one.

Once a year, re-read each `source.url` in `expo/lib/screening-data.ts`, correct
anything that moved, and bump that entry's `checked` date. The dates are rendered
on every card, so drift is visible to the user in the meantime.

Sources to re-read:

- Colorectal — https://www.partnershipagainstcancer.ca/topics/colorectal-screening-canada-2023-2024/programs/screening-parameters/
- Cervical — https://www.partnershipagainstcancer.ca/topics/cervical-screening-canada-2023-2024/programs/guidelines/
- Breast — https://www.partnershipagainstcancer.ca/topics/breast-screening-canada-2023-2024/programs/guidelines/
- CTFPHC published guidelines — https://canadiantaskforce.ca/guidelines/published-guidelines/

Worth checking at the same time whether the CTFPHC breast guideline is still in
draft; it was when this was written, and a final version may change the national
fallback used when no province is set.
