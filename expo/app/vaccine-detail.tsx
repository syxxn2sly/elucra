// CLAIRITY — Vaccine detail (dating, proof, reminders)
import { router, useLocalSearchParams } from "expo-router";
import {
  Shield,
  CheckCircle2,
  Camera,
  Image as ImageIcon,
  Trash2,
  Calendar,
  HelpCircle,
} from "lucide-react-native";
import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Alert,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";

import { ZoomablePhoto } from "@/components/photo-viewer";
import Colors from "@/constants/colors";
import { Font, HIT_TARGET, Radius, Space, Type } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import { VACCINE_CATALOG } from "@/lib/vaccine-data";
import { formatMonthYear, formatDueCountdown, formatDateDisplay } from "@/lib/utils";
import { Card, Tag, PrimaryButton, EmptyState, ScreenHeader } from "@/components/ui";

const C = Colors.light;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function VaccineDetailScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vaccines, updateVaccineDate, recordVaccineDose, removeVaccineDose, setVaccineProof, removeVaccine } = useClairity();

  const vac = vaccines.find((v) => v.id === id);
  const [editingDate, setEditingDate] = useState(!vac?.hasDate);
  /** Which dose the editor is open for, or null. Dose 1 is edited above. */
  const [editingDose, setEditingDose] = useState<number | null>(null);
  const [doseMonth, setDoseMonth] = useState<number | null>(null);
  const [doseYear, setDoseYear] = useState<string>("");
  const [month, setMonth] = useState<number | null>(vac?.monthReceived ?? null);
  const [year, setYear] = useState<string>(vac?.yearReceived?.toString() ?? "");
  /*
    Starts false even for a vaccine with no date. It used to start true, which
    hid the month and year pickers behind the "I'm not sure" radio — so the one
    thing someone opening an undated vaccine wants to do required first turning
    off a checkbox they had not ticked. Entering a date is the default path; not
    knowing it is the exception.
  */
  const [notSure, setNotSure] = useState(false);

  const info = vac ? VACCINE_CATALOG.find((v) => v.id === vac.vaccineId) : null;

  const handleSaveDate = useCallback(() => {
    if (!vac) return;
    if (notSure) {
      updateVaccineDate(vac.id, null, null, false);
      setEditingDate(false);
      return;
    }
    const monthNum = month;
    const yearNum = parseInt(year, 10);
    if (!monthNum || !yearNum || yearNum < 1900 || yearNum > 2100) {
      Alert.alert("Please check", "Select both a month and a valid year, or choose \"I'm not sure\".");
      return;
    }
    updateVaccineDate(vac.id, monthNum, yearNum, true);
    setEditingDate(false);
  }, [vac, notSure, month, year, updateVaccineDate]);

  const handleProofCamera = useCallback(async () => {
    if (!vac) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Camera access is needed to photograph your proof.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setVaccineProof(vac.id, result.assets[0].uri);
    }
  }, [vac, setVaccineProof]);

  const handleProofGallery = useCallback(async () => {
    if (!vac) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setVaccineProof(vac.id, result.assets[0].uri);
    }
  }, [vac, setVaccineProof]);

  const handleDelete = useCallback(() => {
    if (!vac) return;
    Alert.alert(
      "Remove this vaccine?",
      "This will delete your record of this vaccine.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            removeVaccine(vac.id);
            router.back();
          },
        },
      ],
    );
  }, [vac, removeVaccine]);

  if (!vac || !info) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <EmptyState
          title="Vaccine not found"
          message="This vaccine record may have been deleted."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Vaccine"
        fallbackRoute="/(tabs)/vaccines"
        actions={
          <Pressable
            onPress={handleDelete}
            hitSlop={12}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Delete vaccine record"
          >
            <Trash2 color={C.danger} size={22} />
          </Pressable>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: scrollPadding }}
      >
        {/* Title */}
        <View style={styles.titleRow}>
          <View style={styles.titleIcon}>
            <Shield color={C.docVaccination} size={28} strokeWidth={2.5} />
          </View>
          <Text style={styles.title}>{vac.name}</Text>
        </View>

        {/* Description */}
        <Card style={{ marginTop: 18 }}>
          <Text style={styles.descLabel}>What it protects against</Text>
          <Text style={styles.descText}>{info.protectsAgainst}</Text>
          <Text style={[styles.descLabel, { marginTop: 16 }]}>About this vaccine</Text>
          <Text style={styles.descText}>{info.description}</Text>
          {info.cadenceMonths ? (
            <View style={styles.cadenceRow}>
              <Calendar color={C.primary} size={18} strokeWidth={2.5} />
              <Text style={styles.cadenceText}>
                {info.cadenceMonths === 12
                  ? "Recommended yearly"
                  : `Every ${info.cadenceMonths} months`}
              </Text>
            </View>
          ) : null}
        </Card>

        {/*
          Courses given in more than one dose. Hidden entirely for a single-shot
          vaccine, where a series would be noise — "1 of 1" tells nobody
          anything. Dose 1 is edited through the card above, so it is shown here
          read-only to keep one date in one place.
        */}
        {info && info.doseCount > 1 ? (
          <Card style={{ marginTop: 16 }}>
            <View style={styles.doseHeader}>
              <Text style={styles.cardTitle}>Doses</Text>
              <Text style={styles.doseCount}>
                {vac.doses.length} of {info.doseCount}
                {vac.doses.length >= info.doseCount ? " · complete" : ""}
              </Text>
            </View>
            <Text style={styles.doseIntro}>
              This vaccine is given as {info.doseCount} doses
              {info.doseIntervalMonths ? `, usually about ${info.doseIntervalMonths} months apart` : ""}.
            </Text>

            {Array.from({ length: info.doseCount }, (_, index) => index + 1).map((doseNumber) => {
              const dose = vac.doses.find((entry) => entry.doseNumber === doseNumber);
              const isEditing = editingDose === doseNumber;
              return (
                <View key={doseNumber} style={styles.doseRow}>
                  <View style={styles.doseNumWrap}>
                    <Text style={[styles.doseNum, dose && styles.doseNumDone]}>{doseNumber}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.doseLabel}>Dose {doseNumber}</Text>
                    <Text style={styles.doseDate}>
                      {dose ? formatMonthYear(dose.monthReceived, dose.yearReceived) : "Not recorded"}
                    </Text>
                  </View>
                  {doseNumber === 1 ? (
                    <Text style={styles.doseHint}>Set below</Text>
                  ) : isEditing ? (
                    <Pressable onPress={() => setEditingDose(null)} hitSlop={10}>
                      <Text style={styles.editLink}>Cancel</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.doseActions}>
                      <Pressable onPress={() => setEditingDose(doseNumber)} hitSlop={10}>
                        <Text style={styles.editLink}>{dose ? "Edit" : "Add"}</Text>
                      </Pressable>
                      {dose ? (
                        <Pressable onPress={() => removeVaccineDose(vac.id, doseNumber)} hitSlop={10}>
                          <Text style={styles.doseRemove}>Clear</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  )}
                </View>
              );
            })}

            {editingDose && editingDose > 1 ? (
              <View style={styles.doseEditor}>
                <Text style={styles.doseEditorTitle}>When was dose {editingDose}?</Text>
                <Text style={styles.pickerLabel}>Month received</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
                  {MONTHS.map((name, index) => (
                    <Pressable
                      key={name}
                      onPress={() => setDoseMonth(index + 1)}
                      style={({ pressed }) => [
                        styles.monthChip,
                        doseMonth === index + 1 && styles.monthChipActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.monthChipText, doseMonth === index + 1 && styles.monthChipTextActive]}>
                        {name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={styles.pickerLabel}>Year received</Text>
                <TextInput
                  style={styles.yearInput}
                  value={doseYear}
                  onChangeText={setDoseYear}
                  placeholder="e.g. 2026"
                  placeholderTextColor={C.textMuted}
                  keyboardType="number-pad"
                  maxLength={4}
                />
                <PrimaryButton
                  label={`Save dose ${editingDose}`}
                  onPress={() => {
                    const yearNum = parseInt(doseYear, 10);
                    if (!doseMonth || Number.isNaN(yearNum)) return;
                    recordVaccineDose(vac.id, editingDose, doseMonth, yearNum);
                    setEditingDose(null);
                    setDoseMonth(null);
                    setDoseYear("");
                  }}
                  disabled={!doseMonth || doseYear.length !== 4}
                  style={{ marginTop: Space.md }}
                />
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Date recorded */}
        <Card style={{ marginTop: 16 }}>
          <Text style={styles.cardTitle}>When did you get it?</Text>
          {!editingDate && vac.hasDate ? (
            <View style={styles.dateDisplay}>
              <Text style={styles.dateText}>
                {formatMonthYear(vac.monthReceived, vac.yearReceived)}
              </Text>
              <Pressable onPress={() => setEditingDate(true)} hitSlop={12}>
                <Text style={styles.editLink}>Edit</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.dateEditor}>
              {!notSure ? (
                <View style={styles.datePickers}>
                  <Text style={styles.pickerLabel}>Month received</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
                    {MONTHS.map((m, idx) => (
                      <Pressable
                        key={m}
                        onPress={() => setMonth(idx + 1)}
                        style={({ pressed }) => [
                          styles.monthChip,
                          month === idx + 1 && styles.monthChipActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.monthChipText, month === idx + 1 && styles.monthChipTextActive]}>
                          {m}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Text style={styles.pickerLabel}>Year received</Text>
                  <TextInput
                    style={styles.yearInput}
                    value={year}
                    onChangeText={setYear}
                    placeholder="e.g. 2024"
                    placeholderTextColor={C.textMuted}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                </View>
              ) : (
                <Text style={styles.notSureHint}>
                  We'll record that you've had this vaccine, but we can't send you reminders
                  without a date. You can add a date anytime.
                </Text>
              )}

              {/*
                Below the date entry, not above it. As the first thing in the
                card it read like a question to answer before continuing; here it
                reads as the alternative it is.
              */}
              <Pressable
                onPress={() => setNotSure(!notSure)}
                style={({ pressed }) => [styles.notSureRow, pressed && styles.pressed]}
              >
                <View style={[styles.radio, notSure && styles.radioActive]}>
                  {notSure ? <View style={styles.radioDot} /> : null}
                </View>
                <Text style={styles.notSureText}>I'm not sure of the exact date</Text>
              </Pressable>

              <PrimaryButton label="Save" onPress={handleSaveDate} style={{ marginTop: 18 }} />
            </View>
          )}
        </Card>

        {/* Next due */}
        {vac.nextDueDate ? (
          <Card style={[styles.dueCard, { marginTop: 16 }]}>
            <View style={styles.dueRow}>
              <View>
                <Text style={styles.dueLabel}>Next due</Text>
                <Text style={styles.dueDate}>{formatDateDisplay(vac.nextDueDate)}</Text>
              </View>
              <Tag
                text={formatDueCountdown(vac.nextDueDate)}
                color={formatDueCountdown(vac.nextDueDate) === "Overdue" ? C.danger : C.accent}
                bg={formatDueCountdown(vac.nextDueDate) === "Overdue" ? C.dangerSoft : C.accentSoft}
              />
            </View>
          </Card>
        ) : null}

        {/* Proof & verification */}
        <Card style={{ marginTop: 16 }}>
          <Text style={styles.cardTitle}>Proof of Vaccination</Text>
          <Text style={styles.proofHint}>
            Attach a photo of your vaccination card, immunization-registry record, or
            provider record to verify this vaccine.
          </Text>
          {vac.proofImageUri ? (
            <View style={styles.proofImageWrap}>
              <ZoomablePhoto
                uri={vac.proofImageUri}
                style={styles.proofImage}
                contentFit="contain"
                accessibilityLabel="Open proof photo full screen"
                caption={vac.name}
              />
              <View style={styles.verifiedBadge}>
                <CheckCircle2 color={C.success} size={18} strokeWidth={2.5} />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
              <Pressable
                onPress={() => setVaccineProof(vac.id, null)}
                style={styles.removeProofBtn}
              >
                <Text style={styles.removeProofText}>Remove proof</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.proofActions}>
              <Pressable
                onPress={handleProofCamera}
                style={({ pressed }) => [styles.proofBtn, pressed && styles.pressed]}
              >
                <Camera color={C.primary} size={24} strokeWidth={2.5} />
                <Text style={styles.proofBtnText}>Take Photo</Text>
              </Pressable>
              <Pressable
                onPress={handleProofGallery}
                style={({ pressed }) => [styles.proofBtn, pressed && styles.pressed]}
              >
                <ImageIcon color={C.accent} size={24} strokeWidth={2.5} />
                <Text style={styles.proofBtnText}>From Gallery</Text>
              </Pressable>
            </View>
          )}
          {!vac.proofImageUri ? (
            <View style={styles.unverifiedRow}>
              <HelpCircle color={C.textMuted} size={16} strokeWidth={2.5} />
              <Text style={styles.unverifiedText}>Not verified — add proof to mark as verified</Text>
            </View>
          ) : null}
        </Card>

        {/* Travel context */}
        {vac.isTravel && vac.travelDestination ? (
          <Card style={[styles.travelCard, { marginTop: 16 }]}>
            <Text style={styles.travelLabel}>✈️ Travel vaccine</Text>
            <Text style={styles.travelText}>
              Added for travel to {vac.travelDestination}
            </Text>
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  headerBtn: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    marginTop: Space.sm,
  },
  titleIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    ...Type.display,
    color: C.text,
  },
  cardTitle: {
    ...Type.heading,
    color: C.text,
    marginBottom: Space.md,
  },
  // Description
  descLabel: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  descText: {
    ...Type.body,
    color: C.text,
    marginTop: Space.xs,
  },
  cadenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    marginTop: Space.lg,
    backgroundColor: C.primarySoft,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.pill,
    alignSelf: "flex-start",
  },
  cadenceText: {
    ...Type.label,
    color: C.primary,
  },
  // Date
  doseHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  doseCount: { ...Type.caption, fontFamily: Font.bodySemi, color: C.primary },
  doseIntro: { ...Type.caption, color: C.textMuted, marginTop: Space.xs, marginBottom: Space.md },
  doseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  doseNumWrap: {
    width: 30,
    height: 30,
    borderRadius: Radius.pill,
    backgroundColor: C.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  doseNum: { ...Type.caption, fontFamily: Font.bodySemi, color: C.textMuted },
  doseNumDone: { color: C.primary },
  doseLabel: { ...Type.label, color: C.text },
  doseDate: { ...Type.caption, color: C.textMuted, marginTop: 2 },
  doseHint: { ...Type.caption, color: C.textMuted },
  doseActions: { flexDirection: "row", gap: Space.md },
  doseRemove: { ...Type.caption, fontFamily: Font.bodySemi, color: C.danger },
  doseEditor: {
    marginTop: Space.md,
    paddingTop: Space.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  doseEditorTitle: { ...Type.label, color: C.text, marginBottom: Space.sm },
  dateDisplay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateText: {
    ...Type.title,
    color: C.text,
  },
  editLink: {
    ...Type.label,
    color: C.primary,
  },
  dateEditor: {
    gap: Space.xs,
  },
  notSureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.md,
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: Radius.pill,
    borderWidth: 2.5,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: {
    borderColor: C.primary,
  },
  radioDot: {
    width: 13,
    height: 13,
    borderRadius: Radius.pill,
    backgroundColor: C.primary,
  },
  notSureText: {
    ...Type.body,
    color: C.text,
    flex: 1,
  },
  notSureHint: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: Space.sm,
  },
  datePickers: {
    marginTop: Space.md,
  },
  pickerLabel: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.textMuted,
    marginBottom: Space.sm,
    marginTop: Space.md,
  },
  monthScroll: {
    flexDirection: "row",
  },
  monthChip: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.pill,
    backgroundColor: C.surfaceAlt,
    marginRight: Space.sm,
  },
  monthChipActive: {
    backgroundColor: C.primary,
  },
  monthChipText: {
    ...Type.label,
    color: C.text,
  },
  monthChipTextActive: {
    color: C.textInverse,
  },
  yearInput: {
    backgroundColor: C.surfaceAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    ...Type.body,
    color: C.text,
  },
  // Due
  dueCard: {
    backgroundColor: C.accentSoft,
    borderColor: "transparent",
    borderWidth: 0,
  },
  dueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dueLabel: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.textMuted,
  },
  dueDate: {
    ...Type.title,
    color: C.text,
    marginTop: Space.xs,
  },
  // Proof
  proofHint: {
    ...Type.body,
    color: C.textMuted,
    marginBottom: Space.lg,
  },
  proofActions: {
    flexDirection: "row",
    gap: Space.md,
  },
  proofBtn: {
    flex: 1,
    alignItems: "center",
    gap: Space.sm,
    backgroundColor: C.surfaceAlt,
    borderRadius: Radius.md,
    paddingVertical: Space.lg,
  },
  proofBtnText: {
    ...Type.label,
    color: C.text,
  },
  proofImageWrap: {
    alignItems: "center",
    gap: Space.md,
  },
  proofImage: {
    width: "100%",
    height: 220,
    borderRadius: Radius.md,
    backgroundColor: C.surfaceAlt,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  verifiedText: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.success,
  },
  removeProofBtn: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
  },
  removeProofText: {
    ...Type.label,
    color: C.danger,
  },
  unverifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    marginTop: Space.md,
  },
  unverifiedText: {
    ...Type.caption,
    color: C.textMuted,
    flex: 1,
  },
  // Travel
  travelCard: {
    backgroundColor: C.accentSoft,
    borderColor: "transparent",
    borderWidth: 0,
  },
  travelLabel: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.text,
  },
  travelText: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: Space.xs,
  },
});
