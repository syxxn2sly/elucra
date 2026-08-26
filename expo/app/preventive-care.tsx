// CLAIRITY — routine screening: what's offered, what you've had, when the next one lands
import { router } from "expo-router";
import { ExternalLink, MapPin, ShieldCheck, Trash2 } from "lucide-react-native";
import React, { useMemo } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Font, Radius, Space, Type } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import {
  PROVINCES,
  SCREENINGS,
  ruleFor,
  isConditionLinked,
  screeningAppliesToConditions,
} from "@/lib/screening-data";
import type { ProvinceCode, Screening, ScreeningRule } from "@/lib/screening-data";
import { computeNextDue, formatDueCountdown, formatMonthYear } from "@/lib/utils";
import type { ScreeningRecord } from "@/lib/types";
import { Card, ScreenHeader } from "@/components/ui";
import { MonthYearWheel } from "@/components/smart-inputs";

const C = Colors.light;

/** The profile stores the province by name; the table is keyed by code. */
function provinceCode(name: string): ProvinceCode | null {
  return PROVINCES.find((entry) => entry.name === name)?.code ?? null;
}

/**
 * Where this age sits relative to the programme's band.
 *
 * Deliberately not "due" or "overdue" — this is population screening and
 * CLAIRITY does not know whether the person has had it. "Due" only appears
 * below once a record exists, computed from the date the person entered, the
 * same posture the vaccine tracker already uses.
 */
type Standing = "within" | "before" | "after";

function standingFor(age: number | null, rule: ScreeningRule): Standing | null {
  if (age === null) return null;
  if (age < rule.startAge) return "before";
  if (rule.stopAge !== null && age > rule.stopAge) return "after";
  return "within";
}

function bandText(rule: ScreeningRule): string {
  const upper = rule.stopAge === null ? "onwards" : `to ${rule.stopAge}`;
  return `Ages ${rule.startAge} ${upper} · ${rule.interval}`;
}

/** A profile condition matches a screening's trigger list. Loose text match, same as the data layer. */
function matchesCondition(screening: Screening, conditions: string): boolean {
  return screeningAppliesToConditions(screening, conditions);
}

/**
 * Cervical screening is the one place several provinces base timing on sexual
 * activity as well as age — BC and Ontario key their start age to it, and
 * Manitoba, New Brunswick and the Northwest Territories start counting from
 * first sexual contact rather than a birthday. Anatomy question, not identity;
 * it is asked the same way regardless of gender.
 */
function cervicalActivityNote(sexuallyActive: string, age: number | null, rule: ScreeningRule): string | null {
  if (age === null || !sexuallyActive || sexuallyActive === "Prefer not to say") return null;
  if (sexuallyActive === "No") {
    return "Several provinces base when this starts on sexual activity as well as age. Since you've said you aren't currently, you may not need to start yet. Worth confirming with your provider rather than assuming either way.";
  }
  if (age < rule.startAge) {
    return `A few provinces (B.C. among them) start cervical screening at first sexual activity rather than waiting for age ${rule.startAge}. Worth asking your provider whether that applies to you now.`;
  }
  return null;
}

export default function PreventiveCareScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { profile, screenings, recordScreening, removeScreening, loaded } = useClairity();

  const code = provinceCode(profile.province);
  const age = useMemo(() => {
    const parsed = Number.parseInt(profile.age, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }, [profile.age]);

  /*
    Two groups rather than one list, because they answer different questions.
    Population screening ("what does my age group get offered") and follow-up
    tied to a condition ("what does having diabetes mean I should keep up
    with") are different asks and read badly interleaved.

    Population screening is filtered to the age bracket itself — a 30-year-old
    does not need a card telling them breast screening starts at 50, and a
    76-year-old does not need to be told colorectal stopped at 74. With age
    unset there is nothing to filter on, so everything shows rather than
    nothing.
  */
  const { population, hiddenCount, tailored } = useMemo(() => {
    const pop: Screening[] = [];
    const tail: Screening[] = [];
    let hidden = 0;
    const code = provinceCode(profile.province);
    for (const screening of SCREENINGS) {
      if (isConditionLinked(screening)) {
        if (matchesCondition(screening, profile.conditions)) tail.push(screening);
        continue;
      }
      const parsedAge = Number.parseInt(profile.age, 10);
      const ageKnown = Number.isFinite(parsedAge) ? parsedAge : null;
      const standing = standingFor(ageKnown, ruleFor(screening, code));
      /*
        Cervical screening has a second entry criterion in several provinces —
        sexual activity, not just age — so "below the band" is not automatically
        "hide it" the way it is for the cancer screenings that are age-only.
        Being under the age but sexually active is exactly the case the
        early-start note exists to reach.
      */
      const earlyByActivity =
        screening.id === "cervical" && standing === "before" && profile.sexuallyActive === "Yes";
      if (standing === null || standing === "within" || earlyByActivity) pop.push(screening);
      else hidden += 1;
    }
    return { population: pop, hiddenCount: hidden, tailored: tail };
    // `sexuallyActive` is read above for the cervical early-start case, so it
    // belongs here too. Without it, answering that question in the profile left
    // this list showing whatever it had computed under the previous answer until
    // an unrelated field happened to change.
  }, [profile.conditions, profile.age, profile.province, profile.sexuallyActive]);

  const recordFor = (screeningId: string) => screenings.find((entry) => entry.screeningId === screeningId) ?? null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Routine screening" fallbackRoute="/(tabs)" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: scrollPadding }}
      >
        <View style={styles.titleWrap}>
          <View style={styles.titleIcon}>
            <ShieldCheck color={C.primary} size={24} strokeWidth={2.5} />
          </View>
          <Text style={styles.title}>What's generally offered</Text>
        </View>

        <Text style={styles.subtitle}>
          What Canadian screening programmes generally offer at your age, and the routine
          follow-up that comes with any condition you have recorded. Record when you last had
          one and ELUCRA will work out roughly when the next is due.
        </Text>

        {!loaded ? null : (
          <>
            <View style={styles.contextRow}>
              <MapPin color={C.primary} size={16} strokeWidth={2.5} />
              <Text style={styles.contextText}>
                {profile.province ? profile.province : "Province not set"}
                {age !== null ? ` · age ${age}` : ""}
              </Text>
              <Pressable onPress={() => router.push("/(tabs)/settings")} hitSlop={8}>
                <Text style={styles.contextChange}>Change</Text>
              </Pressable>
            </View>

            {!profile.province ? (
              <Card style={styles.noticeCard}>
                <Text style={styles.noticeText}>
                  Without a province, the ages below are the national ones. Provinces differ:
                  cervical screening starts at 21 in some and 25 in others. Setting yours makes
                  this accurate for where you live.
                </Text>
              </Card>
            ) : null}

            <Text style={styles.sectionLabel}>Routine screening for your age</Text>
            {population.length === 0 ? (
              <Card style={styles.noticeCard}>
                <Text style={styles.noticeText}>
                  {age === null
                    ? "Set your age in settings to see which screenings apply to you."
                    : "Nothing routine applies at your current age. Colorectal, cervical and breast screening all have age windows. Check back as you age into one, or ask your doctor if anything should start earlier."}
                </Text>
              </Card>
            ) : (
              population.map((screening) => (
                <ScreeningCard
                  key={screening.id}
                  screening={screening}
                  rule={ruleFor(screening, code)}
                  age={age}
                  record={recordFor(screening.id)}
                  onRecord={(month, year) => recordScreening(screening.id, month, year)}
                  onClear={() => removeScreening(screening.id)}
                  activityNote={
                    screening.id === "cervical" ? cervicalActivityNote(profile.sexuallyActive, age, ruleFor(screening, code)) : undefined
                  }
                />
              ))
            )}
            {hiddenCount > 0 ? (
              <Text style={styles.hiddenNote}>
                {hiddenCount} more {hiddenCount === 1 ? "screening applies" : "screenings apply"} outside your
                current age range. Ask your doctor if any should start earlier or continue longer than usual.
              </Text>
            ) : null}

            {tailored.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Because of what's in your profile</Text>
                {tailored.map((screening) => (
                  <ScreeningCard
                    key={screening.id}
                    screening={screening}
                    rule={screening.national}
                    age={null}
                    record={recordFor(screening.id)}
                    onRecord={(month, year) => recordScreening(screening.id, month, year)}
                    onClear={() => removeScreening(screening.id)}
                    conditionMatch={screening.conditions?.find((needle) =>
                      profile.conditions.toLowerCase().includes(needle),
                    )}
                  />
                ))}
              </>
            ) : null}

            <Text style={styles.disclaimer}>
              These are the ages and intervals a programme generally uses, read from the sources
              linked on each card, and they assume average risk. Your own history, and anything
              that runs in your family, can change what your doctor recommends and when. What you
              record here stays on your device. ELUCRA does not know what you have had unless
              you tell it, and never assumes a screening happened.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ScreeningCard({
  screening,
  rule,
  age,
  record,
  onRecord,
  onClear,
  conditionMatch,
  activityNote,
}: {
  screening: Screening;
  rule: ScreeningRule;
  age: number | null;
  record: ScreeningRecord | null;
  onRecord: (month: number, year: number) => void;
  onClear: () => void;
  /** The condition text that triggered this card, shown as the "why". */
  conditionMatch?: string;
  /** Sexual-activity refinement, cervical screening only. */
  activityNote?: string | null;
}) {
  const standing = standingFor(age, rule);
  const nextDue = record ? computeNextDue(record.monthDone, record.yearDone, rule.intervalMonths) : null;

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>{screening.label}</Text>
      <Text style={styles.cardBand}>
        {age !== null ? bandText(rule) : `${rule.interval}`}
      </Text>

      {conditionMatch ? (
        <Text style={styles.cardBecause}>Because you have {conditionMatch} in your profile</Text>
      ) : null}

      {/*
        Anatomy, not identity. The profile knows a gender; screening depends on
        which organs someone has. Saying so plainly is both more accurate and
        the only way to avoid telling a trans person the wrong thing.
      */}
      {screening.appliesTo !== "everyone" ? (
        <Text style={styles.cardApplies}>
          {screening.appliesTo === "cervix"
            ? "Applies to people who have a cervix."
            : "Applies to people who have breast tissue, which includes most men, though routine screening is not offered to them."}
        </Text>
      ) : null}

      <Text style={styles.cardWhat}>{screening.what}</Text>

      {rule.note ? <Text style={styles.cardNote}>{rule.note}</Text> : null}
      {activityNote ? <Text style={styles.cardNote}>{activityNote}</Text> : null}

      {/* Suppressed when activityNote already explains the "before" case — the two would repeat each other. */}
      {standing && !(standing === "before" && activityNote) ? (
        <Text style={styles.cardStanding}>
          {standing === "within"
            ? "Your age is inside this range. If you haven't already, record when you last had it below."
            : standing === "before"
              ? `The routine programme starts at ${rule.startAge}. If it runs in your family, ask about starting earlier.`
              : `The routine programme runs to ${rule.stopAge}. Past that it becomes a conversation about your own health rather than an automatic invitation.`}
        </Text>
      ) : null}

      {/*
        Recording is the user's own claim about their own history, which is a
        different thing from ELUCRA asserting a population fact — so "due" and
        "overdue" are fair game here the way they already are for vaccines.
      */}
      <View style={styles.recordRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.recordLabel}>Last had</Text>
          <Text style={styles.recordValue}>
            {record ? formatMonthYear(record.monthDone, record.yearDone) : "Not recorded"}
          </Text>
          {nextDue ? <Text style={styles.recordDue}>{formatDueCountdown(nextDue)}</Text> : null}
        </View>
        <View style={styles.recordActions}>
          <MonthYearWheel
            month={record?.monthDone ?? null}
            year={record?.yearDone ?? null}
            label={`When did you last have ${screening.label.toLowerCase()}?`}
            triggerLabel={record ? "Edit" : "Record"}
            onConfirm={onRecord}
          />
          {record ? (
            <Pressable onPress={onClear} hitSlop={10} accessibilityLabel={`Clear ${screening.label} record`}>
              <Trash2 color={C.textMuted} size={16} strokeWidth={2.5} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <Pressable
        onPress={() => Linking.openURL(screening.source.url)}
        style={({ pressed }) => [styles.sourceRow, pressed && styles.pressed]}
        accessibilityRole="link"
        accessibilityLabel={`Open the source for ${screening.label}`}
      >
        <ExternalLink color={C.textMuted} size={13} strokeWidth={2.5} />
        <Text style={styles.sourceText}>
          {screening.source.label} · checked {screening.source.checked}
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: Space.md, marginBottom: Space.sm },
  titleIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...Type.title, color: C.text, flex: 1 },
  subtitle: { ...Type.body, color: C.textMuted, marginBottom: Space.lg },
  contextRow: { flexDirection: "row", alignItems: "center", gap: Space.sm, marginBottom: Space.md },
  contextText: { ...Type.caption, color: C.text, flex: 1 },
  contextChange: { ...Type.caption, fontFamily: Font.bodySemi, color: C.primary },
  noticeCard: { marginBottom: Space.lg, backgroundColor: C.primarySoft },
  noticeText: { ...Type.caption, color: C.text, lineHeight: 19 },
  sectionLabel: { ...Type.label, color: C.text, marginBottom: Space.sm, marginTop: Space.sm },
  card: { marginBottom: Space.lg },
  cardTitle: { ...Type.label, color: C.text, marginBottom: Space.xs },
  cardBand: { ...Type.caption, fontFamily: Font.bodySemi, color: C.primary, marginBottom: Space.sm },
  cardBecause: {
    ...Type.caption,
    color: C.accent,
    fontFamily: Font.bodySemi,
    marginBottom: Space.sm,
  },
  cardApplies: { ...Type.caption, color: C.textMuted, marginBottom: Space.sm, fontStyle: "italic" },
  cardWhat: { ...Type.body, color: C.text, lineHeight: 23 },
  cardNote: { ...Type.caption, color: C.textMuted, marginTop: Space.sm, lineHeight: 19 },
  cardStanding: { ...Type.caption, color: C.text, marginTop: Space.md, lineHeight: 19 },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Space.md,
    paddingTop: Space.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  recordLabel: { ...Type.caption, color: C.textMuted },
  recordValue: { ...Type.body, fontFamily: Font.bodySemi, color: C.text },
  recordDue: { ...Type.caption, color: C.primary, marginTop: 2 },
  recordActions: { flexDirection: "row", alignItems: "center", gap: Space.md },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: Space.xs, marginTop: Space.md },
  sourceText: { ...Type.caption, color: C.textMuted, flex: 1 },
  pressed: { opacity: 0.85 },
  disclaimer: { ...Type.caption, color: C.textMuted, marginTop: Space.sm, lineHeight: 19 },
  hiddenNote: { ...Type.caption, color: C.textMuted, marginBottom: Space.lg, lineHeight: 19 },
});
