// a summary to show your doctor at the start of an appointment
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Check, ClipboardCheck, Copy, RefreshCw, Share as ShareIcon, Stethoscope } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share as RNShare,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type Palette } from "@/constants/colors";
import { useTheme } from "@/lib/theme";
import { Font, HIT_TARGET, Radius, Space, Type } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import { generateVisitSummary } from "@/lib/ai-service";
import type { VisitSummary } from "@/lib/ai-service";
import { formatDateDisplay, formatMonthYear } from "@/lib/utils";
import { VITAL_DEFINITIONS, formatVital } from "@/lib/vitals-data";
import { Card, PrimaryButton, ScreenHeader } from "@/components/ui";


/** Enough context to be useful, few enough to stay under a page. */
const RECENT_DOCUMENT_LIMIT = 5;

export default function VisitSummaryScreen() {
  const { C, styles } = useTheme(makeStyles);
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { profile, medications, documents, appointments, vaccines, vitals, loaded } = useClairity();

  const [summary, setSummary] = useState<VisitSummary>({ summary: "", questions: [] });
  const [checkedQuestions, setCheckedQuestions] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const now = Date.now();
      const result = await generateVisitSummary({
        profile,
        medications: medications.map((med) => ({
          name: med.name,
          dose: med.dose,
          frequency: med.frequency,
        })),
        // Newest first — a summary is about what has changed lately, and the
        // stored order is oldest-first.
        recentDocuments: [...documents]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, RECENT_DOCUMENT_LIMIT)
          .map((doc) => ({
            title: doc.result.title,
            date: formatDateDisplay(doc.createdAt),
            summary: doc.result.summary,
          })),
        upcomingAppointments: appointments
          .filter((appointment) => new Date(appointment.dateTime).getTime() >= now)
          .map((appointment) => ({
            title: appointment.title,
            dateTime: formatDateDisplay(appointment.dateTime),
            location: appointment.location,
          })),
        vaccines: vaccines
          .filter((vaccine) => vaccine.hasDate)
          .map((vaccine) => ({
            name: vaccine.name,
            received: formatMonthYear(vaccine.monthReceived, vaccine.yearReceived),
          })),
        // Latest per measure rather than every reading: a clinician wants the
        // current value and how long you have been tracking, not a data dump.
        vitals: VITAL_DEFINITIONS.map((definition) => {
          const forKind = vitals.filter((reading) => reading.kind === definition.kind);
          const latest = forKind[0];
          return latest
            ? {
                label: definition.label,
                latest: formatVital(latest),
                takenAt: formatDateDisplay(latest.takenAt),
                count: forKind.length,
              }
            : null;
        }).filter((entry): entry is NonNullable<typeof entry> => entry !== null),
      });
      setSummary(result);
      setCheckedQuestions(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the summary. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [profile, medications, documents, appointments, vaccines, vitals]);

  /*
    Generate on open, but only once the store has hydrated.

    The store reads from AsyncStorage asynchronously, so on first render the
    profile, medications and documents are all still at their defaults. Firing
    immediately produced a confident summary reporting that nothing had been
    recorded — for a profile full of data. Worse than a spinner: it looked like
    an answer.
  */
  const generated = useRef(false);
  useEffect(() => {
    if (!loaded || generated.current) return;
    generated.current = true;
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const fullText = useCallback(() => {
    if (summary.questions.length === 0) return summary.summary;
    const questionList = summary.questions.map((question) => `- ${question}`).join("\n");
    return `${summary.summary}\n\nQUESTIONS TO ASK\n${questionList}`;
  }, [summary]);

  const copy = useCallback(async () => {
    await Clipboard.setStringAsync(fullText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fullText]);

  const share = useCallback(async () => {
    try {
      await RNShare.share({ message: fullText() });
    } catch {
      // Cancelling the share sheet lands here; nothing to report.
    }
  }, [fullText]);

  const toggleQuestion = useCallback((index: number) => {
    setCheckedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const hasAnything =
    medications.length > 0 || documents.length > 0 || appointments.length > 0 || vitals.length > 0 || Boolean(profile.name);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="For your appointment" fallbackRoute="/(tabs)" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: scrollPadding }}
      >
        <View style={styles.titleWrap}>
          <View style={styles.titleIcon}>
            <Stethoscope color={C.primary} size={24} strokeWidth={2.5} />
          </View>
          <Text style={styles.title}>Show this to your doctor</Text>
        </View>
        <Text style={styles.subtitle}>
          Built from what ELUCRA already knows: your profile, medications, recent reports and
          upcoming appointments.
        </Text>

        {!hasAnything ? (
          <Card style={styles.card}>
            <Text style={styles.emptyText}>
              There is nothing to summarise yet. Add your medications or scan a report first, and
              this will have something to work from.
            </Text>
          </Card>
        ) : loading || !loaded ? (
          <Card style={styles.card}>
            <View style={styles.loadingRow}>
              <ActivityIndicator color={C.primary} />
              <Text style={styles.loadingText}>Putting your summary together…</Text>
            </View>
          </Card>
        ) : error ? (
          <Card style={styles.card}>
            <Text style={styles.errorText}>{error}</Text>
            <PrimaryButton label="Try again" onPress={generate} style={{ marginTop: Space.md }} />
          </Card>
        ) : (
          <>
            <Card style={styles.card}>
              <Text style={styles.summaryText} selectable>
                {summary.summary}
              </Text>
            </Card>

            {/*
              A checklist, not another paragraph in the summary text. The point
              of this list is to be worked through in the room, one item ticked
              off at a time, not reread from a wall of prose.
            */}
            {summary.questions.length > 0 ? (
              <Card style={styles.card}>
                <Text style={styles.cardTitle}>Questions to ask</Text>
                {summary.questions.map((question, index) => (
                  <Pressable
                    key={question}
                    onPress={() => toggleQuestion(index)}
                    style={({ pressed }) => [styles.questionRow, pressed && styles.pressed]}
                  >
                    <View style={[styles.checkbox, checkedQuestions.has(index) && styles.checkboxDone]}>
                      {checkedQuestions.has(index) ? (
                        <Check color={C.textInverse} size={16} strokeWidth={2.5} />
                      ) : null}
                    </View>
                    <Text
                      style={[styles.questionText, checkedQuestions.has(index) && styles.questionTextDone]}
                    >
                      {question}
                    </Text>
                  </Pressable>
                ))}
              </Card>
            ) : null}

            <View style={styles.actions}>
              <Pressable onPress={copy} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                {copied ? (
                  <ClipboardCheck color={C.success} size={19} strokeWidth={2.5} />
                ) : (
                  <Copy color={C.primary} size={19} strokeWidth={2.5} />
                )}
                <Text style={styles.actionText}>{copied ? "Copied" : "Copy"}</Text>
              </Pressable>
              <Pressable onPress={share} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                <ShareIcon color={C.primary} size={19} strokeWidth={2.5} />
                <Text style={styles.actionText}>Share</Text>
              </Pressable>
              <Pressable onPress={generate} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                <RefreshCw color={C.primary} size={19} strokeWidth={2.5} />
                <Text style={styles.actionText}>Rebuild</Text>
              </Pressable>
            </View>

            <Text style={styles.disclaimer}>
              Built from what you have recorded, and only that. Anything ELUCRA does not know is
              left out rather than guessed at, so read it through before you hand it over. It is a
              starting point for the conversation, not a medical record and not a diagnosis.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
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
  card: { marginBottom: Space.lg },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: Space.md },
  loadingText: { ...Type.body, color: C.textMuted },
  errorText: { ...Type.body, color: C.danger },
  emptyText: { ...Type.body, color: C.textMuted },
  summaryText: { ...Type.body, color: C.text, lineHeight: 25 },
  cardTitle: { ...Type.label, color: C.text, marginBottom: Space.md },
  questionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: { backgroundColor: C.primary, borderColor: C.primary },
  questionText: { ...Type.body, color: C.text, flex: 1, lineHeight: 22 },
  questionTextDone: { color: C.textMuted, textDecorationLine: "line-through" },
  actions: { flexDirection: "row", gap: Space.sm },
  action: {
    flex: 1,
    minHeight: HIT_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.md,
  },
  actionText: { ...Type.label, color: C.primary },
  pressed: { opacity: 0.85 },
  disclaimer: { ...Type.caption, color: C.textMuted, marginTop: Space.xl, lineHeight: 19 },
});
