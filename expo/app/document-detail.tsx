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
  Info,
} from "lucide-react-native";
import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Share as RNShare,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { ZoomablePhoto } from "@/components/photo-viewer";
import Colors from "@/constants/colors";
import { Font, HIT_TARGET, Radius, Space, Type } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import { languageLabel, translateTexts, TRANSLATION_LANGUAGES, isRightToLeft } from "@/lib/translate";
import { DOCUMENT_TYPES } from "@/lib/types";
import { confirmDestructive, formatDateDisplay, notify } from "@/lib/utils";
import { Card, Tag, EmptyState, ScreenHeader } from "@/components/ui";
import { generateDoctorSummary } from "@/lib/ai-service";
import type { CommunicationScript } from "@/lib/types";

const C = Colors.light;

export default function DocumentDetailScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { documents, toggleChecklistItem, removeDocument, profile, addAppointment, appointments, saveScriptTranslation } = useClairity();
  /** Index of the open script, as a string. "0" opens the first one by default. */
  const [expandedScript, setExpandedScript] = useState<string | null>("0");
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

  /*
    The English is the source every time — translating a translation compounds
    drift, and the safety checks ran on the English.
  */
  const [scriptLang, setScriptLang] = useState("en");
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [flagsOpen, setFlagsOpen] = useState(false);
  const [scriptError, setScriptError] = useState("");
  const translated = Boolean(savedDoc?.originalResult);

  const englishScripts = savedDoc?.result.scripts ?? [];
  /*
    Translations live on the document rather than in this component.

    They used to be useState here, which meant leaving the screen discarded
    them and reopening the document paid to translate the same strings again.
    Translation is the only thing in the app that costs money per use, so it is
    the one thing worth keeping. Read straight from the saved document; the
    fetch below fills it in the first time a language is asked for.
  */
  const saved = savedDoc?.scriptTranslations ?? {};

  /**
   * Fetch a language once, ever, then serve it from the document.
   *
   * Guarded on what is already saved, so re-selecting a language costs nothing
   * on this visit or any later one. English never calls out at all — it is the
   * source text.
   */
  useEffect(() => {
    if (scriptLang === "en" || saved[scriptLang] || englishScripts.length === 0 || !savedDoc) return;
    let cancelled = false;
    setScriptError("");
    (async () => {
      try {
        /*
          The purposes travel with the bodies in one call. They are headers the
          reader has to understand to pick a script, so leaving them in English
          under a French body would defeat the point of translating at all.

          One request rather than two: the translator charges per call, and a
          second round trip would let the headers and bodies arrive apart.
        */
        const bodies = englishScripts.map((script) => script.text);
        const purposes = englishScripts.map((script) => script.purpose ?? "");
        const all = await translateTexts([...bodies, ...purposes], scriptLang);
        if (!cancelled) {
          saveScriptTranslation(savedDoc.id, scriptLang, {
            bodies: all.slice(0, bodies.length),
            purposes: all.slice(bodies.length),
          });
        }
      } catch (error) {
        if (cancelled) return;
        // Fall back to English rather than an empty card, and say why. Nothing
        // is saved on failure, so the next attempt genuinely retries.
        setScriptError(
          error instanceof Error
            ? `${error.message} Showing English.`
            : "Could not translate the script. Showing English.",
        );
        setScriptLang("en");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLang, englishScripts.length, savedDoc?.id]);

  /**
   * The script as it should read right now: cached translation, or the English.
   *
   * The index is passed in rather than looked up. It used to be found with
   * `findIndex(entry => entry.language === script.language)`, but every script
   * arrives as English, so that matched the first one every time and each block
   * rendered script one's translation regardless of which script it was.
   */
  const displayedScript = useCallback(
    (script: CommunicationScript, index: number): CommunicationScript => {
      if (scriptLang === "en") return script;
      const text = saved[scriptLang]?.bodies[index];
      if (!text) return script;
      const purpose = saved[scriptLang]?.purposes[index] || script.purpose;
      return { ...script, text, purpose, language: scriptLang, languageLabel: languageLabel(scriptLang) };
    },
    [scriptLang, saved],
  );
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
    notify("Added to your calendar", "Your appointment and its reminder have been saved.");
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

        {/*
          What the verification actually withheld, sitting immediately under the
          "Source-checked" pill because it qualifies that claim. The pipeline has
          always written these — a figure it could not match, an item it could not
          trace, a page it found hard to read — and nothing displayed them, so a
          shortened result looked like a complete one. Deliberately not styled as
          an error: the document was read, and this is the honest footnote on how
          well.
        */}
        {doc.result.safety?.flags?.length ? (
          <View style={styles.flagsCard}>
            {/*
              Collapsed by default, but the count is always on the header — the
              point is that the reader knows something was withheld, not that they
              read all of it every time.
            */}
            <Pressable
              onPress={() => setFlagsOpen(!flagsOpen)}
              style={styles.flagsHeader}
              accessibilityRole="button"
              accessibilityState={{ expanded: flagsOpen }}
              accessibilityLabel={`Worth knowing, ${doc.result.safety.flags.length} ${doc.result.safety.flags.length === 1 ? "note" : "notes"}`}
            >
              <Info color={C.warning} size={17} strokeWidth={2.5} />
              <Text style={styles.flagsTitle}>
                Worth knowing
                <Text style={styles.flagsCount}>
                  {"  "}
                  {doc.result.safety.flags.length}
                  {doc.result.safety.flags.length === 1 ? " note" : " notes"}
                </Text>
              </Text>
              {flagsOpen ? (
                <ChevronUp color={C.warning} size={18} strokeWidth={2.5} />
              ) : (
                <ChevronDown color={C.warning} size={18} strokeWidth={2.5} />
              )}
            </Pressable>
            {flagsOpen ? doc.result.safety.flags.map((flag) => (
              <View key={flag} style={styles.flagRow}>
                <Text style={styles.flagBullet}>•</Text>
                <Text style={styles.flagText}>{flag}</Text>
              </View>
            )) : null}
            {flagsOpen ? (
              <Text style={styles.flagsFootnote}>
                Anything ELUCRA could not match to your document is left out rather than
                shown. Check the original above if a figure matters.
              </Text>
            ) : null}
          </View>
        ) : null}

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
          <ZoomablePhoto
            uri={doc.imageUri}
            style={styles.originalImage}
            contentFit="contain"
            accessibilityLabel="Open the original document full screen"
            caption={doc.result.title}
          />
        ) : null}

        {doc.result.sourceBlocks?.length ? (
          <Card style={styles.sourceCard}>
            <View style={styles.cardHeaderRow}>
              <MapPin color={C.primary} size={20} strokeWidth={2.5} />
              <Text style={styles.cardTitle}>What ELUCRA Read</Text>
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
              <Text style={styles.subsectionLabel}>Required</Text>
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
                Optional
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

            {/*
              Any of the app's languages, translated when asked for rather than
              all of them up front. Generating sixteen per document would
              multiply the cost and the wait for languages nobody opens.
            */}
            <Pressable
              onPress={() => setLangPickerOpen(true)}
              style={({ pressed }) => [styles.langTrigger, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Script language: ${languageLabel(scriptLang)}. Tap to change.`}
            >
              <Text style={styles.langTriggerLabel}>Language</Text>
              <View style={styles.langTriggerValue}>
                <Text style={styles.langTriggerText}>{languageLabel(scriptLang)}</Text>
                <ChevronDown color={C.primary} size={18} strokeWidth={2.5} />
              </View>
            </Pressable>

            {scriptError ? <Text style={styles.langError}>{scriptError}</Text> : null}

            {doc.result.scripts.map((script, index) => {
              const shown = displayedScript(script, index);
              return (
                <ScriptBlock
                  key={index}
                  script={shown}
                  loading={scriptLang !== "en" && !saved[scriptLang]}
                  rtl={isRightToLeft(scriptLang)}
                  /*
                    Keyed by position, not by language. Every script is English,
                    so identifying them by `script.language` made them one block
                    as far as this state was concerned: opening either opened
                    both, and closing either closed both.
                  */
                  expanded={expandedScript === String(index)}
                  onToggle={() =>
                    setExpandedScript(expandedScript === String(index) ? null : String(index))
                  }
                />
              );
            })}
          </Card>
        ) : null}

        <Modal
          visible={langPickerOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setLangPickerOpen(false)}
        >
          <View style={styles.langSheetOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setLangPickerOpen(false)} />
            <View style={styles.langSheet}>
              <Text style={styles.langSheetTitle}>Read the script in…</Text>
              <ScrollView style={styles.langSheetList}>
                {TRANSLATION_LANGUAGES.map((lang) => {
                  const active = lang.code === scriptLang;
                  return (
                    <Pressable
                      key={lang.code}
                      onPress={() => {
                        setScriptLang(lang.code);
                        setLangPickerOpen(false);
                      }}
                      style={({ pressed }) => [styles.langRow, pressed && styles.langRowPressed]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.langRowText, active && styles.langRowTextActive]}>
                        {lang.label}
                      </Text>
                      {/* Its English name too: someone helping the patient may not
                          read the script the label is written in. */}
                      {lang.label !== lang.english ? (
                        <Text style={styles.langRowEnglish}>{lang.english}</Text>
                      ) : null}
                      {active ? <Check color={C.primary} size={18} strokeWidth={2.5} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>

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
          Explanations here are produced by software reading your document, and software
          can misread. Every fact is linked to the place on the page it came from. Check
          anything that matters against the original, especially doses and numbers. This
          explains your document; it does not diagnose, and it is not a substitute for your
          doctor, nurse or pharmacist.
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
  loading,
  rtl,
}: {
  script: CommunicationScript;
  expanded: boolean;
  onToggle: () => void;
  /** Translation in flight — the English is still shown underneath meanwhile. */
  loading?: boolean;
  rtl?: boolean;
}) {
  return (
    <View style={styles.scriptBlock}>
      <Pressable onPress={onToggle} style={styles.scriptHeader}>
        {/*
          The purpose, not the language. The language is chosen in the picker
          directly above and is the same for every block, so repeating it here
          left two collapsed rows both reading "English" with nothing to tell
          them apart. Documents saved before scripts carried a purpose fall back
          to the old label rather than showing an empty header.
        */}
        <Text style={styles.scriptLang}>{script.purpose || script.languageLabel}</Text>
        <View style={styles.scriptHeaderRight}>
          {loading ? <ActivityIndicator size="small" color={C.textMuted} /> : null}
          {expanded ? <ChevronUp color={C.textMuted} size={18} strokeWidth={2.5} /> : <ChevronDown color={C.textMuted} size={18} strokeWidth={2.5} />}
        </View>
      </Pressable>
      {expanded ? (
        <Text style={[styles.scriptText, rtl && styles.scriptTextRtl]}>{script.text}</Text>
      ) : null}
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
  flagsCard: {
    backgroundColor: C.warningSoft,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.warning + "33",
    padding: Space.lg,
    marginBottom: Space.lg,
  },
  flagsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  flagsCount: { ...Type.caption, fontFamily: Font.bodyRegular, color: C.textMuted },
  flagsTitle: { ...Type.label, color: C.warning, flex: 1 },
  flagRow: { flexDirection: "row", gap: Space.sm, marginTop: Space.xs },
  flagBullet: { ...Type.body, color: C.warning },
  flagText: { ...Type.body, color: C.text, flex: 1 },
  flagsFootnote: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: Space.md,
  },
  langTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.surfaceAlt,
    borderRadius: Radius.md,
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
    marginBottom: Space.md,
  },
  langTriggerLabel: { ...Type.caption, color: C.textMuted },
  langTriggerValue: { flexDirection: "row", alignItems: "center", gap: Space.xs },
  langTriggerText: { ...Type.label, color: C.primary },
  langError: { ...Type.caption, color: C.danger, marginBottom: Space.md },
  langSheetOverlay: { flex: 1, backgroundColor: C.scrim, justifyContent: "flex-end" },
  langSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Space.xl,
    paddingBottom: Space.xxxl,
    maxHeight: "72%",
  },
  langSheetTitle: { ...Type.title, color: C.text, paddingHorizontal: Space.xl, marginBottom: Space.md },
  langSheetList: { paddingHorizontal: Space.xl },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    paddingVertical: Space.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  langRowPressed: { backgroundColor: C.surfaceAlt },
  langRowText: { ...Type.body, color: C.text },
  langRowTextActive: { fontFamily: Font.bodySemi, color: C.primary },
  langRowEnglish: { ...Type.caption, color: C.textMuted, flex: 1 },
  scriptHeaderRight: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  scriptTextRtl: { writingDirection: "rtl", textAlign: "right" },
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
