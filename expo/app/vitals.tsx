// CLAIRITY — log a reading and see what you have recorded
import { router } from "expo-router";
import { Activity, Plus, Trash2, X } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Font, HIT_TARGET, Radius, Space, Type } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import { confirmDestructive, formatDateDisplay } from "@/lib/utils";
import { VITAL_DEFINITIONS, formatVital, vitalDefinition } from "@/lib/vitals-data";
import { Card, EmptyState, PrimaryButton, ScreenHeader } from "@/components/ui";
import { VitalTrend } from "@/components/vital-trend";
import type { VitalKind, VitalReading } from "@/lib/types";

const C = Colors.light;

export default function VitalsScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { vitals, addVital, removeVital } = useClairity();

  const [adding, setAdding] = useState<VitalKind | null>(null);
  /** Measured per group, since each card lays out independently. */
  const [chartWidths, setChartWidths] = useState<Record<string, number>>({});

  const remove = useCallback(
    (reading: VitalReading) => {
      confirmDestructive(
        "Delete this reading?",
        `${vitalDefinition(reading.kind).label} — ${formatVital(reading)}`,
        "Delete",
        () => removeVital(reading.id),
      );
    },
    [removeVital],
  );

  /**
   * Grouped by kind, each with its most recent reading first.
   *
   * A flat chronological list mixes weight and blood pressure together, which is
   * not how anyone thinks about them — you look up one measure at a time.
   */
  const grouped = useMemo(
    () =>
      VITAL_DEFINITIONS.map((definition) => ({
        definition,
        readings: vitals.filter((reading) => reading.kind === definition.kind),
      })).filter((group) => group.readings.length > 0),
    [vitals],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Vitals" fallbackRoute="/(tabs)" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: scrollPadding, flexGrow: 1 }}
      >
        <Text style={styles.intro}>
          Readings you take at home or at an appointment, kept on this device so you can show your
          clinician the pattern rather than a single number.
        </Text>

        {/* Always visible: the point of the screen is adding a reading. */}
        <Text style={styles.sectionLabel}>Record a reading</Text>
        <View style={styles.kindGrid}>
          {VITAL_DEFINITIONS.map((definition) => (
            <Pressable
              key={definition.kind}
              onPress={() => setAdding(definition.kind)}
              style={({ pressed }) => [styles.kindChip, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Record ${definition.label}`}
            >
              <Plus color={C.primary} size={15} strokeWidth={2.5} />
              <Text style={styles.kindChipText}>{definition.label}</Text>
            </Pressable>
          ))}
        </View>

        {grouped.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon={<Activity color={C.primary} size={40} strokeWidth={2.5} />}
              title="Nothing recorded yet"
              message="Pick a measurement above to log your first reading."
            />
          </View>
        ) : (
          grouped.map(({ definition, readings }) => (
            <View key={definition.kind} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>{definition.label}</Text>
                <Text style={styles.groupCount}>
                  {readings.length} {readings.length === 1 ? "reading" : "readings"}
                </Text>
              </View>
              <Text style={styles.groupReference}>{definition.reference}</Text>

              <Card style={styles.groupCard}>
                {/*
                  Above the readings, because the shape is what you came to see
                  once there is more than one. onLayout supplies the width —
                  SVG needs a number and the card is flexible.
                */}
                <View
                  style={styles.trendWrap}
                  onLayout={(event) =>
                    setChartWidths((prev) =>
                      prev[definition.kind] === event.nativeEvent.layout.width
                        ? prev
                        : { ...prev, [definition.kind]: event.nativeEvent.layout.width },
                    )
                  }
                >
                  {chartWidths[definition.kind] ? (
                    <VitalTrend readings={readings} width={chartWidths[definition.kind]} />
                  ) : null}
                </View>
                {readings.map((reading, index) => (
                  <View
                    key={reading.id}
                    style={[styles.readingRow, index > 0 && styles.readingRowDivided]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.readingValue}>{formatVital(reading)}</Text>
                      <Text style={styles.readingWhen}>
                        {formatDateDisplay(reading.takenAt)}
                        {reading.note ? ` · ${reading.note}` : ""}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => remove(reading)}
                      hitSlop={10}
                      style={styles.deleteBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${definition.label} reading`}
                    >
                      <Trash2 color={C.danger} size={18} strokeWidth={2.5} />
                    </Pressable>
                  </View>
                ))}
              </Card>
            </View>
          ))
        )}

        <Text style={styles.disclaimer}>
          CLAIRITY records what you measured and shows the reference figures alongside it. It does
          not tell you whether a reading is a problem — that depends on how it was taken, what else
          is going on, and your history, which is a conversation for your clinician.
        </Text>
      </ScrollView>

      {adding ? (
        <AddReadingSheet
          kind={adding}
          onClose={() => setAdding(null)}
          onSave={(reading) => {
            addVital(reading);
            setAdding(null);
          }}
        />
      ) : null}
    </View>
  );
}

function AddReadingSheet({
  kind,
  onClose,
  onSave,
}: {
  kind: VitalKind;
  onClose: () => void;
  onSave: (reading: Omit<VitalReading, "id" | "createdAt">) => void;
}) {
  const definition = vitalDefinition(kind);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const save = useCallback(() => {
    const firstValue = Number(first);
    const secondValue = Number(second);

    const inRange = (value: number) =>
      Number.isFinite(value) && value >= definition.min && value <= definition.max;

    if (definition.paired) {
      if (!inRange(firstValue) || !inRange(secondValue)) {
        setError(`Enter both numbers, between ${definition.min} and ${definition.max}.`);
        return;
      }
      if (secondValue >= firstValue) {
        // Catches the commonest entry slip — the two numbers swapped.
        setError("The top number should be higher than the bottom one. Are they the right way round?");
        return;
      }
    } else if (!inRange(firstValue)) {
      setError(`Enter a number between ${definition.min} and ${definition.max} ${definition.unit}.`);
      return;
    }

    onSave({
      kind,
      value: definition.paired ? null : firstValue,
      systolic: definition.paired ? firstValue : null,
      diastolic: definition.paired ? secondValue : null,
      // Recorded as now. Back-dating is a later addition; guessing a different
      // time would be worse than recording the one we know.
      takenAt: new Date().toISOString(),
      note: note.trim(),
    });
  }, [first, second, note, definition, kind, onSave]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetOverlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{definition.label}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Cancel">
              <X color={C.textMuted} size={22} strokeWidth={2.5} />
            </Pressable>
          </View>

          <View style={styles.inputRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>
                {definition.paired ? definition.paired.firstLabel : `Reading (${definition.unit})`}
              </Text>
              <TextInput
                style={styles.input}
                value={first}
                onChangeText={(text) => {
                  setFirst(text);
                  setError("");
                }}
                placeholder={definition.placeholder}
                placeholderTextColor={C.textMuted}
                keyboardType={definition.decimals ? "decimal-pad" : "number-pad"}
                autoFocus
              />
            </View>
            {definition.paired ? (
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>{definition.paired.secondLabel}</Text>
                <TextInput
                  style={styles.input}
                  value={second}
                  onChangeText={(text) => {
                    setSecond(text);
                    setError("");
                  }}
                  placeholder="80"
                  placeholderTextColor={C.textMuted}
                  keyboardType="number-pad"
                />
              </View>
            ) : null}
          </View>

          <Text style={styles.inputLabel}>Note (optional)</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="e.g. before breakfast, after a walk"
            placeholderTextColor={C.textMuted}
          />

          <Text style={styles.sheetReference}>{definition.reference}</Text>
          {error ? <Text style={styles.sheetError}>{error}</Text> : null}

          <PrimaryButton label="Save reading" onPress={save} style={{ marginTop: Space.lg }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  intro: { ...Type.body, color: C.textMuted, marginBottom: Space.xl },
  sectionLabel: { ...Type.label, color: C.text, marginBottom: Space.sm },
  kindGrid: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm, marginBottom: Space.xl },
  kindChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.pill,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  kindChipText: { ...Type.caption, fontFamily: Font.bodySemi, color: C.text },
  emptyWrap: { paddingVertical: Space.xl },
  group: { marginBottom: Space.xl },
  groupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  groupTitle: { ...Type.heading, color: C.text },
  groupCount: { ...Type.caption, color: C.textMuted },
  groupReference: { ...Type.caption, color: C.textMuted, marginTop: 2, marginBottom: Space.sm },
  groupCard: { paddingVertical: Space.xs },
  trendWrap: { paddingHorizontal: Space.xs },
  readingRow: { flexDirection: "row", alignItems: "center", paddingVertical: Space.md },
  readingRowDivided: { borderTopWidth: 1, borderTopColor: C.border },
  readingValue: { ...Type.title, color: C.text },
  readingWhen: { ...Type.caption, color: C.textMuted, marginTop: 2 },
  deleteBtn: { width: HIT_TARGET, height: HIT_TARGET, alignItems: "center", justifyContent: "center" },
  disclaimer: { ...Type.caption, color: C.textMuted, marginTop: Space.lg, lineHeight: 19 },
  pressed: { opacity: 0.85 },

  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Space.xl,
    paddingBottom: Space.xxxl,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Space.lg,
  },
  sheetTitle: { ...Type.title, color: C.text },
  inputRow: { flexDirection: "row", gap: Space.md },
  inputLabel: { ...Type.caption, color: C.textMuted, marginBottom: Space.xs },
  input: {
    minHeight: 56,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    color: C.text,
    marginBottom: Space.md,
    ...Type.body,
  },
  sheetReference: { ...Type.caption, color: C.textMuted, marginTop: Space.xs },
  sheetError: { ...Type.caption, color: C.danger, marginTop: Space.sm },
});
