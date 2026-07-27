// CLAIRITY — Onboarding flow (smart multi-step health profile intake)
import { router } from "expo-router";
import { ChevronLeft, Check, Sparkles, User, Cake, VenusAndMars, HeartPulse, Scissors, Pill, AlertCircle, Users, Cigarette, Wine, Briefcase, Syringe } from "lucide-react-native";
import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Radius, Space, Type } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import { PrimaryButton, canGoBackSafe } from "@/components/ui";
import { AutocompleteInput, ChipSelect, MultiChipInput, AgeWheel } from "@/components/smart-inputs";
import {
  COMMON_CONDITIONS,
  COMMON_MEDICATIONS,
  COMMON_ALLERGIES,
  COMMON_SURGERIES,
  COMMON_FAMILY_HISTORY,
  COMMON_VACCINES,
  OCCUPATION_OPTIONS,
  SMOKING_OPTIONS,
  ALCOHOL_OPTIONS,
} from "@/lib/suggestion-data";
import type { HealthProfile } from "@/lib/types";

const C = Colors.light;

type InputType = "text" | "multiline" | "ageWheel" | "chipSelect" | "multiChip" | "autocomplete";

interface Step {
  key: keyof HealthProfile;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  inputType: InputType;
  placeholder?: string;
  optional: boolean;
  options?: string[];
  suggestions?: string[];
}

const STEPS: Step[] = [
  {
    key: "name",
    title: "What's your name?",
    subtitle: "So we can greet you personally throughout the app.",
    icon: <User color={C.primary} size={22} strokeWidth={2.5} />,
    inputType: "text",
    placeholder: "e.g. Harpreet Singh",
    optional: false,
  },
  {
    key: "age",
    title: "How old are you?",
    subtitle: "This helps us suggest the right vaccines for you.",
    icon: <Cake color={C.primary} size={22} strokeWidth={2.5} />,
    inputType: "ageWheel",
    optional: false,
  },
  {
    key: "gender",
    title: "What's your gender?",
    subtitle: "Used to personalize vaccine suggestions and health context.",
    icon: <VenusAndMars color={C.primary} size={22} strokeWidth={2.5} />,
    inputType: "chipSelect",
    optional: true,
    options: ["Male", "Female", "Other", "Prefer not to say"],
  },
  {
    key: "conditions",
    title: "Any medical conditions?",
    subtitle: "Tap all that apply, or add your own. This gives context when interpreting your reports.",
    icon: <HeartPulse color={C.primary} size={22} strokeWidth={2.5} />,
    inputType: "multiChip",
    optional: true,
    suggestions: COMMON_CONDITIONS,
  },
  {
    key: "surgeries",
    title: "Any past surgeries?",
    subtitle: "Tap all that apply, or add your own.",
    icon: <Scissors color={C.primary} size={22} strokeWidth={2.5} />,
    inputType: "multiChip",
    optional: true,
    suggestions: COMMON_SURGERIES,
  },
  {
    key: "medications",
    title: "What medications do you take?",
    subtitle: "Tap all that apply, or add your own. Current prescriptions and over-the-counter.",
    icon: <Pill color={C.primary} size={22} strokeWidth={2.5} />,
    inputType: "multiChip",
    optional: true,
    suggestions: COMMON_MEDICATIONS,
  },
  {
    key: "allergies",
    title: "Any allergies?",
    subtitle: "Medication, food, or environmental allergies. This is important for your safety.",
    icon: <AlertCircle color={C.primary} size={22} strokeWidth={2.5} />,
    inputType: "multiChip",
    optional: true,
    suggestions: COMMON_ALLERGIES,
  },
  {
    key: "familyHistory",
    title: "Family medical history?",
    subtitle: "Conditions that run in your family. Tap all that apply.",
    icon: <Users color={C.primary} size={22} strokeWidth={2.5} />,
    inputType: "multiChip",
    optional: true,
    suggestions: COMMON_FAMILY_HISTORY,
  },
  {
    key: "smokingStatus",
    title: "Do you smoke?",
    subtitle: "This affects your health recommendations.",
    icon: <Cigarette color={C.primary} size={22} strokeWidth={2.5} />,
    inputType: "chipSelect",
    optional: true,
    options: SMOKING_OPTIONS,
  },
  {
    key: "alcoholStatus",
    title: "How about alcohol?",
    subtitle: "Your drinking habits, if any.",
    icon: <Wine color={C.primary} size={22} strokeWidth={2.5} />,
    inputType: "chipSelect",
    optional: true,
    options: ALCOHOL_OPTIONS,
  },
  {
    key: "occupation",
    title: "What's your occupation?",
    subtitle: "Some jobs affect health risks and vaccine recommendations.",
    icon: <Briefcase color={C.primary} size={22} strokeWidth={2.5} />,
    inputType: "chipSelect",
    optional: true,
    options: OCCUPATION_OPTIONS,
  },
  {
    key: "vaccineStatus",
    title: "Vaccine status?",
    subtitle: "Tap any you remember having, or add your own. You can add dates later in the Vaccines tab.",
    icon: <Syringe color={C.primary} size={22} strokeWidth={2.5} />,
    inputType: "multiChip",
    optional: true,
    suggestions: COMMON_VACCINES,
  },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { completeOnboarding } = useClairity();
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<Partial<HealthProfile>>({});
  const [chipLists, setChipLists] = useState<Record<string, string[]>>({});

  const step = STEPS[stepIndex];
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const currentValue = (data[step.key] as string) ?? "";
  const currentChipList = chipLists[step.key] ?? [];

  const handleNext = useCallback(() => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      const finalProfile: HealthProfile = {
        name: data.name ?? "",
        age: data.age ?? "",
        gender: data.gender ?? "",
        conditions: data.conditions ?? "",
        surgeries: data.surgeries ?? "",
        medications: data.medications ?? "",
        allergies: data.allergies ?? "",
        familyHistory: data.familyHistory ?? "",
        smokingStatus: data.smokingStatus ?? "",
        alcoholStatus: data.alcoholStatus ?? "",
        occupation: data.occupation ?? "",
        vaccineStatus: data.vaccineStatus ?? "",
        onboarded: true,
      };
      completeOnboarding(finalProfile);
      router.replace("/(tabs)");
    }
  }, [stepIndex, data, completeOnboarding]);

  const handleSkip = useCallback(() => {
    handleNext();
  }, [handleNext]);

  // Onboarding is reached two ways: pushed from Home (there is history to pop)
  // and via `replace` after a data reset (there is not). Only offer the back
  // control when it can actually do something.
  const canExit = stepIndex > 0 || canGoBackSafe();

  const handleBack = useCallback(() => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
    else if (canGoBackSafe()) router.back();
  }, [stepIndex]);

  const updateText = useCallback((text: string) => {
    setData((prev) => ({ ...prev, [step.key]: text }));
  }, [step.key]);

  const toggleChip = useCallback((item: string) => {
    setChipLists((prev) => {
      const current = prev[step.key] ?? [];
      const updated = current.includes(item)
        ? current.filter((c) => c !== item)
        : [...current, item];
      setData((prevData) => ({
        ...prevData,
        [step.key]: updated.join(", "),
      }));
      return { ...prev, [step.key]: updated };
    });
  }, [step.key]);

  const addCustomChip = useCallback((item: string) => {
    setChipLists((prev) => {
      const current = prev[step.key] ?? [];
      if (current.includes(item)) return prev;
      const updated = [...current, item];
      setData((prevData) => ({
        ...prevData,
        [step.key]: updated.join(", "),
      }));
      return { ...prev, [step.key]: updated };
    });
  }, [step.key]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        {canExit ? (
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft color={C.text} size={26} strokeWidth={2.5} />
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
        <Text style={styles.stepCount}>
          Step {stepIndex + 1} of {STEPS.length}
        </Text>
        <View style={styles.backBtn} />
      </View>

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
              {step.icon}
            </View>
            <Text style={styles.title}>{step.title}</Text>
          </View>
          <Text style={styles.subtitle}>{step.subtitle}</Text>

          {/* Render the appropriate input */}
          {step.inputType === "text" ? (
            <TextInput
              style={styles.input}
              value={currentValue}
              onChangeText={updateText}
              placeholder={step.placeholder}
              placeholderTextColor={C.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
            />
          ) : step.inputType === "multiline" ? (
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={currentValue}
              onChangeText={updateText}
              placeholder={step.placeholder}
              placeholderTextColor={C.textMuted}
              multiline
              textAlignVertical="top"
              autoFocus
            />
          ) : step.inputType === "ageWheel" ? (
            <AgeWheel
              value={currentValue}
              onChange={updateText}
            />
          ) : step.inputType === "chipSelect" && step.options ? (
            <ChipSelect
              options={step.options}
              value={currentValue}
              onSelect={updateText}
            />
          ) : step.inputType === "multiChip" && step.suggestions ? (
            <MultiChipInput
              key={step.key}
              selectedItems={currentChipList}
              onToggle={toggleChip}
              onAddCustom={addCustomChip}
              suggestions={step.suggestions}
            />
          ) : null}

          <View style={{ flex: 1 }} />

          <View style={styles.actions}>
            {step.optional && (
              <Pressable onPress={handleSkip} hitSlop={12}>
                <Text style={styles.skipText}>Skip this step</Text>
              </Pressable>
            )}
            <PrimaryButton
              label={stepIndex === STEPS.length - 1 ? "Finish" : "Continue"}
              onPress={handleNext}
              icon={stepIndex === STEPS.length - 1 ? <Check color={C.textInverse} size={22} strokeWidth={2.5} /> : undefined}
              style={{ width: "100%" }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  progressTrack: {
    height: 5,
    backgroundColor: C.border,
    width: "100%",
  },
  progressFill: {
    height: 5,
    backgroundColor: C.primary,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.sm,
    paddingVertical: Space.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCount: {
    ...Type.label,
    color: C.textMuted,
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    marginTop: Space.md,
  },
  titleIcon: {
    width: 44,
    height: 44,
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
    minHeight: 130,
    textAlignVertical: "top",
  },
  actions: {
    gap: Space.lg,
    alignItems: "center",
  },
  skipText: {
    ...Type.label,
    color: C.textMuted,
    paddingVertical: Space.sm,
  },
});
