// CLAIRITY — Settings screen (edit profile, view app info)
import { router } from "expo-router";
import {
  User,
  Cake,
  VenusAndMars,
  HeartPulse,
  Scissors,
  Pill,
  AlertCircle,
  Users,
  Cigarette,
  Wine,
  Briefcase,
  Syringe,
  Check,
  Settings as SettingsIcon,
  Trash2,
  CreditCard,
  FileHeart,
  Stethoscope,
  Shield, Download , MapPin} from "lucide-react-native";
import React, { useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Share as RNShare,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Font, Radius, Space, Type } from "@/constants/theme";
import { PROVINCES } from "@/lib/screening-data";
import { useTabScrollPadding } from "@/lib/layout";
import { File, Paths } from "expo-file-system";
import { useClairity } from "@/lib/store";
import { confirmDestructive, notify } from "@/lib/utils";
import { PrimaryButton, Card, SectionHeader } from "@/components/ui";
import { ChipSelect, MultiChipInput, AgeWheel } from "@/components/smart-inputs";
import {
  COMMON_CONDITIONS,
  COMMON_MEDICATIONS,
  COMMON_ALLERGIES,
  COMMON_SURGERIES,
  COMMON_FAMILY_HISTORY,
  OCCUPATION_OPTIONS,
  SMOKING_OPTIONS,
  ALCOHOL_OPTIONS,
} from "@/lib/suggestion-data";
import type { HealthProfile } from "@/lib/types";

const C = Colors.light;

interface EditableField {
  key: keyof HealthProfile;
  label: string;
  icon: React.ReactNode;
  type: "text" | "ageWheel" | "chipSelect" | "multiChip";
  options?: string[];
  suggestions?: string[];
}

const FIELDS: EditableField[] = [
  { key: "name", label: "Name", icon: <User color={C.primary} size={18} strokeWidth={2.5} />, type: "text" },
  { key: "age", label: "Age", icon: <Cake color={C.primary} size={18} strokeWidth={2.5} />, type: "ageWheel" },
  { key: "gender", label: "Gender", icon: <VenusAndMars color={C.primary} size={18} strokeWidth={2.5} />, type: "chipSelect", options: ["Male", "Female", "Other", "Prefer not to say"] },
  { key: "province", label: "Province", icon: <MapPin color={C.primary} size={18} strokeWidth={2.5} />, type: "chipSelect", options: PROVINCES.map((entry) => entry.name) },
  { key: "conditions", label: "Medical Conditions", icon: <HeartPulse color={C.primary} size={18} strokeWidth={2.5} />, type: "multiChip", suggestions: COMMON_CONDITIONS },
  { key: "surgeries", label: "Past Surgeries", icon: <Scissors color={C.primary} size={18} strokeWidth={2.5} />, type: "multiChip", suggestions: COMMON_SURGERIES },
  { key: "medications", label: "Current Medications", icon: <Pill color={C.primary} size={18} strokeWidth={2.5} />, type: "multiChip", suggestions: COMMON_MEDICATIONS },
  { key: "allergies", label: "Allergies", icon: <AlertCircle color={C.primary} size={18} strokeWidth={2.5} />, type: "multiChip", suggestions: COMMON_ALLERGIES },
  { key: "familyHistory", label: "Family History", icon: <Users color={C.primary} size={18} strokeWidth={2.5} />, type: "multiChip", suggestions: COMMON_FAMILY_HISTORY },
  { key: "smokingStatus", label: "Smoking", icon: <Cigarette color={C.primary} size={18} strokeWidth={2.5} />, type: "chipSelect", options: SMOKING_OPTIONS },
  { key: "alcoholStatus", label: "Alcohol", icon: <Wine color={C.primary} size={18} strokeWidth={2.5} />, type: "chipSelect", options: ALCOHOL_OPTIONS },
  { key: "occupation", label: "Occupation", icon: <Briefcase color={C.primary} size={18} strokeWidth={2.5} />, type: "chipSelect", options: OCCUPATION_OPTIONS },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useTabScrollPadding();
  const { profile, updateProfile, resetProfile, documents, vaccines, medications, appointments, vitals, healthCard, familyDoctor } = useClairity();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState("");
  const [tempChipList, setTempChipList] = useState<string[]>([]);

  const profileArray = useMemo(() => {
    return Object.entries(profile).filter(([key]) => key !== "onboarded" && key !== "vaccineStatus");
  }, [profile]);

  const startEdit = useCallback((field: EditableField) => {
    const currentValue = (profile[field.key] as string) ?? "";
    setTempValue(currentValue);
    setTempChipList(currentValue ? currentValue.split(", ").filter(Boolean) : []);
    setEditingKey(field.key);
  }, [profile]);

  const saveEdit = useCallback(() => {
    if (editingKey) {
      updateProfile({ [editingKey]: tempValue } as Partial<HealthProfile>);
    }
    setEditingKey(null);
    setTempValue("");
    setTempChipList([]);
  }, [editingKey, tempValue, updateProfile]);

  const toggleTempChip = useCallback((item: string) => {
    setTempChipList((prev) => {
      const updated = prev.includes(item) ? prev.filter((c) => c !== item) : [...prev, item];
      setTempValue(updated.join(", "));
      return updated;
    });
  }, []);

  const addTempCustomChip = useCallback((item: string) => {
    setTempChipList((prev) => {
      if (prev.includes(item)) return prev;
      const updated = [...prev, item];
      setTempValue(updated.join(", "));
      return updated;
    });
  }, []);

  const [exporting, setExporting] = useState(false);

  /**
   * Write everything to a JSON file and hand it to the share sheet.
   *
   * A file rather than a wall of text in a message: this can run to megabytes
   * once documents are involved, and a file can be saved to Files, mailed to
   * yourself, or dropped in a drive — all of which are real backups, which the
   * app otherwise has none of.
   *
   * The health card is deliberately excluded. It lives in the OS keychain behind
   * biometrics, and copying it into a plaintext file the user then shares would
   * quietly undo the one genuine security boundary the app has.
   */
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        app: "CLAIRITY",
        formatVersion: 1,
        note: "Your health card is not included — it stays in this device's secure storage.",
        profile,
        familyDoctor,
        documents,
        vaccines,
        medications,
        appointments,
        vitals,
      };
      const json = JSON.stringify(payload, null, 2);
      const stamp = new Date().toISOString().slice(0, 10);
      const file = new File(Paths.cache, `clairity-export-${stamp}.json`);
      file.write(json);
      await RNShare.share({ url: file.uri, title: `CLAIRITY export ${stamp}` });
    } catch (error) {
      notify(
        "Could not export",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setExporting(false);
    }
  }, [profile, familyDoctor, documents, vaccines, medications, appointments, vitals]);

  const handleReset = useCallback(() => {
    confirmDestructive(
      "Reset all data?",
      "This will permanently delete your profile, documents, vaccines, medications, and health card. This cannot be undone.",
      "Delete Everything",
      () => {
            resetProfile();
            router.replace("/onboarding");
          },
    );
  }, [resetProfile]);

  const editingField = FIELDS.find((f) => f.key === editingKey);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: scrollPadding, flexGrow: 1 }}
      >
        {/* Header */}
        <View style={styles.titleWrap}>
          <View style={styles.titleIcon}>
            <SettingsIcon color={C.primary} size={24} strokeWidth={2.5} />
          </View>
          <Text style={styles.title}>Settings</Text>
        </View>
        <Text style={styles.subtitle}>
          Update your health profile anytime. Changes save automatically.
        </Text>

        {/* Profile summary card */}
        <Card style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.profileAvatar}>
              <User color={C.textInverse} size={28} strokeWidth={2.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{profile.name || "Your Name"}</Text>
              <Text style={styles.profileMeta}>
                {profile.age ? `${profile.age} years old` : "Age not set"}
                {profile.gender ? ` · ${profile.gender}` : ""}
              </Text>
            </View>
          </View>
          <View style={styles.profileStats}>
            <ProfileStat label="Reports" value={documents.length} icon={<FileHeart color={C.docConsultation} size={16} strokeWidth={2.5} />} />
            <ProfileStat label="Vaccines" value={vaccines.length} icon={<Syringe color={C.docVaccination} size={16} strokeWidth={2.5} />} />
            <ProfileStat label="Medications" value={medications.length} icon={<Pill color={C.docPrescription} size={16} strokeWidth={2.5} />} />
          </View>
        </Card>

        {/* Quick links */}
        <SectionHeader title="Quick Links" />
        <View style={styles.quickLinks}>
          <QuickLink
            icon={<CreditCard color={C.primary} size={20} strokeWidth={2.5} />}
            label="Health Card"
            sub={healthCard ? healthCard.cardNumber.slice(0, 4) + " •••• " + healthCard.cardNumber.slice(-4) : "Not set up"}
            // Once a card is saved this is the only way into the Face ID-locked
            // viewer — the Card tab that used to reach it is gone.
            onPress={() => router.push(healthCard ? "/healthcard" : "/health-card-setup")}
          />
          <QuickLink
            icon={<Shield color={C.accent} size={20} strokeWidth={2.5} />}
            label="Travel Vaccines"
            sub="Plan vaccines for trips"
            onPress={() => router.push("/travel")}
          />
          <QuickLink
            icon={<Stethoscope color={C.docOperative} size={20} strokeWidth={2.5} />}
            label="Family Doctor & Care Team"
            sub={familyDoctor?.doctorName || "Add your doctor and clinic details"}
            onPress={() => router.push("/identity")}
          />
        </View>

        {/* Profile fields */}
        <SectionHeader title="Health Profile" />
        <View style={styles.fieldsList}>
          {FIELDS.map((field) => {
            const isEditing = editingKey === field.key;
            const value = (profile[field.key] as string) ?? "";

            return (
              <View key={field.key}>
                <Pressable
                  onPress={() => (isEditing ? null : startEdit(field))}
                  style={({ pressed }) => [styles.fieldRow, pressed && styles.pressed]}
                >
                  <View style={styles.fieldIcon}>{field.icon}</View>
                  <View style={styles.fieldText}>
                    <Text style={styles.fieldLabel}>{field.label}</Text>
                    <Text style={styles.fieldValue} numberOfLines={2}>
                      {value || "Not set — tap to add"}
                    </Text>
                  </View>
                </Pressable>

                {isEditing && editingField ? (
                  <View style={styles.editPanel}>
                    {editingField.type === "text" ? (
                      <TextInput
                        style={styles.editInput}
                        value={tempValue}
                        onChangeText={setTempValue}
                        autoFocus
                        autoCapitalize="words"
                        placeholder="Type here…"
                        placeholderTextColor={C.textMuted}
                      />
                    ) : editingField.type === "ageWheel" ? (
                      <AgeWheel value={tempValue} onChange={setTempValue} />
                    ) : editingField.type === "chipSelect" && editingField.options ? (
                      <ChipSelect
                        options={editingField.options}
                        value={tempValue}
                        onSelect={setTempValue}
                      />
                    ) : editingField.type === "multiChip" && editingField.suggestions ? (
                      <MultiChipInput
                        key={editingField.key}
                        selectedItems={tempChipList}
                        onToggle={toggleTempChip}
                        onAddCustom={addTempCustomChip}
                        suggestions={editingField.suggestions}
                      />
                    ) : null}

                    <View style={styles.editActions}>
                      <Pressable
                        onPress={() => setEditingKey(null)}
                        style={styles.editCancelBtn}
                      >
                        <Text style={styles.editCancelText}>Cancel</Text>
                      </Pressable>
                      <Pressable onPress={saveEdit} style={styles.editSaveBtn}>
                        <Check color={C.textInverse} size={18} strokeWidth={2.5} />
                        <Text style={styles.editSaveText}>Save</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* Danger zone */}
        <SectionHeader title="Data" />

        {/*
          Before the destructive action, deliberately. Everything CLAIRITY holds
          lives on this phone and nowhere else — losing it loses the lot — so the
          way to keep a copy should be the first thing offered here, not a
          footnote under the button that deletes it.
        */}
        <Pressable
          onPress={handleExport}
          disabled={exporting}
          style={({ pressed }) => [styles.exportBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Export a copy of your data"
        >
          <Download color={C.primary} size={20} strokeWidth={2.5} />
          <View style={{ flex: 1 }}>
            <Text style={styles.exportText}>{exporting ? "Preparing…" : "Export my data"}</Text>
            <Text style={styles.exportSub}>
              A file with everything on this device — save it somewhere you trust
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={handleReset}
          style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
        >
          <Trash2 color={C.danger} size={20} strokeWidth={2.5} />
          <Text style={styles.dangerText}>Reset All Data</Text>
        </Pressable>

        <Text style={styles.disclaimer}>
          CLAIRITY keeps your records on this device and explains documents you already
          have. It does not diagnose, does not decide your treatment, and its explanations
          are generated by software that can be wrong — check anything that matters with
          your doctor, nurse or pharmacist.
        </Text>
      </ScrollView>
    </View>
  );
}

function ProfileStat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <View style={styles.profileStat}>
      {icon}
      <Text style={styles.profileStatValue}>{value}</Text>
      <Text style={styles.profileStatLabel}>{label}</Text>
    </View>
  );
}

function QuickLink({ icon, label, sub, onPress }: { icon: React.ReactNode; label: string; sub: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickLink, pressed && styles.pressed]}
    >
      <View style={styles.quickLinkIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.quickLinkLabel}>{label}</Text>
        <Text style={styles.quickLinkSub}>{sub}</Text>
      </View>
    </Pressable>
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
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    marginTop: Space.lg,
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
    marginBottom: Space.sm,
  },
  // Profile card
  profileCard: {
    marginTop: Space.lg,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    marginBottom: Space.lg,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    ...Type.title,
    color: C.text,
  },
  profileMeta: {
    ...Type.label,
    fontFamily: Font.bodyRegular,
    color: C.textMuted,
    marginTop: Space.xs,
  },
  profileStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: Space.lg,
  },
  profileStat: {
    alignItems: "center",
    gap: Space.xs,
  },
  profileStatValue: {
    ...Type.title,
    color: C.text,
  },
  profileStatLabel: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.textMuted,
  },
  // Quick links
  quickLinks: {
    gap: Space.md,
  },
  quickLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    padding: Space.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  quickLinkIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLinkLabel: {
    ...Type.heading,
    color: C.text,
  },
  quickLinkSub: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: Space.xs,
  },
  // Fields
  fieldsList: {
    gap: Space.md,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  fieldIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldText: {
    flex: 1,
  },
  fieldLabel: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.textMuted,
    marginBottom: Space.xs,
  },
  fieldValue: {
    ...Type.body,
    color: C.text,
  },
  // Edit panel
  editPanel: {
    backgroundColor: C.surfaceAlt,
    borderRadius: Radius.md,
    padding: Space.lg,
    marginTop: Space.xs,
    marginBottom: Space.xs,
  },
  editInput: {
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.lg,
    ...Type.body,
    color: C.text,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Space.md,
    marginTop: Space.md,
  },
  editCancelBtn: {
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    backgroundColor: C.surface,
  },
  editCancelText: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.textMuted,
  },
  editSaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    backgroundColor: C.primary,
  },
  editSaveText: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.textInverse,
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.md,
    paddingVertical: Space.lg,
    paddingHorizontal: Space.lg,
    marginBottom: Space.md,
  },
  exportText: { ...Type.label, color: C.text },
  exportSub: { ...Type.caption, color: C.textMuted, marginTop: 2 },
  // Danger zone
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    backgroundColor: C.dangerSoft,
    borderRadius: Radius.md,
    paddingVertical: Space.lg,
  },
  dangerText: {
    ...Type.heading,
    color: C.danger,
  },
  disclaimer: {
    ...Type.caption,
    color: C.textMuted,
    textAlign: "center",
    marginTop: Space.xl,
    paddingHorizontal: Space.md,
  },
});
