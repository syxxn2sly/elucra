# App Store listing — copy and answers

Written 2026-08-23, against build 31. Everything here is drafted to be pasted
into App Store Connect. `APPNAME` is a placeholder; replace it once the name is
settled.

Every factual claim below was checked against the code. Where the app does less
than you might assume, the copy says the smaller true thing — App Review reads
these against the binary, and a health app that overstates gets a closer look,
not a looser one.

---

## 1. Name, subtitle, keywords

**App Name** (30 characters max, must be unique across the App Store)

```
APPNAME
```

**Subtitle** (30 characters max — this is indexed for search, so spend it on
words people actually type)

```
Understand your lab results
```

Alternatives, same length budget:
- `Medical records in plain words`
- `Your health records, explained`

**Keywords** (100 characters, comma-separated, no spaces after commas, do not
repeat words already in the name or subtitle)

```
medical,report,bloodwork,prescription,translate,plain,english,doctor,records,health,scan,explain
```

**Promotional text** (170 characters, editable without a new build — use it for
whatever is newest)

```
Scan a lab report, prescription or discharge summary and read it in plain English. Every sentence links back to the line on the page it came from.
```

---

## 2. Description

Paste as-is. First three lines matter most: that is all anyone sees before
tapping "more".

```
Medical documents are written for clinicians, not for the people they are about.
APPNAME reads yours and explains it in plain English.

Photograph or upload a lab report, prescription, discharge summary, referral,
imaging result or vaccination record. APPNAME reads the page and tells you what
it says, in everyday words, at about a grade five reading level.

EVERY SENTENCE IS TRACEABLE

Software reading a page can misread it, and an explanation that sounds confident
is not the same as one that is correct. So APPNAME works in three passes: it
transcribes the page into facts, writes the explanation from those facts alone,
then checks the explanation back against them on your device. Anything it cannot
trace to the page is removed before you see it. Every fact links to the place it
came from, so you can check it yourself.

SIXTEEN LANGUAGES

Read your explanation in English, French, Spanish, Chinese, Arabic, Punjabi,
Tagalog, Italian, Hindi, Gujarati, Swahili, Urdu, Vietnamese, Portuguese,
Russian or Korean. Doses, dates and measurements carry across exactly as
written. For instructions and warnings the English stays alongside, because a
dropped "do not" reads perfectly fluently in any language.

THE REST OF THE PAPERWORK

- A summary for your doctor: medications, recent results and your questions,
  ready to show at an appointment
- Things to say: scripts for the calls that are hard to make, each labelled by
  what it is for
- Medications, with names checked against a drug reference
- Vaccines, including part-finished multi-dose courses
- Readings you take at home, with the reference ranges beside them
- Screening that fits your age, province and conditions
- Your health card, behind Face ID

YOUR RECORD STAYS ON YOUR PHONE

No account, no sign-in, no analytics. What you save is written to this device.
When you ask for a document to be explained, that page is sent to an AI service
to be read, and nothing else goes with it. Deleting the app deletes everything.

WHAT APPNAME IS NOT

It does not diagnose. It will not tell you whether a result is good or bad news,
and it will not suggest starting, stopping or changing a medication. It is not a
substitute for your doctor, nurse or pharmacist, and it is not for emergencies.
Always check anything that matters against the original document, especially
doses and numbers.
```

---

## 3. App Privacy questionnaire

The form is in App Store Connect under **App Privacy**. It must match
`site/privacy.html`, because a reviewer can open your privacy URL and compare.

**Do not answer "Data Not Collected."** Documents leave the device when the user
asks, and Apple counts transmission off-device as collection.

### Health & Fitness → Health

| Question | Answer |
|---|---|
| Collected? | **Yes** |
| Linked to the user's identity? | **No** |
| Used for tracking? | **No** |
| Purpose | **App Functionality** |

What this covers, precisely:

- **When a document is scanned**: the image or PDF only. No profile data is sent
  with it. (`extractFacts` takes an `AnalysisInput` whose `profile` field is
  never read.)
- **When a doctor summary is generated**: age, gender, conditions, allergies and
  medications, as `patientContext`. (`generateDoctorSummary`.)
- **The user's name is never transmitted.** Neither is province, sexual
  activity, smoking or alcohol status, occupation, family history or surgeries —
  those stay on the device and are used only for local screening logic.

### Location → Coarse Location

| Question | Answer |
|---|---|
| Collected? | **Yes** |
| Linked to the user's identity? | **No** |
| Used for tracking? | **No** |
| Purpose | **App Functionality** |

Only sent when the user taps the near-me control on a place field, and only to
rank clinic search results. Not stored, not attached to any record.

Apple does allow an optional-disclosure exemption for data like this — user
initiated, not stored, not used for profiling. Declaring it anyway is the safer
answer and costs nothing, since it is not linked to identity.

### Everything else — answer "No"

Contact info, contacts, user content beyond the above, search history, browsing
history, identifiers, purchases, usage data, diagnostics, financial info,
sensitive info. There are no accounts, no analytics SDK, no crash reporting and
no advertising identifiers in the build.

---

## 4. Age rating

Answer the questionnaire honestly. The one that matters:

- **Medical/Treatment Information — Yes, infrequent/mild** at minimum. The app is
  full of it.

Expect the rating to land above 4+. Do not try to argue it down; an inaccurate
answer here is a straightforward rejection.

---

## 5. Review notes

Paste into **Notes for Review**. A reviewer who has to guess what a health app
does will assume the worst.

```
APPNAME explains medical documents that the user already holds. It does not
diagnose, does not recommend treatment, and does not change any medication.

HOW TO TEST
A sample lab report is included at testing/sample-lab-report.pdf and is also
attached to this submission. Open the app, complete the short profile, tap
"Simplify a Document", and upload that PDF. The result screen shows a plain
English explanation in which every item links back to the region of the page it
was read from.

No account or sign-in is required. There is no paid content of any kind.

HOW IT WORKS
The document is read by Anthropic's Claude API through our own proxy, which
holds the API credentials server-side. The explanation is generated only from
facts extracted in a first pass, and is then verified on-device against those
facts; anything unsupported is discarded before display. Disclaimers stating
that the app does not diagnose appear on the document detail, vitals, visit
summary and preventive care screens.

CANADIAN SCREENING DATA
The preventive care feature reports what publicly funded screening programmes
offer for a given age and province, with each entry citing its source (Canadian
Partnership Against Cancer, Diabetes Canada, Hypertension Canada, BC Guidelines).
It reports what a programme offers; it does not tell the user they are due.
```

---

## 6. Still needed from you

- **Screenshots** for every required device size — 6.9" and 6.5" iPhone are
  mandatory; iPad only if you declare iPad support
- **Support URL**: https://clairity-d3x.pages.dev (update if the name changes)
- **Privacy Policy URL**: https://clairity-d3x.pages.dev/privacy
- **Category**: Medical, or Health & Fitness. Medical fits what the app does;
  Health & Fitness is a less scrutinised shelf. Either is defensible.
- **Copyright**: your name and the year
