// CLAIRITY — Medications tab
import { router } from "expo-router";
import { Pill, Plus, Trash2, Clock, FileText } from "lucide-react-native";
import React, { useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Font, HIT_TARGET, Radius, Space, Type } from "@/constants/theme";
import { useTabScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import { Card, EmptyState, PrimaryButton } from "@/components/ui";
import type { Medication } from "@/lib/types";

const C = Colors.light;

export default function MedicationsScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useTabScrollPadding();
  const { medications, removeMedication, profile } = useClairity();

  const handleRemove = useCallback(
    (med: Medication) => {
      Alert.alert(
        "Remove medication?",
        `Remove ${med.name} from your list?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => removeMedication(med.id),
          },
        ],
      );
    },
    [removeMedication],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Medications</Text>
        <Pressable
          onPress={() => router.push("/add-medication")}
          style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
        >
          <Plus color={C.textInverse} size={22} strokeWidth={2.5} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: scrollPadding, flexGrow: 1 }}
      >
        {/* Profile meds note */}
        {profile.medications && !medications.length ? (
          <View style={styles.profileNote}>
            <FileText color={C.textMuted} size={18} strokeWidth={2.5} />
            <Text style={styles.profileNoteText}>
              From your profile: {profile.medications}
            </Text>
          </View>
        ) : null}

        {medications.length === 0 ? (
          <View style={{ flex: 1, justifyContent: "center" }}>
            <EmptyState
              icon={<Pill color={C.primary} size={40} strokeWidth={2.5} />}
              title="No medications yet"
              message="Add the medications you take so you have a complete list for doctor visits and emergencies."
              actionLabel="Add a medication"
              onAction={() => router.push("/add-medication")}
            />
          </View>
        ) : (
          <View style={styles.list}>
            {medications.map((med) => (
              <Card key={med.id} style={styles.medCard}>
                <View style={styles.medHeader}>
                  <View style={styles.medIcon}>
                    <Pill color={C.docPrescription} size={20} strokeWidth={2.5} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.medName}>{med.name}</Text>
                    {med.dose ? <Text style={styles.medDose}>{med.dose}</Text> : null}
                  </View>
                  <Pressable
                    onPress={() => handleRemove(med)}
                    hitSlop={12}
                    style={styles.deleteBtn}
                  >
                    <Trash2 color={C.danger} size={20} strokeWidth={2.5} />
                  </Pressable>
                </View>
                {med.reminderEnabled ? (
                  <View style={styles.reminderRow}>
                    <Clock color={C.success} size={16} strokeWidth={2.5} />
                    <Text style={styles.reminderText}>{med.notificationId ? `Daily reminder · ${med.reminderTime}` : "Reminder needs notification permission"}</Text>
                  </View>
                ) : null}
                {med.frequency ? (
                  <View style={styles.freqRow}>
                    <Clock color={C.textMuted} size={16} strokeWidth={2.5} />
                    <Text style={styles.freqText}>{med.frequency}</Text>
                  </View>
                ) : null}
                {med.notes ? <Text style={styles.medNotes}>{med.notes}</Text> : null}
              </Card>
            ))}

            <PrimaryButton
              label="Add another medication"
              onPress={() => router.push("/add-medication")}
              icon={<Plus color={C.textInverse} size={22} strokeWidth={2.5} />}
              style={{ marginTop: 20 }}
            />
          </View>
        )}
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
    opacity: 0.78,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.lg,
    paddingVertical: Space.lg,
  },
  headerTitle: {
    ...Type.display,
    color: C.text,
  },
  addBtn: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    borderRadius: Radius.md,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  profileNote: {
    flexDirection: "row",
    gap: Space.md,
    backgroundColor: C.surfaceAlt,
    borderRadius: Radius.md,
    padding: Space.lg,
    marginBottom: Space.lg,
  },
  profileNoteText: {
    flex: 1,
    ...Type.body,
    color: C.textMuted,
  },
  list: {
    gap: Space.md,
  },
  medCard: {
    gap: Space.md,
  },
  medHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
  },
  medIcon: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    backgroundColor: C.successSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  medName: {
    ...Type.heading,
    color: C.text,
  },
  medDose: {
    ...Type.body,
    color: C.textMuted,
    marginTop: Space.xs,
  },
  deleteBtn: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    backgroundColor: C.successSoft,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.pill,
    alignSelf: "flex-start",
  },
  reminderText: { ...Type.caption, fontFamily: Font.bodySemi, color: C.success },
  freqRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    backgroundColor: C.surfaceAlt,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.pill,
    alignSelf: "flex-start",
  },
  freqText: {
    ...Type.label,
    color: C.text,
  },
  medNotes: {
    ...Type.caption,
    color: C.textMuted,
    fontStyle: "italic",
  },
});
