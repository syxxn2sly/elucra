# Elucra roadmap

Ordered by value to what the app is for, divided by cost given what already
exists. Each chunk is independently shippable and testable in one build.

## Tier 1 — next

1. **Doctor summary on the home screen.** Half-built already: `generateDoctorSummary`
   in `expo/lib/ai-service.ts` produces one per document. Promoting it to the whole
   profile completes the loop — understand your documents, then walk in prepared.
2. **Preventive care and reminders.** Planned and approved; design in the plan file.
   Canadian screening rules decide timing, MyHealthfinder supplies the explanation.
3. **Vitals.** Self-contained, and it feeds 1, 6 and 12. Build early or rebuild those later.

## Tier 2

4. **Health timeline.** Largely a *view* over documents, vaccines, medications,
   appointments and vitals already stored. High perceived value per line written.
5. **Medication adherence and refills.** Dose reminders exist; taken/missed logging,
   refill dates and history do not. Interaction flagging is deliberately excluded —
   see Risk.
6. **Nearby services.** Photon lookup and near-me ranking already work; mostly a new
   screen over existing infrastructure.

## Tier 3

7. Public health alerts and seasonal topics — needs a trustworthy feed (PHAC for
   Canada; do not mix jurisdictions the way the screening rules must not).
8. Lifestyle tracking — smoking, alcohol, exercise, sleep, water.
9. Emergency profile and lock-screen widget.
10. Personalised risk insights — chickenpox implying shingles risk is the right shape.

## Tier 4 — blocked, risky, or poor return now

11. **Apple Health / Fitbit.** HealthKit needs an entitlement and Apple scrutinises the
    justification for health data. Real work, not a library drop.
12. **Full app translation.** Different from what exists: documents and scripts already
    translate, but every UI string is a refactor touching every screen.
13. **Symptom checker.** See Risk.
14. Meal suggestions.
15. Gamification.
16. **Clinic partnerships.** Not a feature — business development, and it depends on the
    app being credible first: proxy deployed, privacy policy live, security posture real.

## Risk

**Triage is the line.** Everything Elucra does today explains a document the user
already has, with every fact traceable to the page. A symptom checker that says when
to see a doctor has the app forming its own clinical judgement — a regulated activity
in many jurisdictions and the one feature here that can cause direct harm by being
wrong. If built, scope it to pattern logging ("you have recorded this six times this
month") with no urgency advice.

**Drug interaction flagging** is the same problem, smaller. Logging doses is safe;
asserting two drugs conflict is clinical decision support.

## Prerequisites

- **The API proxy** (`server/`) gates anything that increases the number of users. Not
  urgent for solo testing, blocking for everyone else.
- **Vitals and lifestyle multiply the sensitive data held on the device.** Today the most
  sensitive item is the health card, in the Keychain. Daily blood pressure and glucose
  make this a genuine medical record — decide about backup, export and locking before
  building it, not after.

## Chunks

| # | Chunk | Test |
|---|---|---|
| 1 | Doctor summary button on home | Tap with real data, check nothing invented, share works |
| 2 | Vitals: logging | Log each type, confirm it survives a restart |
| 3 | Vitals: trends | Log a series, confirm graph and ranges read correctly |
| 4 | Preventive care | Shipped. Screening ages need a yearly re-check — see the plan file |
| 5 | Prevention timeline, 10 years | Ages and intervals land on the right years |
| 6 | Health timeline | Every record type appears in the right order |
| 7 | Medication adherence and refills | Mark taken/missed, confirm history and reminders |
| 8 | Nearby services | Search near a known location, check results are real |
| 9 | Public health alerts | Feed parses, nothing shown when the feed is down |
| 10 | Emergency profile and widget | Reachable without unlocking |
| 11 | Lifestyle tracking | Log a week, confirm trends |
| 12 | Risk insights | Needs 2, 4 and 6 to be worth anything |
