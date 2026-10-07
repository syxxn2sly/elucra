// every simplified report, newest first
import { router } from "expo-router";
import { FileText, Plus, Trash2 } from "lucide-react-native";
import React, { useCallback, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type Palette } from "@/constants/colors";
import { useTheme } from "@/lib/theme";
import { HIT_TARGET, Radius, Space, Type } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import { confirmDestructive, formatDateDisplay } from "@/lib/utils";
import { Card, EmptyState, PrimaryButton, ScreenHeader, Tag } from "@/components/ui";
import type { SavedDocument } from "@/lib/types";


export default function ReportsScreen() {
  const { C, styles } = useTheme(makeStyles);
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { documents, removeDocument } = useClairity();

  // Newest first. Documents are appended as they are analysed, so the stored
  // order is oldest-first and reading it straight would bury today's report.
  const ordered = useMemo(
    () => [...documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [documents],
  );

  const confirmRemove = useCallback(
    (doc: SavedDocument) => {
      confirmDestructive(
        "Delete this report?",
        `"${doc.result.title}" will be permanently removed from your library.`,
        "Delete",
        () => removeDocument(doc.id),
      );
    },
    [removeDocument],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Reports" fallbackRoute="/(tabs)" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: scrollPadding, flexGrow: 1 }}
      >
        {ordered.length === 0 ? (
          <View style={{ flex: 1, justifyContent: "center" }}>
            <EmptyState
              icon={<FileText color={C.primary} size={40} strokeWidth={2.5} />}
              title="No reports yet"
              message="Photograph a lab result, prescription or discharge letter and ELUCRA will explain it in plain English."
              actionLabel="Understand a document"
              onAction={() => router.push("/simplify")}
            />
          </View>
        ) : (
          <>
            <Text style={styles.count}>
              {ordered.length} {ordered.length === 1 ? "report" : "reports"}
            </Text>

            {/*
              The card is NOT pressable and the two targets are siblings. A
              Pressable inside a Pressable loses: the outer one claims the touch
              responder on native, so a delete nested in a tappable card never
              fires. Same trap as the age dial.
            */}
            {ordered.map((doc) => (
              <Card key={doc.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Pressable
                    style={styles.cardBody}
                    onPress={() => router.push({ pathname: "/document-detail", params: { id: doc.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${doc.result.title}`}
                  >
                    <Text style={styles.cardTitle} numberOfLines={2}>{doc.result.title}</Text>
                    <Text style={styles.cardDate}>{formatDateDisplay(doc.createdAt)}</Text>
                    <Text style={styles.cardSummary} numberOfLines={2}>{doc.result.summary}</Text>
                    <View style={styles.cardTags}>
                      <Tag
                        text={doc.result.documentType.replace(/_/g, " ")}
                        color={C.primary}
                        bg={C.primarySoft}
                      />
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => confirmRemove(doc)}
                    hitSlop={10}
                    style={styles.deleteBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${doc.result.title}`}
                  >
                    <Trash2 color={C.danger} size={19} strokeWidth={2.5} />
                  </Pressable>
                </View>
              </Card>
            ))}

            <PrimaryButton
              label="Understand another document"
              onPress={() => router.push("/simplify")}
              icon={<Plus color={C.textInverse} size={22} strokeWidth={2.5} />}
              style={{ marginTop: Space.xl }}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  count: { ...Type.caption, color: C.textMuted, marginBottom: Space.md },
  card: { marginBottom: Space.md },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: Space.sm },
  cardBody: { flex: 1 },
  cardTitle: { ...Type.heading, color: C.text, flex: 1 },
  deleteBtn: { width: HIT_TARGET, height: HIT_TARGET, alignItems: "center", justifyContent: "center", marginTop: -Space.sm, marginRight: -Space.sm },
  cardDate: { ...Type.caption, color: C.textMuted, marginTop: Space.xs },
  cardSummary: { ...Type.body, color: C.textMuted, marginTop: Space.sm },
  cardTags: { flexDirection: "row", gap: Space.sm, marginTop: Space.md },
});
