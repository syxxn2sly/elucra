// CLAIRITY — Personal medical portfolio: family doctor and care-team record
import { router } from "expo-router";
import { Stethoscope, Check, ShieldCheck } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Radius, Space, Type } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { PrimaryButton, ScreenHeader } from "@/components/ui";
import { PlaceField } from "@/components/place-field";
import { useClairity } from "@/lib/store";
import type { FamilyDoctor } from "@/lib/types";

const C = Colors.light;

const EMPTY_DOCTOR: FamilyDoctor = {
  doctorName: "",
  clinicName: "",
  phone: "",
  fax: "",
  address: "",
  afterHoursInstructions: "",
};

export default function IdentityScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { familyDoctor, updateFamilyDoctor } = useClairity();
  const [draft, setDraft] = useState<FamilyDoctor>(familyDoctor ?? EMPTY_DOCTOR);

  const setField = useCallback((key: keyof FamilyDoctor, value: string) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }, []);

  const save = useCallback(() => {
    updateFamilyDoctor(draft);
    router.back();
  }, [draft, updateFamilyDoctor]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Care Team" fallbackRoute="/(tabs)/settings" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: scrollPadding }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.heroIcon}><Stethoscope color={C.primary} size={26} strokeWidth={2.5} /></View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.title}>Your Family Doctor</Text>
              <Text style={styles.subtitle}>Keep the details you may need at an appointment, in an emergency, or when sharing your health record.</Text>
            </View>
          </View>

          <Field label="Doctor's name" value={draft.doctorName} onChangeText={(value) => setField("doctorName", value)} placeholder="e.g. Dr. A. Patel" />
          <PlaceField
            label="Clinic or practice"
            value={draft.clinicName}
            onChangeText={(value) => setField("clinicName", value)}
            placeholder="e.g. Lakeside Family Health Team"
            /*
              Choosing a clinic fills both fields. The lookup already knows the
              name and the address separately; putting the whole one-line label
              in this field left the address box empty and the name box holding
              an address it was not asking for.
            */
            onPickPlace={(place) => {
              setDraft((prev) => ({
                ...prev,
                clinicName: place.name || place.label,
                // Never blank an address the user has already written.
                address: place.address || prev.address,
              }));
            }}
          />
          <Field label="Clinic phone" value={draft.phone} onChangeText={(value) => setField("phone", value)} placeholder="e.g. 416 555 1234" keyboardType="phone-pad" />
          <Field label="Clinic fax (optional)" value={draft.fax} onChangeText={(value) => setField("fax", value)} placeholder="e.g. 416 555 5678" keyboardType="phone-pad" />
          <PlaceField
            label="Clinic address (optional)"
            value={draft.address}
            onChangeText={(value) => setField("address", value)}
            placeholder="Street, city, postal code"
            onPickPlace={(place) => setField("address", place.address || place.label)}
          />
          <Field label="After-hours instructions (optional)" value={draft.afterHoursInstructions} onChangeText={(value) => setField("afterHoursInstructions", value)} placeholder="e.g. Call the clinic's after-hours line" multiline />

          <View style={styles.note}>
            <ShieldCheck color={C.primary} size={19} strokeWidth={2.5} />
            <Text style={styles.noteText}>This care-team record stays in your personal CLAIRITY portfolio on this device.</Text>
          </View>

          <PrimaryButton label="Save Care Team" onPress={save} icon={<Check color={C.textInverse} size={21} strokeWidth={2.5} />} style={styles.saveButton} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean; keyboardType?: "default" | "phone-pad" }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multilineInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize="words"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: Space.lg },
  hero: {
    flexDirection: "row",
    gap: Space.md,
    marginTop: Space.md,
    marginBottom: Space.lg,
    alignItems: "flex-start",
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: Radius.md,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTextWrap: { flex: 1 },
  title: { ...Type.display, color: C.text },
  subtitle: { ...Type.body, color: C.textMuted, marginTop: Space.xs },
  field: { marginTop: Space.lg },
  fieldLabel: { ...Type.label, color: C.text, marginBottom: Space.sm },
  input: {
    minHeight: 56,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    ...Type.body,
    color: C.text,
  },
  multilineInput: { minHeight: 94, textAlignVertical: "top" },
  note: {
    flexDirection: "row",
    gap: Space.md,
    alignItems: "center",
    backgroundColor: C.primarySoft,
    padding: Space.lg,
    borderRadius: Radius.md,
    marginTop: Space.xl,
  },
  noteText: { flex: 1, ...Type.caption, color: C.textMuted },
  saveButton: { marginTop: Space.lg, width: "100%" },
});
