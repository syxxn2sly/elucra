// CLAIRITY — Document detail (structured AI analysis output cards)
import { router, useLocalSearchParams } from "expo-router";
import {
  Check,
  AlertTriangle,
  Calendar,
  Languages,
  Pill,
  Trash2,
  Share,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Clock,
  Stethoscope,
  MapPin,
  Eye,
} from "lucide-react-native";
import React, { useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Share as RNShare,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import Colors from "@/constants/colors";
import { Font, HIT_TARGET, Radius, Space, Type } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import { languageLabel } from "@/lib/translate";
import { DOCUMENT_TYPES } from "@/lib/types";
import { formatDateDisplay, confirmDestructive } from "@/lib/utils";
import { Card, Tag, EmptyState, ScreenHeader } from "@/components/ui";
import { generateDoctorSummary } from "@/lib/ai-service";
import type { CommunicationScript } from "@/lib/types";

const C = Colors.light;

export default function DocumentDetailScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { documents, toggleChecklistItem, removeDocument, profile, addAppointment, appointments } = useClairity();
  const [expandedScript, setExpandedScript] = useState<string | null>("en");
  const [showImage, setShowImage] = useState(false);
  const [doctorSummary, setDoctorSummary] = useState<string | null>(null);
  const [doctorLoading, setDoctorLoading] = useState(false);
  const [doctorError, setDoctorError] = useState("");

  const savedDoc = documents.find((d) => d.id === id);

  /**
   * Translations are not re-verified — the numeric and red-flag checks ran on
   * the English. Swapping the whole result object here means every section
   * below renders the English without each one needing to know about it, and
   * gives anyone helping the patient a way to check a dose against the text the
   * checks actually passed.
   */
  const [showEnglish, setShowEnglish] = useState(false);
  const translated = Boolean(savedDoc?.originalResult);
  // Memoised because swapping in the English allocates a new object, and `doc`
  // is a dependency of three callbacks below — without this they would be
  // rebuilt on every render.
  const doc = useMemo(
    () =>
      savedDoc && showEnglish && savedDoc.originalResult
        ? { ...savedDoc, result: savedDoc.originalResult }
        : savedDoc,
    [savedDoc, showEnglish],
  );

  const handleDelete = useCallback(() => {
    confirmDestructive(
      "Delete this report?",
      "This will permanently remove the simplified interpretation from your library.",
      "Delete",
      () => {
        removeDocument(id);
        router.back();
      },
    );
  }, [id, removeDocument]);

  const handleShare = useCallback(async () => {
    if (!doc) return;
    const summary = doc.result.scripts.find((s) => s.language === "en")?.text ?? doc.result.summary;
    try {
      await RNShare.share({
        message: `${doc.result.title}\n\n${summary}`,
      });
    } catch {
      // User cancelled share
    }
  }, [doc]);

  const handleGenerateDoctorSummary = useCallback(async () => {
    if (!doc) return;
    setDoctorLoading(true);
    setDoctorError("");
    try {
      const summary = await generateDoctorSummary({
        title: doc.result.title,
        facts: doc.result.facts,
        profile,
      });
      setDoctorSummary(summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't generate the summary.";
      setDoctorError(msg);
    } finally {
      setDoctorLoading(false);
    }
  }, [doc, profile]);

  const handleConfirmAppointment = useCallback(async (candidate: { id: string; dateTime: string; purpose: string; location: string; whatToBring: string; sourceBlockIds: string[] }) => {
    if (!doc) return;
    if (appointments.some((appointment) => appointment.documentId === doc.id && appointment.dateTime === candidate.dateTime)) return;
    await addAppointment({
      title: candidate.purpose || "Medical appointment",
      dateTime: candidate.dateTime,
      location: candidate.location,
      whatToBring: candidate.whatToBring,
      notes: "Confirmed from a scanned document.",
      documentId: doc.id,
      sourceBlockIds: [candidate.id, ...candidate.sourceBlockIds],
    });
    Alert.alert("Added to your calendar", "Your appointment and its reminder have been saved.");
  }, [doc, appointments, addAppointment]);

  const handleCopyDoctorSummary = useCallback(async () => {
    if (!doctorSummary) return;
    try {
      await RNShare.share({
        message: `Clinical Handoff Note\n\n${doctorSummary}`,
      });
    } catch {
      // User cancelled
    }
  }, [doctorSummary]);

  if (!doc) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <EmptyState
          title="Report not found"
          message="This report may have been deleted."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const docType = DOCUMENT_TYPES[doc.result.documentType] ?? DOCUMENT_TYPES.general;
  const docColorKey = `doc${doc.result.documentType
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("")}` as keyof typeof Colors.light;
  const docColor = C[docColorKey] ?? C.docGeneral;

  const requiredItems = doc.result.checklist.filter((i) => i.required);
  const optionalItems = doc.result.checklist.filter((i) => !i.required);
  const emergencyWarnings = doc.result.warnings.filter((w) => w.isEmergency);
  const normalWarnings = doc.result.warnings.filter((w) => !w.isEmergency);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Report"
        actions={
          <>
            <Pressable
              onPress={handleShare}
              hitSlop={12}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel="Share report"
            >
              <Share color={C.text} size={22} />
            </Pressable>
            <Pressable
              onPress={handleDelete}
              hitSlop={12}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel="Delete report"
            >
              <Trash2 color={C.danger} size={22} />
            </Pressable>
          </>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: scrollPadding }}
      >
        {/* Only shown on a translated report. The safety checks ran on the
            English, so it stays one tap away for anyone cross-checking a dose. */}
        {translated ? (
          <View style={styles.languageToggleRow}>
            <Text style={styles.languageToggleLabel}>
              {showEnglish
                ? "Showing the original English"
                : `Translated into ${languageLabel(savedDoc?.language ?? "")}`}
            </Text>
            <Pressable
              onPress={() => setShowEnglish((prev) => !prev)}
              style={styles.languageToggleBtn}
              accessibilityRole="button"
            >
              <Languages color={C.primary} size={16} strokeWidth={2.5} />
              <Text style={styles.languageToggleBtnText}>
                {showEnglish
                  ? `Show ${languageLabel(savedDoc?.language ?? "")}`
                  : "Show English"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Title + type badge */}
        <View style={styles.titleWrap}>
          <View style={[styles.titleIcon, { backgroundColor: docColor + "18" }]}>
            <Sparkles color={docColor} size={22} strokeWidth={2.5} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.docTitle}>{doc.result.title}</Text>
            <View style={styles.titleMeta}>
              <Tag text={docType.label} color={docColor} bg={docColor + "18"} />
              <Text style={styles.docDate}>{formatDateDisplay(doc.createdAt)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.verificationRow}>
          <View style={styles.verificationPill}>
            <Check color={C.success} size={15} strokeWidth={2.8} />
            <Text style={styles.verificationText}>Source-checked</Text>
          </View>
          <Text style={styles.languageText}>Source language: {doc.result.classification?.detectedLanguage ?? "Not recorded"}</Text>
        </View>

        {/* Original document image */}
        {doc.imageUri ? (
          <Pressable onPress={() => setShowImage(!showImage)} style={styles.imageToggle}>
            <Text style={styles.imageToggleText}>
              {showImage ? "Hide original document" : "Show original document"}
            </Text>
            {showImage ? (
              <ChevronUp color={C.textMuted} size={18} strokeWidth={2.5} />
            ) : (
              <ChevronDown color={C.textMuted} size={18} strokeWidth={2.5} />
            )}
          </Pressable>
        ) : null}
        {showImage && doc.imageUri ? (
          <Image
            source={{ uri: doc.imageUri }}
            style={styles.originalImage}
            contentFit="contain"
          />
        ) : null}

        {doc.result.sourceBlocks?.length ? (
          <Card style={styles.sourceCard}>
            <View style={styles.cardHeaderRow}>
              <MapPin color={C.primary} size={20} strokeWidth={2.5} />
              <Text style={styles.cardTitle}>What CLAIRITY Read</Text>
            </View>
            <Text style={styles.sourceHint}>
              Each item in this report is linked to text below. Use “Show original document” above to compare it with the source image.
            </Text>
            {doc.result.sourceBlocks.slice(0, 8).map((block) => (
              <View key={block.id} style={styles.sourceBlock}>
                <Text style={styles.sourceBlockLabel}>Page {block.page} · {Math.round(block.confidence * 100)}% read confidence</Text>
                <Text style={styles.sourceBlockText}>{block.text}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Summary card */}
        <Card style={[styles.card, { marginTop: 16 }]}>
          <Text style={styles.cardTitle}>What this means</Text>
          <Text style={styles.summaryText}>{doc.result.summary}</Text>
        </Card>

        {/* Interpretation card */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Plain-English Explanation</Text>
          <Text style={styles.interpretationText}>{doc.result.interpretation}</Text>
        </Card>

        {/* Action checklist */}
        {doc.result.checklist.length > 0 ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Your Action Checklist</Text>
            {requiredItems.length > 0 ? (
              <Text style={styles.subsectionLabel}>Required — you must do these</Text>
            ) : null}
            {requiredItems.map((item) => (
              <ChecklistRow
                key={item.id}
                text={item.text}
                done={item.done}
                required
                onToggle={() => toggleChecklistItem(doc.id, item.id)}
              />
            ))}
            {optionalItems.length > 0 ? (
              <Text style={[styles.subsectionLabel, { marginTop: 16 }]}>
                Optional — helpful but not urgent
              </Text>
            ) : null}
            {optionalItems.map((item) => (
              <ChecklistRow
                key={item.id}
                text={item.text}
                done={item.done}
                required={false}
                onToggle={() => toggleChecklistItem(doc.id, item.id)}
              />
            ))}
          </Card>
        ) : null}

        {(doc.result.facts.appointments ?? []).length > 0 ? (
          <Card style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Calendar color={C.primary} size={20} strokeWidth={2.5} />
              <Text style={styles.cardTitle}>Appointment Found</Text>
            </View>
            <Text style={styles.appointmentHint}>We found this scheduled appointment in the document. Please check the details before adding it to your calendar.</Text>
            {(doc.result.facts.appointments ?? []).map((appointment) => {
              const alreadyAdded = appointments.some((saved) => saved.documentId === doc.id && saved.dateTime === appointment.dateTime);
              return <View key={appointment.id} style={styles.appointmentCandidate}>
                <Text style={styles.appointmentCandidateTitle}>{appointment.purpose || "Medical appointment"}</Text>
                <Text style={styles.appointmentCandidateText}>{new Date(appointment.dateTime).toLocaleString()}</Text>
                {appointment.location ? <Text style={styles.appointmentCandidateText}>Where: {appointment.location}</Text> : null}
                {appointment.whatToBring ? <Text style={styles.appointmentCandidateText}>Bring: {appointment.whatToBring}</Text> : null}
                <Pressable disabled={alreadyAdded} onPress={() => handleConfirmAppointment(appointment)} style={[styles.confirmAppointmentButton, alreadyAdded && styles.confirmAppointmentButtonDone]}>
                  <Calendar color={C.textInverse} size={18} strokeWidth={2.5} />
                  <Text style={styles.confirmAppointmentText}>{alreadyAdded ? "Added to Calendar" : "Confirm & Add to Calendar"}</Text>
                </Pressable>
              </View>;
            })}
          </Card>
        ) : null}

        {/* Timeline */}
        {doc.result.timeline.length > 0 ? (
          <Card style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Clock color={C.primary} size={20} strokeWidth={2.5} />
              <Text style={styles.cardTitle}>Recovery Timeline</Text>
            </View>
            <View style={styles.timeline}>
              {doc.result.timeline.map((item, idx) => (
                <View key={item.id} style={styles.timelineItem}>
                  <View style={styles.timelineLeft}>
                    <View style={[styles.timelineDot, { backgroundColor: C.primary }]} />
                    {idx < doc.result.timeline.length - 1 ? (
                      <View style={styles.timelineLine} />
                    ) : null}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineWhen}>{item.when}</Text>
                    <Text style={styles.timelineLabel}>{item.label}</Text>
                    <Text style={styles.timelineDetail}>{item.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* Warning signs */}
        {doc.result.warnings.length > 0 ? (
          <Card style={[styles.card, styles.warningCard]}>
            <View style={styles.cardHeaderRow}>
              <AlertTriangle color={C.danger} size={20} strokeWidth={2.5} />
              <Text style={styles.cardTitle}>{"Warning Signs & When to Get Help"}</Text>
            </View>
            {emergencyWarnings.length > 0 ? (
              <View style={styles.emergencyBlock}>
                <Text style={styles.emergencyHeader}>🚨 Go to Emergency if:</Text>
                {emergencyWarnings.map((w) => (
                  <View key={w.id} style={styles.warningItem}>
                    <Text style={styles.warningSymptomEmergency}>{w.symptom}</Text>
                    <Text style={styles.warningAction}>{w.action}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {normalWarnings.length > 0 ? (
              <View style={styles.normalWarningBlock}>
                <Text style={styles.normalWarningHeader}>Call your doctor if you notice:</Text>
                {normalWarnings.map((w) => (
                  <View key={w.id} style={styles.warningItem}>
                    <Text style={styles.warningSymptom}>{w.symptom}</Text>
                    <Text style={styles.warningAction}>{w.action}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Extracted medications */}
        {doc.result.extractedMedications.length > 0 ? (
          <Card style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Pill color={C.docPrescription} size={20} strokeWidth={2.5} />
              <Text style={styles.cardTitle}>Medications Mentioned</Text>
            </View>
            {doc.result.extractedMedications.map((med, idx) => (
              <View key={idx} style={styles.medItem}>
                <Text style={styles.medName}>{med.name}</Text>
                {med.dose ? <Text style={styles.medDetail}>Dose: {med.dose}</Text> : null}
                {med.frequency ? <Text style={styles.medDetail}>Frequency: {med.frequency}</Text> : null}
                {med.purpose ? <Text style={styles.medPurpose}>{med.purpose}</Text> : null}
              </View>
            ))}
          </Card>
        ) : null}

        {/* Communication scripts */}
        {doc.result.scripts.length > 0 ? (
          <Card style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Languages color={C.accent} size={20} strokeWidth={2.5} />
              <Text style={styles.cardTitle}>Communication Scripts</Text>
            </View>
            <Text style={styles.scriptHint}>
              Read these aloud to a family member, pharmacist, or doctor.
            </Text>
            {doc.result.scripts.map((script) => (
              <ScriptBlock
                key={script.language}
                script={script}
                expanded={expandedScript === script.language}
                onToggle={() =>
                  setExpandedScript(
                    expandedScript === script.language ? null : script.language,
                  )
                }
              />
            ))}
          </Card>
        ) : null}

        {/* Doctor-to-Doctor Communication */}
        <Card style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Stethoscope color={C.docOperative} size={20} strokeWidth={2.5} />
            <Text style={styles.cardTitle}>Doctor-to-Doctor Summary</Text>
          </View>
          <Text style={styles.doctorHint}>
            Generate a professional clinical handoff note to share with your doctor or specialist. Written in medical language for healthcare providers.
          </Text>

          {doctorSummary ? (
            <View style={styles.doctorSummaryBox}>
              <Text style={styles.doctorSummaryText}>{doctorSummary}</Text>
              <Pressable
                onPress={handleCopyDoctorSummary}
                style={({ pressed }) => [styles.doctorShareBtn, pressed && styles.pressed]}
              >
                <Share color={C.textInverse} size={18} strokeWidth={2.5} />
                <Text style={styles.doctorShareBtnText}>Share with Doctor</Text>
              </Pressable>
            </View>
          ) : doctorLoading ? (
            <View style={styles.doctorLoadingBox}>
              <ActivityIndicator color={C.primary} size="small" />
              <Text style={styles.doctorLoadingText}>Generating clinical summary…</Text>
            </View>
          ) : doctorError ? (
            <View>
              <Text style={styles.doctorErrorText}>{doctorError}</Text>
              <Pressable
                onPress={handleGenerateDoctorSummary}
                style={({ pressed }) => [styles.doctorRetryBtn, pressed && styles.pressed]}
              >
                <Text style={styles.doctorRetryText}>Try Again</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={handleGenerateDoctorSummary}
              style={({ pressed }) => [styles.doctorGenerateBtn, pressed && styles.pressed]}
            >
              <Stethoscope color={C.textInverse} size={20} strokeWidth={2.5} />
              <Text style={styles.doctorGenerateText}>Generate Clinical Summary</Text>
            </Pressable>
          )}
        </Card>

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          CLAIRITY provides general information to help you understand your document. It is not a
          substitute for professional medical advice. Always consult your healthcare provider.
        </Text>
      </ScrollView>
    </View>
  );
}

function ChecklistRow({
  text,
  done,
  required,
  onToggle,
}: {
  text: string;
  done: boolean;
  required: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [styles.checklistRow, pressed && styles.pressed]}
    >
      <View style={[styles.checkbox, done && styles.checkboxDone]}>
        {done ? <Check color={C.textInverse} size={18} strokeWidth={2.5} /> : null}
      </View>
      <Text style={[styles.checklistText, done && styles.checklistTextDone]}>{text}</Text>
      {required && !done ? <Tag text="MUST" color={C.danger} bg={C.dangerSoft} /> : null}
    </Pressable>
  );
}

function ScriptBlock({
  script,
  expanded,
  onToggle,
}: {
  script: CommunicationScript;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.scriptBlock}>
      <Pressable onPress={onToggle} style={styles.scriptHeader}>
        <Text style={styles.scriptLang}>{script.languageLabel}</Text>
        {expanded ? <ChevronUp color={C.textMuted} size={18} strokeWidth={2.5} /> : <ChevronDown color={C.textMuted} size={18} strokeWidth={2.5} />}
      </Pressable>
      {expanded ? <Text style={styles.scriptText}>{script.text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  pressed: {
    opacity: 0.85,
  },
  headerBtn: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  languageToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space.sm,
    flexWrap: "wrap",
    paddingVertical: Space.md,
  },
  languageToggleLabel: {
    ...Type.caption,
    color: C.textMuted,
    flexShrink: 1,
  },
  languageToggleBtn: {
    minHeight: HIT_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    paddingHorizontal: Space.md,
    borderRadius: Radius.pill,
    backgroundColor: C.primarySoft,
  },
  languageToggleBtnText: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.primary,
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Space.md,
    marginTop: Space.sm,
  },
  titleIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  docTitle: {
    ...Type.display,
    color: C.text,
  },
  titleMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    marginTop: Space.sm,
  },
  docDate: {
    ...Type.caption,
    color: C.textMuted,
  },
  verificationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space.md,
    marginTop: Space.lg,
  },
  verificationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    backgroundColor: C.successSoft,
    borderRadius: Radius.pill,
  },
  verificationText: {
    ...Type.caption,
    fontFamily: Font.headBold,
    color: C.success,
  },
  languageText: {
    flex: 1,
    ...Type.caption,
    color: C.textMuted,
    textAlign: "right",
  },
  imageToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.xs,
    marginTop: Space.lg,
    paddingVertical: Space.md,
    backgroundColor: C.surfaceAlt,
    borderRadius: Radius.md,
  },
  imageToggleText: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.textMuted,
  },
  originalImage: {
    width: "100%",
    height: 240,
    borderRadius: Radius.md,
    marginTop: Space.md,
    backgroundColor: C.surfaceAlt,
  },
  card: {
    marginTop: Space.lg,
  },
  sourceCard: {
    marginTop: Space.lg,
  },
  sourceHint: {
    ...Type.caption,
    color: C.textMuted,
    marginBottom: Space.md,
  },
  sourceBlock: {
    backgroundColor: C.surfaceAlt,
    borderRadius: Radius.md,
    padding: Space.md,
    marginTop: Space.sm,
  },
  sourceBlockLabel: {
    ...Type.caption,
    fontFamily: Font.headBold,
    color: C.primary,
    textTransform: "uppercase",
    letterSpacing: 0.25,
  },
  sourceBlockText: {
    ...Type.caption,
    color: C.text,
    marginTop: Space.xs,
  },
  cardTitle: {
    ...Type.heading,
    color: C.text,
    marginBottom: Space.md,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    marginBottom: Space.md,
  },
  summaryText: {
    ...Type.body,
    color: C.text,
  },
  interpretationText: {
    ...Type.body,
    color: C.text,
  },
  // Checklist
  subsectionLabel: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: Space.md,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.md,
    minHeight: HIT_TARGET,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    borderWidth: 2.5,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  checklistText: {
    flex: 1,
    ...Type.body,
    color: C.text,
  },
  checklistTextDone: {
    textDecorationLine: "line-through",
    color: C.textMuted,
  },
  appointmentHint: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: -Space.xs,
    marginBottom: Space.md,
  },
  appointmentCandidate: {
    backgroundColor: C.surfaceAlt,
    borderRadius: Radius.md,
    padding: Space.md,
    gap: Space.xs,
    marginTop: Space.sm,
  },
  appointmentCandidateTitle: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.text,
  },
  appointmentCandidateText: {
    ...Type.caption,
    color: C.text,
  },
  confirmAppointmentButton: {
    marginTop: Space.sm,
    minHeight: HIT_TARGET,
    borderRadius: Radius.md,
    backgroundColor: C.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
  },
  confirmAppointmentButtonDone: { backgroundColor: C.success },
  confirmAppointmentText: {
    ...Type.label,
    color: C.textInverse,
  },
  // Timeline
  timeline: {
    paddingLeft: Space.xs,
  },
  timelineItem: {
    flexDirection: "row",
    gap: Space.md,
  },
  timelineLeft: {
    alignItems: "center",
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: Radius.pill,
    marginTop: Space.xs,
  },
  timelineLine: {
    width: 2.5,
    flex: 1,
    backgroundColor: C.border,
    marginTop: Space.xs,
    minHeight: 32,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: Space.lg,
  },
  timelineWhen: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.primary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  timelineLabel: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.text,
    marginTop: Space.xs,
  },
  timelineDetail: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: Space.xs,
  },
  // Warnings
  warningCard: {
    borderWidth: 0,
    borderColor: "transparent",
  },
  emergencyBlock: {
    backgroundColor: C.dangerSoft,
    borderRadius: Radius.md,
    padding: Space.lg,
    marginBottom: Space.md,
  },
  emergencyHeader: {
    ...Type.body,
    fontFamily: Font.headBold,
    color: C.danger,
    marginBottom: Space.md,
  },
  warningItem: {
    marginBottom: Space.md,
  },
  warningSymptomEmergency: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.danger,
  },
  warningSymptom: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.text,
  },
  warningAction: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: Space.xs,
  },
  normalWarningBlock: {
    paddingLeft: 2,
  },
  normalWarningHeader: {
    ...Type.label,
    color: C.text,
    marginBottom: Space.md,
  },
  // Meds
  medItem: {
    paddingVertical: Space.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  medName: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.text,
  },
  medDetail: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: Space.xs,
  },
  medPurpose: {
    ...Type.caption,
    color: C.text,
    marginTop: Space.xs,
    fontStyle: "italic",
  },
  // Scripts
  scriptHint: {
    ...Type.caption,
    color: C.textMuted,
    marginBottom: Space.md,
  },
  scriptBlock: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingVertical: Space.xs,
  },
  scriptHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Space.md,
  },
  scriptLang: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.primary,
  },
  scriptText: {
    ...Type.body,
    color: C.text,
    paddingBottom: Space.md,
  },
  disclaimer: {
    ...Type.caption,
    color: C.textMuted,
    textAlign: "center",
    marginTop: Space.xl,
    paddingHorizontal: Space.md,
  },
  // Doctor-to-Doctor
  doctorHint: {
    ...Type.caption,
    color: C.textMuted,
    marginBottom: Space.lg,
  },
  doctorGenerateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.md,
    backgroundColor: C.docOperative,
    borderRadius: Radius.md,
    paddingVertical: Space.lg,
  },
  doctorGenerateText: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.textInverse,
  },
  doctorLoadingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    backgroundColor: C.surfaceAlt,
    borderRadius: Radius.md,
    padding: Space.lg,
  },
  doctorLoadingText: {
    ...Type.body,
    color: C.textMuted,
  },
  doctorSummaryBox: {
    backgroundColor: C.surfaceAlt,
    borderRadius: Radius.md,
    padding: Space.lg,
  },
  doctorSummaryText: {
    ...Type.body,
    color: C.text,
  },
  doctorShareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    backgroundColor: C.primary,
    borderRadius: Radius.md,
    paddingVertical: Space.md,
    marginTop: Space.md,
  },
  doctorShareBtnText: {
    ...Type.label,
    color: C.textInverse,
  },
  doctorErrorText: {
    ...Type.body,
    color: C.danger,
    marginBottom: Space.md,
  },
  doctorRetryBtn: {
    backgroundColor: C.primarySoft,
    borderRadius: Radius.md,
    paddingVertical: Space.md,
    alignItems: "center",
  },
  doctorRetryText: {
    ...Type.label,
    color: C.primary,
  },
});
