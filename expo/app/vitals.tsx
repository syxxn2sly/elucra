// CLAIRITY — log a reading and see what you have recorded
import { router } from "expo-router";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Activity, CalendarDays, Plus, Trash2, X } from "lucide-react-native";
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
  useWindowDimensions,
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

/** Matches the ScrollView contentContainerStyle below. */
const SCREEN_PADDING = 20;
/** The hairline on `Card`. */
const CARD_BORDER = 1;

/**
 * The date, plus the time when another reading shares that date.
 *
 * Three readings all labelled "Aug 17, 2026" give you no way to tell which row
 * is which, or which order they were taken in. The time only earns its space
 * when the date alone is ambiguous.
 */
function whenLabel(reading: VitalReading, siblings: VitalReading[]): string {
  const date = formatDateDisplay(reading.takenAt);
  const shared = siblings.some(
    (other) => other.id !== reading.id && formatDateDisplay(other.takenAt) === date,
  );
  if (!shared) return date;
  const time = new Date(reading.takenAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date}, ${time}`;
}

/** The picker and the `<input type="date">` fallback both speak YYYY-MM-DD. */
function toDateInput(value: Date): string {
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

export default function VitalsScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { vitals, addVital, removeVital } = useClairity();

  const [adding, setAdding] = useState<VitalKind | null>(null);

  /*
    The chart needs a pixel width, and every card on this screen is the same
    width, so it is arithmetic rather than something to measure.

    Measuring with onLayout meant the chart could only appear a frame after the
    card had already drawn, and a stale measurement outlived a resize and spilled
    the line past the card edge. Deriving it is correct on the very first frame.

    On web this value does not follow a window resize — the chart keeps the width
    it mounted with and under-fills, which is whitespace rather than overflow, and
    corrects on the next mount. That is the harmless direction to fail in, and the
    app is phone-first, where the width is fixed for the life of the screen.
  */
  const { width: windowWidth } = useWindowDimensions();
  const chartWidth =
    windowWidth -
    SCREEN_PADDING * 2 -
    (Space.lg + CARD_BORDER) * 2 - // Card padding and its hairline border
    Space.xs * 2; // trendWrap

  const remove = useCallback(
    (reading: VitalReading) => {
      confirmDestructive(
        "Delete this reading?",
        `${vitalDefinition(reading.kind).label}: ${formatVital(reading)}`,
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
                {/* Above the readings: the shape is what you came to see. */}
                <View style={styles.trendWrap}>
                  <VitalTrend readings={readings} width={chartWidth} />
                </View>
                {readings.map((reading, index) => (
                  <View
                    key={reading.id}
                    style={[styles.readingRow, index > 0 && styles.readingRowDivided]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.readingValue}>{formatVital(reading)}</Text>
                      <Text style={styles.readingWhen}>
                        {whenLabel(reading, readings)}
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
          ELUCRA records what you measured and shows the reference figures alongside it. It does
          not tell you whether a reading is a problem. That depends on how it was taken, what else
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

  /*
    Defaults to now, because that is the common case, but a reading taken this
    morning and logged at lunchtime is the second commonest — and without this
    it landed on the chart at the wrong point in time.
  */
  const [takenAt, setTakenAt] = useState(() => new Date());
  const [pickingDate, setPickingDate] = useState(false);
  const [dateInput, setDateInput] = useState(() => toDateInput(new Date()));

  const applyDate = useCallback((next: Date) => {
    setTakenAt(next);
    setDateInput(toDateInput(next));
    setError("");
  }, []);

  const handlePickerChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS === "android") setPickingDate(false);
      if (event.type === "dismissed" || !selected) return;
      // Keep the time of day already on the reading and move only the date.
      const next = new Date(takenAt);
      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      applyDate(next);
    },
    [takenAt, applyDate],
  );

  const handleWebDateChange = useCallback(
    (value: string) => {
      setDateInput(value);
      const [year, month, day] = value.split("-").map(Number);
      if (!year || !month || !day) return;
      const next = new Date(takenAt);
      next.setFullYear(year, month - 1, day);
      applyDate(next);
    },
    [takenAt, applyDate],
  );

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
      takenAt: takenAt.toISOString(),
      note: note.trim(),
    });
    // `takenAt` belongs here. Without it this closed over whichever date was
    // current the last time one of the other dependencies changed, and `first`
    // is one of them: typing the value refreshed the closure, so setting the
    // date *before* typing saved correctly and setting it *after* silently
    // saved today. That reads as "only some vitals keep the date".
  }, [first, second, note, definition, kind, takenAt, onSave]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetOverlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {/*
          The sheet closes the date picker on any tap that nothing else claims.

          Without a Done button the only way to collapse the wheel was to find
          the date field again, which is a small target and not where the hand
          already is. Controls inside the sheet claim their own touches, so the
          inputs still focus and "Save reading" still saves on the first tap;
          this only catches the taps that would otherwise have gone nowhere.
        */}
        <Pressable
          accessible={false}
          style={styles.sheet}
          onPress={() => {
            if (pickingDate) setPickingDate(false);
          }}
        >
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

          <Text style={styles.inputLabel}>When</Text>
          {Platform.OS === "web" ? (
            <TextInput
              style={styles.input}
              value={dateInput}
              onChangeText={handleWebDateChange}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={C.textMuted}
              autoCapitalize="none"
            />
          ) : (
            <Pressable
              onPress={() => setPickingDate((open) => !open)}
              style={({ pressed }) => [styles.input, styles.dateButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Date of reading, ${formatDateDisplay(takenAt.toISOString())}`}
            >
              <CalendarDays color={C.primary} size={19} strokeWidth={2.4} />
              <Text style={styles.dateButtonText}>{formatDateDisplay(takenAt.toISOString())}</Text>
            </Pressable>
          )}

          {pickingDate ? (
            <View style={styles.pickerPanel}>
              <DateTimePicker
                value={takenAt}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                // Same iOS-only caveat as the appointment screen: on Android the
                // picker follows the system theme regardless of this.
                themeVariant={Platform.OS === "ios" ? "light" : undefined}
                /* A reading you have not taken yet is not a reading. */
                maximumDate={new Date()}
                onChange={handlePickerChange}
              />
              {/*
                No Done button. The spinner already reports every turn through
                `onChange`, so the date on the field above is always what the
                wheel is showing — a button to "confirm" it only implied that
                scrolling alone had not counted. The field itself collapses the
                picker when the reading is dated.
              */}
            </View>
          ) : null}

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
        </Pressable>
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
  dateButton: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  dateButtonText: { ...Type.body, color: C.text },
  pickerPanel: { alignItems: "center", marginTop: Space.sm },
  donePickerButton: { minHeight: HIT_TARGET, justifyContent: "center", paddingHorizontal: Space.lg },
  donePickerText: { ...Type.label, color: C.primary },
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
