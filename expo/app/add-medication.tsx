// CLAIRITY — Add medication modal
import { router } from "expo-router";
import { Check, Pill } from "lucide-react-native";
import React, { useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Font, HIT_TARGET, Radius, Space, Type } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import { normalizeMedicationWithRxNorm, searchMedicationAutocomplete } from "@/lib/ai-service";
import { PrimaryButton, ScreenHeader } from "@/components/ui";

const C = Colors.light;

export default function AddMedicationScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { addMedication } = useClairity();
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState("");
  const [notes, setNotes] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState("08:00");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const cleaned = name.trim();
    if (cleaned.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const matches = await searchMedicationAutocomplete(cleaned);
        setSuggestions(matches.map((suggestion) => suggestion.label).slice(0, 4));
      } catch {
        setSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [name]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      return;
    }

    const cleanedName = name.trim();
    let normalizedMetadata = null as Awaited<ReturnType<typeof normalizeMedicationWithRxNorm>> | null;

    try {
      normalizedMetadata = await normalizeMedicationWithRxNorm(cleanedName);
    } catch {
      normalizedMetadata = null;
    }

    await addMedication({
      name: normalizedMetadata?.normalizedName ?? cleanedName,
      dose: dose.trim(),
      frequency: frequency.trim(),
      notes: notes.trim(),
      reminderEnabled,
      reminderTime: reminderEnabled ? reminderTime.trim() : "",
      normalizedName: normalizedMetadata?.normalizedName,
      rxNormCui: normalizedMetadata?.rxNormCui,
      openFdaBrandName: normalizedMetadata?.openFdaBrandName,
      openFdaGenericName: normalizedMetadata?.openFdaGenericName,
      fhirResource: normalizedMetadata?.fhirResource,
    });
    router.back();
  }, [name, dose, frequency, notes, reminderEnabled, reminderTime, addMedication]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Add Medication" fallbackRoute="/(tabs)/medications" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: scrollPadding }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.titleWrap}>
            <View style={styles.titleIcon}>
              <Pill color={C.primary} size={24} strokeWidth={2.5} />
            </View>
            <Text style={styles.title}>Add a Medication</Text>
          </View>
          <Text style={styles.subtitle}>
            Enter the medication name and dose. You can add details like how often you take it
            and any notes.
          </Text>

          <View style={styles.form}>
            <FieldLabel label="Medication name" required />
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Metformin"
              placeholderTextColor={C.textMuted}
              autoFocus
            />

            {suggestions.length > 0 ? (
              <View style={styles.suggestionCard}>
                <Text style={styles.suggestionTitle}>Suggested RX terms</Text>
                <View style={styles.suggestionList}>
                  {suggestions.map((suggestion) => (
                    <Pressable key={suggestion} onPress={() => setName(suggestion)} style={styles.suggestionChip}>
                      <Text style={styles.suggestionText}>{suggestion}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <FieldLabel label="Dose" />
            <TextInput
              style={styles.input}
              value={dose}
              onChangeText={setDose}
              placeholder="e.g. 500 mg"
              placeholderTextColor={C.textMuted}
            />

            <FieldLabel label="How often" />
            <TextInput
              style={styles.input}
              value={frequency}
              onChangeText={setFrequency}
              placeholder="e.g. Twice daily with meals"
              placeholderTextColor={C.textMuted}
            />

            <View style={styles.reminderCard}>
              <View style={styles.reminderHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reminderTitle}>Daily medication reminder</Text>
                  <Text style={styles.reminderHint}>Choose a time you want CLAIRITY to notify you, even when the app is closed.</Text>
                </View>
                <Switch value={reminderEnabled} onValueChange={setReminderEnabled} trackColor={{ false: C.border, true: C.primary }} />
              </View>
              {reminderEnabled ? <>
                <Text style={styles.reminderLabel}>Reminder time (24-hour clock)</Text>
                <TextInput
                  style={styles.reminderInput}
                  value={reminderTime}
                  onChangeText={setReminderTime}
                  placeholder="08:00"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={styles.reminderHint}>We’ll ask for notification permission when you save. This time is your choice—it is not taken from the prescription.</Text>
              </> : null}
            </View>

            <FieldLabel label="Notes (optional)" />
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Take with food. Prescribed by Dr. Patel."
              placeholderTextColor={C.textMuted}
              multiline
              textAlignVertical="top"
            />
          </View>

          <View style={{ flex: 1 }} />

          <PrimaryButton
            label="Save Medication"
            onPress={handleSave}
            icon={<Check color={C.textInverse} size={22} strokeWidth={2.5} />}
            disabled={!name.trim()}
            style={{ width: "100%" }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {required ? <Text style={styles.required}> *</Text> : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    marginTop: Space.md,
  },
  titleIcon: {
    width: 48,
    height: 48,
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
  subtitle: {
    ...Type.body,
    color: C.textMuted,
    marginTop: Space.md,
    marginBottom: Space.xl,
  },
  form: {
    gap: Space.lg,
  },
  suggestionCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.md,
    padding: Space.md,
  },
  suggestionTitle: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.textMuted,
    marginBottom: Space.sm,
  },
  suggestionList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm,
  },
  suggestionChip: {
    backgroundColor: C.primarySoft,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  suggestionText: {
    ...Type.label,
    color: C.primary,
  },
  fieldLabel: {
    ...Type.label,
    color: C.text,
    marginBottom: Space.sm,
  },
  required: {
    color: C.danger,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    ...Type.body,
    color: C.text,
    minHeight: 56,
  },
  inputMultiline: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  reminderCard: {
    backgroundColor: C.primarySoft,
    borderRadius: Radius.md,
    padding: Space.lg,
    gap: Space.md,
  },
  reminderHeader: { flexDirection: "row", gap: Space.md, alignItems: "center" },
  reminderTitle: { ...Type.heading, color: C.text },
  reminderHint: { ...Type.caption, color: C.textMuted },
  reminderLabel: { ...Type.label, color: C.text, marginTop: Space.xs },
  reminderInput: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.md,
    minHeight: HIT_TARGET,
    paddingHorizontal: Space.md,
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.text,
  },
});
