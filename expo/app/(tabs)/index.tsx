// CLAIRITY — Home / Health Snapshot dashboard
import { router } from "expo-router";
import {
  FileHeart,
  ScanLine,
  Shield,
  Pill,
  CreditCard,
  AlertCircle,
  Calendar,
  ArrowRight,
  FileText,
  Sparkles,
  Stethoscope,
  Activity,
  ShieldCheck,
} from "lucide-react-native";
import React, { useCallback, useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Font, Radius, Space, Type } from "@/constants/theme";
import { PROVINCES, SCREENINGS, ruleFor, isConditionLinked, screeningAppliesToConditions } from "@/lib/screening-data";
import { useTabScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import {
  formatDateDisplay,
  formatDueCountdown,
  incompleteMedications,
  sortByDueDate,
} from "@/lib/utils";
import { PrimaryButton, Card, SectionHeader, Tag, EmptyState } from "@/components/ui";

const C = Colors.light;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useTabScrollPadding();
  const {
    profile,
    documents,
    vaccines,
    medications,
    vitals,
    healthCard,
    loaded,
  } = useClairity();

  const upcomingVaccines = sortByDueDate(
    vaccines.filter((v) => v.nextDueDate && v.hasDate),
  ).slice(0, 3);

  /*
    How many programmes cover this age, which is not the same as how many are
    due. ELUCRA has no record of past screening, so the tile counts coverage
    and the screen says so in words.
  */
  /*
    Population screenings in the person's age band, plus condition-linked ones
    whose trigger actually matches the profile. Counting every condition-linked
    entry unconditionally was the bug here: they all carry startAge 0, so a
    profile with no conditions recorded still showed diabetes and blood
    pressure follow-up as "covered".
  */
  const screeningCount = useMemo(() => {
    const age = Number.parseInt(profile.age, 10);
    if (!Number.isFinite(age)) return null;
    const code = PROVINCES.find((entry) => entry.name === profile.province)?.code ?? null;
    return SCREENINGS.filter((screening) => {
      if (isConditionLinked(screening)) {
        return screeningAppliesToConditions(screening, profile.conditions);
      }
      const rule = ruleFor(screening, code);
      return age >= rule.startAge && (rule.stopAge === null || age <= rule.stopAge);
    }).length;
  }, [profile.age, profile.province, profile.conditions]);

  const undatedVaccines = vaccines.filter((v) => !v.hasDate);

  // Newest first: documents are appended as they are analysed, so reading the
  // stored order straight showed the three oldest under "Recent Reports".
  const recentDocs = useMemo(
    () => [...documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3),
    [documents],
  );

  // Onboarding now creates a record for everything the user listed, so "needs
  // details" no longer means "not recorded yet" — every name is recorded. What
  // is missing is the dose and schedule, which is what makes a record usable.
  const pendingMedications = incompleteMedications(medications);

  const handleSimplify = useCallback(() => {
    router.push("/simplify");
  }, []);

  if (loaded && !profile.onboarded) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.welcomeHero}>
            <View style={styles.welcomeIconWrap}>
              <FileHeart color={C.textInverse} size={44} strokeWidth={2.5} />
            </View>
            <Text style={styles.welcomeTitle}>Welcome to ELUCRA</Text>
            <Text style={styles.welcomeMessage}>
              Your medical documents, made clear. Let's set up your health profile to get
              personalized help understanding reports, tracking vaccines, and managing your care.
            </Text>
            <PrimaryButton
              label="Get Started"
              onPress={() => router.push("/onboarding")}
              style={{ marginTop: 28, width: "100%" }}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={!loaded} tintColor={C.primary} />}
        contentContainerStyle={{ paddingBottom: scrollPadding }}
      >
        {/* Hero — Simplify a new document */}
        <View style={styles.hero}>
          <Text style={styles.greeting}>
            {profile.name ? `Hello, ${profile.name.split(" ")[0]}` : "Hello there"}
          </Text>
          <Text style={styles.heroSubtitle}>What would you like to understand today?</Text>
          <Pressable
            onPress={handleSimplify}
            style={({ pressed }) => [styles.heroCard, pressed && styles.pressed]}
          >
            <View style={styles.heroCardLeft}>
              <View style={styles.heroIconWrap}>
                <ScanLine color={C.textInverse} size={28} strokeWidth={2.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroCardTitle}>Understand a document</Text>
                <Text style={styles.heroCardSub}>
                  Scan or upload a report and get plain English in seconds
                </Text>
              </View>
              <ArrowRight color={C.textInverse} size={24} />
            </View>
          </Pressable>

          {/*
            The other half of the loop. Simplify is what you do with a document
            after a visit; this is what you take into the next one.
          */}
          <Pressable
            onPress={() => router.push("/visit-summary")}
            style={({ pressed }) => [styles.visitCard, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Build a summary to show your doctor"
          >
            <View style={styles.visitIconWrap}>
              <Stethoscope color={C.primary} size={26} strokeWidth={2.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.visitCardTitle}>Summary for your doctor</Text>
              <Text style={styles.visitCardSub}>Medications, recent results and questions, ready to show</Text>
            </View>
            <ArrowRight color={C.primary} size={24} />
          </Pressable>
        </View>

        {/* Quick Snapshot Cards */}
        <SectionHeader title="Health Snapshot" />
        <View style={styles.snapshotGrid}>
          <QuickCard
            icon={<Pill color={C.primary} size={22} strokeWidth={2.5} />}
            label="Medications"
            value={medications.length.toString()}
            sub={
              pendingMedications.length > 0
                ? `${pendingMedications.length} ${pendingMedications.length === 1 ? "needs" : "need"} details`
                : medications.length === 1
                  ? "medication"
                  : "medications"
            }
            // Medications listed during onboarding are only a profile note until
            // they get a dose and schedule. Without this the card just reads "0"
            // and it looks like the app dropped what they entered.
            actionNeeded={pendingMedications.length > 0}
            onPress={() => router.navigate("/(tabs)/medications")}
          />
          <QuickCard
            icon={<Shield color={C.docVaccination} size={22} strokeWidth={2.5} />}
            label="Vaccines"
            value={vaccines.length.toString()}
            sub={undatedVaccines.length > 0 ? `${undatedVaccines.length} need dates` : "tracked"}
            onPress={() => router.navigate("/(tabs)/vaccines")}
          />
          <QuickCard
            icon={<FileText color={C.docImaging} size={22} strokeWidth={2.5} />}
            label="Reports"
            value={documents.length.toString()}
            sub={documents.length === 1 ? "document" : "documents"}
            onPress={() => router.push("/reports")}
          />
          <QuickCard
            icon={<Activity color={C.docBloodWork} size={22} strokeWidth={2.5} />}
            label="Vitals"
            value={vitals.length.toString()}
            sub={vitals.length === 1 ? "reading" : "readings"}
            onPress={() => router.push("/vitals")}
          />
          <QuickCard
            icon={<ShieldCheck color={C.docPathology} size={22} strokeWidth={2.5} />}
            label="Screening"
            value={screeningCount === null ? "–" : screeningCount.toString()}
            sub={screeningCount === null ? "set your age" : "for your age"}
            onPress={() => router.push("/preventive-care")}
          />
          <QuickCard
            icon={<CreditCard color={C.accent} size={22} strokeWidth={2.5} />}
            label="Health Card"
            value={healthCard ? "Saved" : "None"}
            sub={healthCard ? healthCard.issuer : "Add your card"}
            onPress={() => router.push(healthCard ? "/healthcard" : "/health-card-setup")}
          />
        </View>

        {/* Allergies alert */}
        {profile.allergies ? (
          <View style={styles.alertRow}>
            <View style={styles.alertIconWrap}>
              <AlertCircle color={C.danger} size={20} strokeWidth={2.5} />
            </View>
            <Text style={styles.alertText}>
              <Text style={styles.alertLabel}>Allergies: </Text>
              {profile.allergies}
            </Text>
          </View>
        ) : null}

        {/* Upcoming vaccine reminders */}
        {upcomingVaccines.length > 0 ? (
          <>
            <SectionHeader
              title="Coming Up"
              action="See all"
              onAction={() => router.navigate("/(tabs)/vaccines")}
            />
            <View style={styles.section}>
              {upcomingVaccines.map((vac) => {
                const countdown = formatDueCountdown(vac.nextDueDate);
                const isOverdue = countdown === "Overdue";
                return (
                  <Card key={vac.id} style={styles.reminderCard} onPress={() => router.push({ pathname: "/vaccine-detail", params: { id: vac.id } })}>
                    <View style={styles.reminderLeft}>
                      <View
                        style={[
                          styles.reminderIcon,
                          { backgroundColor: isOverdue ? C.dangerSoft : C.accentSoft },
                        ]}
                      >
                        <Calendar color={isOverdue ? C.danger : C.accent} size={20} strokeWidth={2.5} />
                      </View>
                      <View>
                        <Text style={styles.reminderTitle}>{vac.name}</Text>
                        <Text style={styles.reminderSub}>{countdown}</Text>
                      </View>
                    </View>
                    <Tag
                      text={isOverdue ? "OVERDUE" : "DUE"}
                      color={isOverdue ? C.danger : C.accent}
                      bg={isOverdue ? C.dangerSoft : C.accentSoft}
                    />
                  </Card>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Undated vaccines nudge */}
        {undatedVaccines.length > 0 ? (
          <View style={styles.nudgeCard}>
            <View style={styles.nudgeIconWrap}>
              <Calendar color={C.accent} size={20} strokeWidth={2.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nudgeTitle}>Add dates to {undatedVaccines.length} vaccine{undatedVaccines.length > 1 ? "s" : ""}</Text>
              <Text style={styles.nudgeText}>
                You've recorded these but don't have a date. Add a date to get reminders.
              </Text>
              <Pressable
                onPress={() => router.navigate("/(tabs)/vaccines")}
                hitSlop={8}
                style={{ marginTop: 8 }}
              >
                <Text style={styles.nudgeLink}>Review vaccines →</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Recent reports */}
        {recentDocs.length > 0 ? (
          <>
            <SectionHeader title="Recent Reports" action="See all" onAction={() => router.push("/reports")} />
            <View style={styles.section}>
              {recentDocs.map((doc) => (
                <Card
                  key={doc.id}
                  onPress={() =>
                    router.push({ pathname: "/document-detail", params: { id: doc.id } })
                  }
                  style={styles.docCard}
                >
                  <View style={styles.docCardTop}>
                    <Text style={styles.docCardTitle}>{doc.result.title}</Text>
                    <Text style={styles.docCardDate}>{formatDateDisplay(doc.createdAt)}</Text>
                  </View>
                  <Text style={styles.docCardSummary} numberOfLines={2}>
                    {doc.result.summary}
                  </Text>
                  <View style={styles.docCardTags}>
                    <Tag
                      text={doc.result.documentType.replace(/_/g, " ")}
                      color={C.primary}
                      bg={C.primarySoft}
                    />
                    {doc.result.checklist.length > 0 ? (
                      <Tag
                        text={`${doc.result.checklist.filter((i) => i.done).length}/${doc.result.checklist.length} done`}
                        bg={C.surfaceAlt}
                      />
                    ) : null}
                  </View>
                </Card>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.section}>
            <EmptyState
              icon={<FileHeart color={C.primary} size={40} strokeWidth={2.5} />}
              title="No reports yet"
              message="Understand your first document to see it here."
              actionLabel="Understand a document"
              onAction={handleSimplify}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function QuickCard({
  icon,
  label,
  value,
  sub,
  actionNeeded,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  /** Draws the caution treatment — something on this card is waiting on the user. */
  actionNeeded?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={
        actionNeeded ? `${label}, ${value}. Action needed: ${sub}` : `${label}, ${value}, ${sub}`
      }
    >
      <View style={styles.quickCardIcon}>{icon}</View>
      <Text style={styles.quickCardValue}>{value}</Text>
      <Text style={styles.quickCardLabel}>{label}</Text>
      <Text style={[styles.quickCardSub, actionNeeded && styles.quickCardSubAction]}>{sub}</Text>
      {actionNeeded ? (
        <View style={styles.actionPill}>
          <Text style={styles.actionPillText}>Action needed</Text>
        </View>
      ) : null}
    </Pressable>
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
  // Welcome (pre-onboarding)
  welcomeHero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Space.xl,
    paddingVertical: Space.xxxl,
  },
  welcomeIconWrap: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.xl,
  },
  welcomeTitle: {
    ...Type.display,
    color: C.text,
    marginBottom: Space.md,
    textAlign: "center",
  },
  welcomeMessage: {
    ...Type.body,
    color: C.textMuted,
    textAlign: "center",
  },
  // Hero
  hero: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.lg,
  },
  greeting: {
    ...Type.display,
    color: C.text,
  },
  heroSubtitle: {
    ...Type.body,
    color: C.textMuted,
    marginTop: Space.xs,
    marginBottom: Space.lg,
  },
  heroCard: {
    backgroundColor: C.primary,
    borderRadius: Radius.md,
    padding: Space.lg,
  },
  heroCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: C.onDarkFill,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCardTitle: {
    ...Type.title,
    color: C.textInverse,
  },
  heroCardSub: {
    ...Type.caption,
    color: C.onDarkMuted,
    marginTop: Space.xs,
  },
  // Snapshot grid
  /*
    The second half of the loop, and it was disappearing: on `surface` with a
    hairline border it read as a list row under the solid hero, so the thing you
    take *into* a visit looked like a settings entry.

    It is lifted with fill and weight rather than a hue. The palette reserves
    colour for clinical meaning, so tinting this for emphasis would spend a
    signal the status system needs. Filled `primarySoft` with the same icon-chip
    treatment as the hero makes the two read as a pair of actions, with the solid
    one still clearly first.
  */
  visitCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    backgroundColor: C.primarySoft,
    borderWidth: 1,
    borderColor: C.borderStrong,
    borderRadius: Radius.md,
    paddingVertical: Space.lg,
    paddingHorizontal: Space.lg,
    marginTop: Space.md,
  },
  visitIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  visitCardTitle: { ...Type.title, color: C.text },
  visitCardSub: { ...Type.caption, color: C.textMuted, marginTop: Space.xs },
  snapshotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Space.lg,
    gap: Space.md,
  },
  quickCard: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    padding: Space.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  quickCardIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.md,
  },
  quickCardValue: {
    ...Type.display,
    color: C.text,
  },
  quickCardLabel: {
    ...Type.label,
    color: C.text,
    marginTop: Space.xs,
  },
  quickCardSub: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: Space.xs,
  },
  quickCardSubAction: {
    color: C.warning,
  },
  // Colour on a snapshot card means something is waiting on the user — this is
  // the only place a QuickCard is tinted, so it reads at a glance.
  actionPill: {
    alignSelf: "flex-start",
    marginTop: Space.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: C.warningSoft,
  },
  actionPillText: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.warning,
  },
  // Alert
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    marginHorizontal: Space.lg,
    marginTop: Space.lg,
    backgroundColor: C.dangerSoft,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
  alertIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: C.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  alertText: {
    flex: 1,
    ...Type.body,
    color: C.text,
  },
  alertLabel: {
    fontFamily: Font.headBold,
    color: C.danger,
  },
  // Sections
  section: {
    paddingHorizontal: Space.lg,
    gap: Space.md,
  },
  // Reminders
  reminderCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reminderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    flex: 1,
  },
  reminderIcon: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  reminderTitle: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.text,
  },
  reminderSub: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: Space.xs,
  },
  // Nudge
  nudgeCard: {
    marginHorizontal: Space.lg,
    marginTop: Space.lg,
    backgroundColor: C.accentSoft,
    borderRadius: Radius.md,
    padding: Space.lg,
    flexDirection: "row",
    gap: Space.md,
  },
  nudgeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  nudgeTitle: {
    ...Type.heading,
    color: C.text,
  },
  nudgeText: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: Space.xs,
  },
  nudgeLink: {
    ...Type.label,
    color: C.accent,
  },
  // Doc cards
  docCard: {
    gap: Space.sm,
  },
  docCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Space.md,
  },
  docCardTitle: {
    flex: 1,
    ...Type.heading,
    color: C.text,
  },
  docCardDate: {
    ...Type.caption,
    color: C.textMuted,
  },
  docCardSummary: {
    ...Type.body,
    color: C.textMuted,
  },
  docCardTags: {
    flexDirection: "row",
    gap: Space.sm,
    marginTop: Space.xs,
  },
});
