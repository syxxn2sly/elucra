import { router } from "expo-router";
import { CalendarDays, Clock3, MapPin, PackageCheck, Plus, Trash2 } from "lucide-react-native";
import React, { useCallback, useMemo } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, EmptyState, PrimaryButton } from "@/components/ui";
import Colors from "@/constants/colors";
import { HIT_TARGET, Radius, Space, Type, Weight } from "@/constants/theme";
import { useTabScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import type { Appointment } from "@/lib/types";

const C = Colors.light;

function displayDate(dateTime: string): string {
  const date = new Date(dateTime);
  return Number.isNaN(date.getTime()) ? "Date needs review" : date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function AppointmentsScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useTabScrollPadding();
  const { appointments, removeAppointment } = useClairity();
  const upcoming = useMemo(() => appointments.filter((appointment) => new Date(appointment.dateTime).getTime() >= Date.now()).sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()), [appointments]);

  const remove = useCallback((appointment: Appointment) => {
    Alert.alert("Remove appointment?", `Remove “${appointment.title}” and its reminder?`, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => removeAppointment(appointment.id) }]);
  }, [removeAppointment]);

  return <View style={[styles.screen, { paddingTop: insets.top }]}>
    <View style={styles.header}>
      <View><Text style={styles.title}>Appointments</Text><Text style={styles.subtitle}>Your confirmed care calendar</Text></View>
      <Pressable onPress={() => router.push("/add-appointment")} style={styles.addButton}><Plus color={C.textInverse} size={24} strokeWidth={2.5} /></Pressable>
    </View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: scrollPadding }]} showsVerticalScrollIndicator={false}>
      <View style={styles.reminderNote}><Clock3 color={C.primary} size={19} strokeWidth={2.5} /><Text style={styles.reminderNoteText}>CLAIRITY sends a reminder 24 hours before each confirmed appointment.</Text></View>
      {upcoming.length === 0 ? <EmptyState icon={<CalendarDays color={C.primary} size={42} strokeWidth={2.3} />} title="No appointments yet" message="Add a visit, test, or follow-up so you know where to go and what to bring." actionLabel="Add an appointment" onAction={() => router.push("/add-appointment")} /> : <View style={styles.list}>{upcoming.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} onRemove={() => remove(appointment)} />)}</View>}
      {upcoming.length > 0 ? <PrimaryButton label="Add an appointment" onPress={() => router.push("/add-appointment")} icon={<Plus color={C.textInverse} size={21} strokeWidth={2.5} />} style={styles.addAnother} /> : null}
    </ScrollView>
  </View>;
}

function AppointmentCard({ appointment, onRemove }: { appointment: Appointment; onRemove: () => void }) {
  return <Card style={styles.card}><View style={styles.cardHeader}><View style={styles.calendarIcon}><CalendarDays color={C.primary} size={21} strokeWidth={2.5} /></View><View style={styles.cardHeaderText}><Text style={styles.appointmentTitle}>{appointment.title}</Text><Text style={styles.dateText}>{displayDate(appointment.dateTime)}</Text></View><Pressable onPress={onRemove} hitSlop={12} style={styles.delete}><Trash2 color={C.danger} size={19} strokeWidth={2.5} /></Pressable></View>
    {appointment.location ? <Detail icon={<MapPin color={C.textMuted} size={17} />} label="Where" value={appointment.location} /> : null}
    {appointment.whatToBring ? <Detail icon={<PackageCheck color={C.textMuted} size={17} />} label="Bring" value={appointment.whatToBring} /> : null}
    {appointment.notes ? <Text style={styles.notes}>{appointment.notes}</Text> : null}
    <View style={styles.reminderPill}><Clock3 color={C.success} size={15} strokeWidth={2.5} /><Text style={styles.reminderPillText}>{appointment.notificationId ? "Reminder scheduled" : "Reminder needs permission"}</Text></View>
  </Card>;
}
function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <View style={styles.detail}>{icon}<Text style={styles.detailText}><Text style={styles.detailLabel}>{label}: </Text>{value}</Text></View>; }
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  header: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { ...Type.display, color: C.text },
  subtitle: { ...Type.caption, color: C.textMuted, marginTop: Space.xs },
  addButton: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    borderRadius: Radius.md,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: Space.lg, flexGrow: 1 },
  reminderNote: {
    flexDirection: "row",
    gap: Space.md,
    backgroundColor: C.primarySoft,
    padding: Space.lg,
    borderRadius: Radius.md,
    marginBottom: Space.lg,
  },
  reminderNoteText: { flex: 1, ...Type.caption, color: C.text },
  list: { gap: Space.md },
  card: { gap: Space.md },
  cardHeader: { flexDirection: "row", gap: Space.md, alignItems: "center" },
  calendarIcon: {
    height: 48,
    width: 48,
    borderRadius: Radius.md,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderText: { flex: 1 },
  appointmentTitle: { ...Type.heading, color: C.text },
  dateText: {
    ...Type.caption,
    fontWeight: Weight.semibold,
    color: C.primary,
    marginTop: Space.xs,
  },
  delete: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  detail: { flexDirection: "row", gap: Space.sm, alignItems: "flex-start" },
  detailText: { flex: 1, ...Type.body, color: C.text },
  detailLabel: { fontWeight: Weight.bold },
  notes: { ...Type.caption, color: C.textMuted },
  reminderPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: Space.xs,
    alignItems: "center",
    backgroundColor: C.successSoft,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: Radius.pill,
  },
  reminderPillText: { ...Type.caption, fontWeight: Weight.bold, color: C.success },
  addAnother: { marginTop: Space.lg, width: "100%" },
});
