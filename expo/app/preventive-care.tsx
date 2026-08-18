// CLAIRITY — which routine screenings generally apply at your age, in your province
import { router } from "expo-router";
import { ExternalLink, MapPin, ShieldCheck } from "lucide-react-native";
import React, { useMemo } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Font, Radius, Space, Type } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import { PROVINCES, SCREENINGS, ruleFor } from "@/lib/screening-data";
import type { ProvinceCode, Screening, ScreeningRule } from "@/lib/screening-data";
import { Card, ScreenHeader } from "@/components/ui";

const C = Colors.light;

/** The profile stores the province by name; the table is keyed by code. */
function provinceCode(name: string): ProvinceCode | null {
  return PROVINCES.find((entry) => entry.name === name)?.code ?? null;
}

/**
 * Where this age sits relative to the programme's band.
 *
 * Deliberately not "due" or "overdue" — CLAIRITY does not know when you were
 * last screened. It knows only whether a programme generally covers your age.
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

export default function PreventiveCareScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { profile, loaded } = useClairity();

  const code = provinceCode(profile.province);
  const age = useMemo(() => {
    const parsed = Number.parseInt(profile.age, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }, [profile.age]);

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
          Screening programmes in Canada are organised by age, and the ages differ by province.
          This is what your programme generally offers — not a record of what you have had, and
          not a statement that you are due for anything.
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
                  Without a province, the ages below are the national ones. Provinces differ —
                  cervical screening starts at 21 in some and 25 in others — so setting yours makes
                  this accurate for where you live.
                </Text>
              </Card>
            ) : null}

            {SCREENINGS.map((screening) => (
              <ScreeningCard key={screening.id} screening={screening} code={code} age={age} />
            ))}

            <Text style={styles.disclaimer}>
              These are the ages a programme generally uses, read from the sources linked on each
              card. They change — several provinces have been lowering their start ages — and they
              assume average risk. Your own history, and anything that runs in your family, can
              change what your doctor recommends and when. This does not replace that conversation.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ScreeningCard({
  screening,
  code,
  age,
}: {
  screening: Screening;
  code: ProvinceCode | null;
  age: number | null;
}) {
  const rule = ruleFor(screening, code);
  const standing = standingFor(age, rule);

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>{screening.label}</Text>
      <Text style={styles.cardBand}>{bandText(rule)}</Text>

      {/*
        Anatomy, not identity. The profile knows a gender; screening depends on
        which organs someone has. Saying so plainly is both more accurate and
        the only way to avoid telling a trans person the wrong thing.
      */}
      {screening.appliesTo !== "everyone" ? (
        <Text style={styles.cardApplies}>
          {screening.appliesTo === "cervix"
            ? "Applies to people who have a cervix."
            : "Applies to people who have breast tissue — which includes most men, though routine screening is not offered to them."}
        </Text>
      ) : null}

      <Text style={styles.cardWhat}>{screening.what}</Text>

      {rule.note ? <Text style={styles.cardNote}>{rule.note}</Text> : null}

      {standing ? (
        <Text style={styles.cardStanding}>
          {standing === "within"
            ? "Your age is inside this range. Ask your doctor whether it applies to you and when you were last screened."
            : standing === "before"
              ? `The routine programme starts at ${rule.startAge}. If it runs in your family, ask about starting earlier.`
              : `The routine programme runs to ${rule.stopAge}. Past that it becomes a conversation about your own health rather than an automatic invitation.`}
        </Text>
      ) : null}

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
  card: { marginBottom: Space.lg },
  cardTitle: { ...Type.label, color: C.text, marginBottom: Space.xs },
  cardBand: { ...Type.caption, fontFamily: Font.bodySemi, color: C.primary, marginBottom: Space.sm },
  cardApplies: { ...Type.caption, color: C.textMuted, marginBottom: Space.sm, fontStyle: "italic" },
  cardWhat: { ...Type.body, color: C.text, lineHeight: 23 },
  cardNote: { ...Type.caption, color: C.textMuted, marginTop: Space.sm, lineHeight: 19 },
  cardStanding: { ...Type.caption, color: C.text, marginTop: Space.md, lineHeight: 19 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: Space.xs, marginTop: Space.md },
  sourceText: { ...Type.caption, color: C.textMuted, flex: 1, fontSize: 11 },
  pressed: { opacity: 0.85 },
  disclaimer: { ...Type.caption, color: C.textMuted, marginTop: Space.sm, lineHeight: 19 },
});
