// travel health: worldwide destination directory + CDC guidance
import { useQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Plus,
  Search,
  ShieldAlert,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/ui";
import Colors from "@/constants/colors";
import { useStackScrollPadding } from "@/lib/layout";
import { Font, HIT_TARGET, Radius, Space, Type } from "@/constants/theme";
import { useClairity } from "@/lib/store";
import {
  cdcDestinationUrl,
  fetchTravelDestinations,
  localTravelVaccines,
  type TravelDestinationOption,
} from "@/lib/travel-destinations";

const C = Colors.light;

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function TravelScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { vaccines, addTravelVaccine } = useClairity();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: destinations = [], isLoading } = useQuery({
    queryKey: ["travel-destinations"],
    queryFn: fetchTravelDestinations,
    staleTime: 7 * 24 * 60 * 60 * 1000,
  });

  const matches = useMemo(() => {
    const value = search.trim().toLocaleLowerCase();
    if (!value) return destinations.slice(0, 12);
    return destinations
      .filter((destination) => destination.country.toLocaleLowerCase().includes(value))
      .slice(0, 30);
  }, [destinations, search]);

  // The detail panel opens inline, directly beneath the row that was tapped,
  // so the guidance for a destination is always adjacent to its name. Tapping
  // the open row again closes it.
  const toggle = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((current) => (current === id ? null : id));
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Travel Health" fallbackRoute="/(tabs)/vaccines" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: scrollPadding }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Choose a destination to see the current CDC vaccine guidance for that
          country.
        </Text>

        <View style={styles.searchWrap}>
          <Search color={C.textMuted} size={20} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search any country or territory"
            placeholderTextColor={C.textMuted}
            style={styles.searchInput}
            autoCorrect={false}
          />
        </View>

        <Text style={styles.sectionLabel}>
          {search ? "Matching destinations" : "Popular destinations"}
        </Text>

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={C.primary} />
            <Text style={styles.loadingText}>Loading destinations…</Text>
          </View>
        ) : matches.length === 0 ? (
          <View style={styles.noMatch}>
            <Text style={styles.noMatchTitle}>No matching destination</Text>
            <Text style={styles.noMatchText}>Try the full country name.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {matches.map((destination) => (
              <DestinationRow
                key={destination.id}
                destination={destination}
                expanded={expandedId === destination.id}
                onToggle={() => toggle(destination.id)}
                trackedIds={vaccines.map((record) => record.vaccineId)}
                onTrack={(vaccineId) =>
                  addTravelVaccine(vaccineId, destination.country)
                }
              />
            ))}
          </View>
        )}

        {!isLoading && !expandedId && matches.length > 0 ? (
          <View style={styles.hint}>
            <ShieldAlert color={C.warning} size={20} />
            <Text style={styles.hintText}>
              Tap a destination to see its official guidance.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function DestinationRow({
  destination,
  expanded,
  onToggle,
  trackedIds,
  onTrack,
}: {
  destination: TravelDestinationOption;
  expanded: boolean;
  onToggle: () => void;
  trackedIds: string[];
  onTrack: (vaccineId: string) => void;
}) {
  const localVaccines = expanded ? localTravelVaccines(destination) : [];

  const openCDC = useCallback(async () => {
    await WebBrowser.openBrowserAsync(cdcDestinationUrl(destination));
  }, [destination]);

  return (
    <View style={[styles.rowGroup, expanded && styles.rowGroupExpanded]}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={destination.country}
      >
        <Text style={[styles.rowName, expanded && styles.rowNameExpanded]}>
          {destination.country}
        </Text>
        <ChevronDown
          color={expanded ? C.primary : C.textMuted}
          size={20}
          style={expanded ? styles.chevronOpen : undefined}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.detail}>
          <Text style={styles.detailText}>
            Travel vaccine needs change over time and depend on your trip, health
            history, and any stops along the way.
          </Text>

          <Pressable
            onPress={openCDC}
            style={({ pressed }) => [styles.cdcButton, pressed && styles.pressed]}
            accessibilityRole="link"
          >
            <ExternalLink color={C.textInverse} size={18} />
            <Text style={styles.cdcButtonText}>See CDC guidance</Text>
          </Pressable>

          <View style={styles.sourceNote}>
            <ShieldAlert color={C.warning} size={18} />
            <Text style={styles.sourceNoteText}>
              CDC is the clinical source. Review its page with a travel clinic
              before getting vaccines.
            </Text>
          </View>

          {localVaccines.length > 0 ? (
            <View style={styles.localSection}>
              <Text style={styles.localTitle}>Suggested checklist</Text>
              {localVaccines.map((vaccine) => {
                const tracked = trackedIds.includes(vaccine.id);
                return (
                  <View key={vaccine.id} style={styles.vaccineRow}>
                    <View style={styles.vaccineInfo}>
                      <Text style={styles.vaccineName}>{vaccine.name}</Text>
                      <Text style={styles.vaccineProtects}>
                        {vaccine.protectsAgainst}
                      </Text>
                    </View>
                    {tracked ? (
                      <View style={styles.tracked}>
                        <CheckCircle2 color={C.success} size={18} />
                        <Text style={styles.trackedText}>Tracked</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => onTrack(vaccine.id)}
                        style={({ pressed }) => [
                          styles.trackButton,
                          pressed && styles.pressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Track ${vaccine.name}`}
                      >
                        <Plus color={C.primary} size={16} />
                        <Text style={styles.trackText}>Track</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.xxxl,
  },
  intro: {
    ...Type.body,
    color: C.textMuted,
    marginTop: Space.xs,
    marginBottom: Space.lg,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    minHeight: HIT_TARGET,
    paddingHorizontal: Space.lg,
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchInput: {
    flex: 1,
    ...Type.body,
    color: C.text,
    paddingVertical: Space.md,
  },
  sectionLabel: {
    ...Type.label,
    color: C.textMuted,
    marginTop: Space.xl,
    marginBottom: Space.sm,
  },
  loading: {
    padding: Space.xl,
    alignItems: "center",
    gap: Space.md,
  },
  loadingText: {
    ...Type.caption,
    color: C.textMuted,
  },
  noMatch: {
    paddingVertical: Space.xxl,
    alignItems: "center",
  },
  noMatchTitle: {
    ...Type.heading,
    color: C.text,
  },
  noMatchText: {
    ...Type.body,
    color: C.textMuted,
    marginTop: Space.xs,
  },
  list: {
    gap: Space.sm,
  },
  rowGroup: {
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  rowGroupExpanded: {
    borderColor: C.primary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    minHeight: HIT_TARGET,
    paddingHorizontal: Space.lg,
  },
  rowPressed: {
    backgroundColor: C.surfaceAlt,
  },
  flag: {
    fontSize: 22,
  },
  rowName: {
    flex: 1,
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.text,
  },
  rowNameExpanded: {
    color: C.primary,
  },
  chevronOpen: {
    transform: [{ rotate: "180deg" }],
  },
  detail: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.lg,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: Space.lg,
  },
  detailText: {
    ...Type.caption,
    color: C.textMuted,
  },
  cdcButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    minHeight: HIT_TARGET,
    borderRadius: Radius.md,
    backgroundColor: C.primary,
    marginTop: Space.md,
    paddingHorizontal: Space.md,
  },
  cdcButtonText: {
    ...Type.label,
    color: C.textInverse,
  },
  pressed: {
    opacity: 0.76,
  },
  sourceNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Space.sm,
    marginTop: Space.md,
    padding: Space.md,
    borderRadius: Radius.sm,
    backgroundColor: C.warningSoft,
  },
  sourceNoteText: {
    flex: 1,
    ...Type.caption,
    color: C.text,
  },
  localSection: {
    marginTop: Space.xl,
  },
  localTitle: {
    ...Type.label,
    color: C.text,
    marginBottom: Space.sm,
  },
  vaccineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  vaccineInfo: {
    flex: 1,
  },
  vaccineName: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.text,
  },
  vaccineProtects: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: 2,
  },
  tracked: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
  },
  trackedText: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.success,
  },
  trackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    backgroundColor: C.primarySoft,
    borderRadius: Radius.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  trackText: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.primary,
  },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    marginTop: Space.xl,
  },
  hintText: {
    ...Type.caption,
    color: C.textMuted,
  },
});
