// CLAIRITY — Vaccines tab
import { router } from "expo-router";
import {
  Shield,
  Search,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Plus,
} from "lucide-react-native";
import React, { useState, useMemo, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Font, HIT_TARGET, Radius, Space, Type } from "@/constants/theme";
import { useTabScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import { VACCINE_CATALOG } from "@/lib/vaccine-data";
import { formatDueCountdown, formatMonthYear, sortByDueDate } from "@/lib/utils";
import { Card, Tag, SectionHeader, EmptyState } from "@/components/ui";
import type { VaccineInfo, VaccineRecord } from "@/lib/types";

const C = Colors.light;

type Tab = "suggested" | "popular" | "other" | "tracked";

export default function VaccinesScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useTabScrollPadding();
  const { vaccines, addVaccine } = useClairity();
  const [tab, setTab] = useState<Tab>("suggested");
  const [search, setSearch] = useState("");

  // Group tracked vaccines
  const trackedVaccines = vaccines;
  const datedVaccines = sortByDueDate(vaccines.filter((v) => v.hasDate));
  const undatedVaccines = vaccines.filter((v) => !v.hasDate);

  // Catalog filtered by tab and search
  const filteredCatalog = useMemo(() => {
    let list: VaccineInfo[];
    if (tab === "tracked") return [];
    list = VACCINE_CATALOG.filter((v) => v.category === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = VACCINE_CATALOG.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.protectsAgainst.toLowerCase().includes(q) ||
          v.description.toLowerCase().includes(q),
      );
    }
    // Remove already tracked
    return list.filter((v) => !vaccines.some((rec) => rec.vaccineId === v.id));
  }, [tab, search, vaccines]);

  const handleTrack = useCallback(
    (info: VaccineInfo) => {
      addVaccine(info.id, null, null, false);
    },
    [addVaccine],
  );

  const isTracked = (vaccineId: string) => vaccines.some((v) => v.vaccineId === vaccineId);

  // --- Tracked view ---
  const renderTracked = () => {
    if (trackedVaccines.length === 0) {
      return (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <EmptyState
            icon={<Shield color={C.primary} size={40} strokeWidth={2.5} />}
            title="No vaccines tracked yet"
            message="Browse the categories below to start tracking your vaccines and get reminders."
          />
        </View>
      );
    }
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: scrollPadding, gap: 12, paddingTop: 4 }}
      >
        {datedVaccines.map((vac) => {
          const info = VACCINE_CATALOG.find((v) => v.id === vac.vaccineId);
          const countdown = formatDueCountdown(vac.nextDueDate);
          const isOverdue = countdown === "Overdue";
          return (
            <Card
              key={vac.id}
              onPress={() => router.push({ pathname: "/vaccine-detail", params: { id: vac.id } })}
            >
              <View style={styles.vacRow}>
                <View style={styles.vacLeft}>
                  <View
                    style={[
                      styles.vacIcon,
                      { backgroundColor: isOverdue ? C.dangerSoft : C.primarySoft },
                    ]}
                  >
                    <Shield color={isOverdue ? C.danger : C.docVaccination} size={22} strokeWidth={2.5} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vacName} numberOfLines={2}>{vac.name}</Text>
                    <Text style={styles.vacDate}>Received: {formatMonthYear(vac.monthReceived, vac.yearReceived)}</Text>
                    {(() => {
                      // Only for courses: "1 of 1" on a flu shot is noise.
                      const info = VACCINE_CATALOG.find((entry) => entry.id === vac.vaccineId);
                      if (!info || info.doseCount <= 1) return null;
                      const given = vac.doses.length;
                      const done = given >= info.doseCount;
                      return (
                        <Text style={[styles.doseProgress, done && styles.doseProgressDone]}>
                          {done ? `All ${info.doseCount} doses recorded` : `Dose ${given} of ${info.doseCount}, ${info.doseCount - given} to go`}
                        </Text>
                      );
                    })()}
                    {vac.verified ? (
                      <View style={styles.verifiedRow}>
                        <CheckCircle2 color={C.success} size={14} strokeWidth={2.5} />
                        <Text style={styles.verifiedText}>Verified</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                {vac.nextDueDate ? (
                  <Tag
                    text={countdown}
                    color={isOverdue ? C.danger : C.accent}
                    bg={isOverdue ? C.dangerSoft : C.accentSoft}
                  />
                ) : null}
              </View>
            </Card>
          );
        })}

        {/* Undated vaccines */}
        {undatedVaccines.length > 0 ? (
          <View style={styles.undatedBlock}>
            <View style={styles.undatedHeaderWrap}>
              <AlertCircle color={C.accent} size={18} strokeWidth={2.5} />
              <Text style={styles.undatedHeader}>Recorded without a date</Text>
            </View>
            <Text style={styles.undatedHint}>Add a date to get reminders for when they're due again.</Text>
            {undatedVaccines.map((vac) => (
              <Card
                key={vac.id}
                onPress={() => router.push({ pathname: "/vaccine-detail", params: { id: vac.id } })}
                style={styles.undatedCard}
              >
                <View style={styles.vacRow}>
                  <View style={styles.vacLeft}>
                    <View style={[styles.vacIcon, { backgroundColor: C.accentSoft }]}>
                      <Calendar color={C.accent} size={22} strokeWidth={2.5} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.vacName} numberOfLines={2}>{vac.name}</Text>
                      <Text style={styles.vacDate}>Date not recorded</Text>
                    </View>
                  </View>
                  <View style={styles.tagWrap}>
                    <Tag text="ADD DATE" color={C.accent} bg={C.accentSoft} />
                  </View>
                </View>
              </Card>
            ))}
          </View>
        ) : null}
      </ScrollView>
    );
  };

  // --- Catalog view ---
  const renderCatalog = () => (
    <View style={{ paddingHorizontal: 20, flex: 1 }}>
      {/* Search */}
      <View style={styles.searchWrap}>
        <Search color={C.textMuted} size={20} strokeWidth={2.5} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search all vaccines…"
          placeholderTextColor={C.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Category tabs */}
      {!search.trim() ? (
        <View style={styles.categoryTabs}>
          <CategoryTab label="Suggested" active={tab === "suggested"} onPress={() => setTab("suggested")} />
          <CategoryTab label="Popular" active={tab === "popular"} onPress={() => setTab("popular")} />
          <CategoryTab label="Other" active={tab === "other"} onPress={() => setTab("other")} />
        </View>
      ) : null}

      {/* Vaccine list */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: scrollPadding, gap: 12, paddingTop: 12 }}
      >
        {filteredCatalog.length === 0 ? (
          <EmptyState
            title="No vaccines found"
            message="Try a different search term."
          />
        ) : (
          filteredCatalog.map((info) => (
            <VaccineCatalogCard
              key={info.id}
              info={info}
              tracked={isTracked(info.id)}
              onTrack={() => handleTrack(info)}
              onView={() => {
                const rec = vaccines.find((v) => v.vaccineId === info.id);
                if (rec) {
                  router.push({ pathname: "/vaccine-detail", params: { id: rec.id } });
                }
              }}
            />
          ))
        )}
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Vaccines</Text>
        <Pressable
          onPress={() => router.push("/travel")}
          style={({ pressed }) => [styles.travelBtn, pressed && styles.pressed]}
        >
          <Shield color={C.primary} size={20} strokeWidth={2.5} />
          <Text style={styles.travelBtnText}>Travel</Text>
        </Pressable>
      </View>

      {/* Main tabs: My Vaccines vs Browse */}
      <View style={styles.mainTabs}>
        <MainTab label={`My Vaccines${trackedVaccines.length > 0 ? ` (${trackedVaccines.length})` : ""}`} active={tab === "tracked"} onPress={() => setTab("tracked")} />
        <MainTab label="Browse All" active={tab !== "tracked"} onPress={() => setTab("suggested")} />
      </View>

      {tab === "tracked" ? renderTracked() : renderCatalog()}
    </View>
  );
}

function VaccineCatalogCard({
  info,
  tracked,
  onTrack,
  onView,
}: {
  info: VaccineInfo;
  tracked: boolean;
  onTrack: () => void;
  onView: () => void;
}) {
  return (
    <Card style={styles.catalogCard}>
      <View style={styles.catalogHeader}>
        <View style={styles.catalogIcon}>
          <Shield color={C.docVaccination} size={22} strokeWidth={2.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.catalogName}>{info.name}</Text>
          <Text style={styles.catalogProtects}>Protects against: {info.protectsAgainst}</Text>
        </View>
      </View>
      <Text style={styles.catalogDesc}>{info.description}</Text>
      {info.cadenceMonths ? (
        <View style={styles.cadenceRow}>
          <Calendar color={C.primary} size={16} strokeWidth={2.5} />
          <Text style={styles.catalogCadence}>
            {info.cadenceMonths === 12 ? "Yearly" : `Every ${info.cadenceMonths} months`}
          </Text>
        </View>
      ) : null}
      {tracked ? (
        <View style={styles.trackedBadge}>
          <CheckCircle2 color={C.success} size={18} strokeWidth={2.5} />
          <Text style={styles.trackedText}>Tracked. Tap My Vaccines to manage.</Text>
        </View>
      ) : (
        <Pressable
          onPress={onTrack}
          style={({ pressed }) => [styles.trackBtn, pressed && styles.pressed]}
        >
          <Plus color={C.primary} size={20} strokeWidth={2.5} />
          <Text style={styles.trackBtnText}>Track this vaccine</Text>
        </Pressable>
      )}
    </Card>
  );
}

function CategoryTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.catTab, active && styles.catTabActive]}
    >
      <Text style={[styles.catTabText, active && styles.catTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MainTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.mainTab, active && styles.mainTabActive, pressed && styles.pressed]}
    >
      <Text style={[styles.mainTabText, active && styles.mainTabTextActive]}>{label}</Text>
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
  travelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    backgroundColor: C.primarySoft,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.pill,
  },
  travelBtnText: {
    ...Type.label,
    color: C.primary,
  },
  mainTabs: {
    flexDirection: "row",
    paddingHorizontal: Space.lg,
    gap: Space.sm,
    marginBottom: Space.md,
  },
  mainTab: {
    flex: 1,
    paddingVertical: Space.md,
    alignItems: "center",
    borderRadius: Radius.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  mainTabActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  mainTabText: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.textMuted,
  },
  mainTabTextActive: {
    color: C.textInverse,
  },
  // Search
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: Space.lg,
    marginBottom: Space.xs,
  },
  searchIcon: {
    marginRight: Space.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Space.md,
    ...Type.body,
    color: C.text,
  },
  // Category tabs
  categoryTabs: {
    flexDirection: "row",
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  catTab: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.pill,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  catTabActive: {
    backgroundColor: C.primarySoft,
    borderColor: C.primary,
  },
  catTabText: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.textMuted,
  },
  catTabTextActive: {
    color: C.primary,
  },
  // Vaccine rows
  vacRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space.md,
  },
  vacLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    flex: 1,
  },
  vacIcon: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  vacName: {
    ...Type.heading,
    color: C.text,
  },
  // The tag must not be squeezed by a long vaccine name, and must not be run
  // under by one either — several catalogue names are long enough to do both.
  tagWrap: {
    flexShrink: 0,
  },
  doseProgress: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.accent,
    marginTop: Space.xs,
  },
  doseProgressDone: {
    color: C.success,
  },
  vacDate: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: Space.xs,
  },
  verifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    marginTop: Space.xs,
  },
  verifiedText: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.success,
  },
  // Undated
  undatedBlock: {
    marginTop: Space.xl,
    gap: Space.xs,
  },
  undatedHeaderWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    marginBottom: Space.xs,
  },
  undatedHeader: {
    ...Type.heading,
    color: C.text,
  },
  undatedHint: {
    ...Type.caption,
    color: C.textMuted,
    marginBottom: Space.md,
  },
  undatedCard: {
    marginTop: Space.sm,
  },
  // Catalog
  catalogCard: {
    gap: Space.md,
  },
  catalogHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
  },
  catalogIcon: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  catalogName: {
    ...Type.heading,
    color: C.text,
  },
  catalogProtects: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: Space.xs,
  },
  catalogDesc: {
    ...Type.body,
    color: C.text,
  },
  cadenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    backgroundColor: C.primarySoft,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.pill,
    alignSelf: "flex-start",
  },
  catalogCadence: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.primary,
  },
  trackBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    backgroundColor: C.primarySoft,
    paddingVertical: Space.md,
    borderRadius: Radius.md,
    marginTop: Space.xs,
    minHeight: HIT_TARGET,
  },
  trackBtnText: {
    ...Type.label,
    color: C.primary,
  },
  trackedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    marginTop: Space.xs,
  },
  trackedText: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.success,
  },
});
