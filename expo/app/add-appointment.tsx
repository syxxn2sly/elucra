import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as Location from "expo-location";
import { router } from "expo-router";
import { CalendarDays, Check, ChevronDown, Clock3, LocateFixed, MapPin, X } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton, canGoBackSafe } from "@/components/ui";
import Colors from "@/constants/colors";
import { HIT_TARGET, Radius, Space, Type, Weight } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";

const C = Colors.light;
type PickerMode = "date" | "time" | null;

function defaultAppointmentDate(): Date {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return tomorrow;
}

function formatDate(value: Date): string {
  return value.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTime(value: Date): string {
  return value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeInput(value: Date): string {
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export default function AddAppointmentScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { addAppointment, appointments, familyDoctor } = useClairity();
  const initialAppointmentDate = useMemo(() => defaultAppointmentDate(), []);
  const [title, setTitle] = useState<string>("");
  const [appointmentDate, setAppointmentDate] = useState<Date>(initialAppointmentDate);
  const [dateInput, setDateInput] = useState<string>(() => formatDateInput(initialAppointmentDate));
  const [timeInput, setTimeInput] = useState<string>(() => formatTimeInput(initialAppointmentDate));
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [location, setLocation] = useState<string>("");
  const [locationStatus, setLocationStatus] = useState<string>("");
  const [isFindingLocation, setIsFindingLocation] = useState<boolean>(false);
  const [whatToBring, setWhatToBring] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string>("");

  const locationSuggestions = useMemo((): string[] => {
    const doctorLocation = [familyDoctor.clinicName, familyDoctor.address].filter(Boolean).join(" — ");
    const priorLocations = appointments.map((appointment) => appointment.location).filter(Boolean);
    return [doctorLocation, ...priorLocations].filter((value, index, values) => values.indexOf(value) === index).slice(0, 4);
  }, [appointments, familyDoctor.address, familyDoctor.clinicName]);

  const close = useCallback(() => {
    if (canGoBackSafe()) router.back();
    else router.replace("/(tabs)/appointments");
  }, []);

  const syncAppointmentDate = useCallback((nextDate: Date) => {
    setAppointmentDate(nextDate);
    setDateInput(formatDateInput(nextDate));
    setTimeInput(formatTimeInput(nextDate));
    setError("");
  }, []);

  const handlePickerChange = useCallback((event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setPickerMode(null);
    if (event.type === "dismissed" || !selected || !pickerMode) return;
    const current = new Date(appointmentDate);
    if (pickerMode === "date") current.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    else current.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    syncAppointmentDate(current);
  }, [appointmentDate, pickerMode, syncAppointmentDate]);

  const handleWebDateChange = useCallback((value: string) => {
    setDateInput(value);
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return;
    const next = new Date(appointmentDate);
    next.setFullYear(year, month - 1, day);
    syncAppointmentDate(next);
  }, [appointmentDate, syncAppointmentDate]);

  const handleWebTimeChange = useCallback((value: string) => {
    setTimeInput(value);
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return;
    const next = new Date(appointmentDate);
    next.setHours(hours, minutes, 0, 0);
    syncAppointmentDate(next);
  }, [appointmentDate, syncAppointmentDate]);

  const useCurrentLocation = useCallback(async () => {
    setIsFindingLocation(true);
    setLocationStatus("Finding your current location…");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setLocationStatus("Location access was not allowed. Choose a saved place or enter the clinic address.");
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const matches = await Location.reverseGeocodeAsync({ latitude: current.coords.latitude, longitude: current.coords.longitude });
      const place = matches[0];
      const formatted = place ? [place.name, place.street, place.city, place.region, place.postalCode].filter(Boolean).filter((part, index, parts) => parts.indexOf(part) === index).join(", ") : "";
      if (!formatted) {
        setLocationStatus("We could not identify an address. Choose a saved place or enter the clinic address.");
        return;
      }
      setLocation(formatted);
      setLocationStatus("Current location added. Please check that this is where your appointment takes place.");
    } catch {
      setLocationStatus("We could not find your location. Choose a saved place or enter the clinic address.");
    } finally {
      setIsFindingLocation(false);
    }
  }, []);

  const save = useCallback(async () => {
    if (!title.trim()) {
      setError("Tell us what this appointment is for.");
      return;
    }
    if (appointmentDate.getTime() <= Date.now()) {
      setError("Choose a future date and time for this appointment.");
      return;
    }
    await addAppointment({ title: title.trim(), dateTime: appointmentDate.toISOString(), location: location.trim(), whatToBring: whatToBring.trim(), notes: notes.trim(), documentId: null, sourceBlockIds: [] });
    close();
  }, [addAppointment, appointmentDate, close, location, notes, title, whatToBring]);

  return <View style={[styles.screen, { paddingTop: insets.top }]}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: scrollPadding }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}><Text style={styles.topBarLabel}>Appointment</Text><Pressable accessibilityRole="button" accessibilityLabel="Close add appointment" onPress={close} hitSlop={12} style={styles.closeButton}><X color={C.text} size={22} strokeWidth={2.7}/><Text style={styles.closeText}>Cancel</Text></Pressable></View>
        <View style={styles.hero}><View style={styles.heroIcon}><CalendarDays color={C.primary} size={25} strokeWidth={2.5}/></View><View><Text style={styles.title}>Add Appointment</Text><Text style={styles.subtitle}>We’ll remind you 24 hours beforehand.</Text></View></View>
        <TextField label="What is the appointment for?" value={title} onChangeText={setTitle} placeholder="e.g. Cardiology follow-up" />

        <Text style={styles.label}>When is it?</Text>
        {Platform.OS === "web" ? (
          <View style={styles.webDateTimeRow}>
            <View style={styles.webFieldWrap}>
              <Text style={styles.label}>Date</Text>
              <TextInput
                style={styles.webInput}
                value={dateInput}
                onChangeText={handleWebDateChange}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={C.textMuted}
                keyboardType="numeric"
                autoCapitalize="none"
              />
            </View>
            <View style={styles.webFieldWrap}>
              <Text style={styles.label}>Time</Text>
              <TextInput
                style={styles.webInput}
                value={timeInput}
                onChangeText={handleWebTimeChange}
                placeholder="HH:MM"
                placeholderTextColor={C.textMuted}
                keyboardType="numeric"
                autoCapitalize="none"
              />
            </View>
          </View>
        ) : (
          <View style={styles.pickerRow}>
            <PickerButton icon={<CalendarDays color={C.primary} size={20} strokeWidth={2.4}/>} label="Date" value={formatDate(appointmentDate)} onPress={() => setPickerMode("date")} />
            <PickerButton icon={<Clock3 color={C.primary} size={20} strokeWidth={2.4}/>} label="Time" value={formatTime(appointmentDate)} onPress={() => setPickerMode("time")} />
          </View>
        )}
        {pickerMode ? <View style={styles.pickerPanel}><DateTimePicker value={appointmentDate} mode={pickerMode} display={Platform.OS === "ios" ? "spinner" : "default"} minimumDate={pickerMode === "date" ? new Date() : undefined} minuteInterval={15} onChange={handlePickerChange} />{Platform.OS === "ios" ? <Pressable onPress={() => setPickerMode(null)} style={styles.donePickerButton}><Text style={styles.donePickerText}>Done</Text></Pressable> : null}</View> : null}

        <Text style={styles.label}>Where do you need to go? <Text style={styles.optional}>(optional)</Text></Text>
        <Text style={styles.helperText}>Choose a saved place, use your current location if your appointment is there, or enter a different clinic.</Text>
        {locationSuggestions.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionList}>{locationSuggestions.map((suggestion) => <Pressable key={suggestion} onPress={() => { setLocation(suggestion); setLocationStatus("Saved location added. Please check it before saving."); }} style={styles.locationChip}><MapPin color={C.primary} size={16} strokeWidth={2.5}/><Text style={styles.locationChipText} numberOfLines={1}>{suggestion}</Text></Pressable>)}</ScrollView> : null}
        <Pressable onPress={useCurrentLocation} disabled={isFindingLocation} style={[styles.currentLocationButton, isFindingLocation && styles.disabledButton]}><LocateFixed color={C.primary} size={19} strokeWidth={2.5}/><Text style={styles.currentLocationText}>{isFindingLocation ? "Finding your location…" : "Use my current location"}</Text></Pressable>
        <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="Clinic name or address" placeholderTextColor={C.textMuted} autoCapitalize="words" />
        {locationStatus ? <Text style={styles.locationStatus}>{locationStatus}</Text> : null}

        <TextField label="What should you bring?" value={whatToBring} onChangeText={setWhatToBring} placeholder="e.g. Health card and medication list" multiline />
        <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Anything else to remember" multiline />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton label="Save Appointment" onPress={save} disabled={!title.trim()} icon={<Check color={C.textInverse} size={21} strokeWidth={2.5}/>} style={styles.save}/>
      </ScrollView>
    </KeyboardAvoidingView>
  </View>;
}

function PickerButton({ icon, label, value, onPress }: { icon: React.ReactNode; label: string; value: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Choose appointment ${label.toLowerCase()}`} onPress={onPress} style={styles.pickerButton}><View style={styles.pickerIcon}>{icon}</View><View style={styles.pickerCopy}><Text style={styles.pickerLabel}>{label}</Text><Text style={styles.pickerValue}>{value}</Text></View><ChevronDown color={C.textMuted} size={18} strokeWidth={2.5}/></Pressable>;
}

function TextField({ label, value, onChangeText, placeholder, multiline }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput style={[styles.input, multiline && styles.multi]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.textMuted} multiline={multiline} autoCapitalize="sentences" /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  flex: { flex: 1 },
  content: { padding: Space.lg },
  topBar: {
    minHeight: HIT_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Space.md,
  },
  topBarLabel: { ...Type.label, color: C.textMuted },
  closeButton: {
    minHeight: HIT_TARGET,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    backgroundColor: C.surfaceAlt,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
  },
  closeText: { ...Type.label, color: C.text },
  hero: {
    flexDirection: "row",
    gap: Space.md,
    alignItems: "center",
    marginBottom: Space.xl,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...Type.display, color: C.text },
  subtitle: { marginTop: Space.xs, ...Type.body, color: C.textMuted },
  field: { marginTop: Space.lg },
  label: { ...Type.label, color: C.text, marginBottom: Space.sm },
  optional: { color: C.textMuted, fontWeight: Weight.regular },
  helperText: { ...Type.caption, color: C.textMuted, marginBottom: Space.md },
  input: {
    minHeight: 56,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    color: C.text,
    ...Type.body,
  },
  multi: { minHeight: 90, textAlignVertical: "top" },
  pickerRow: { flexDirection: "row", gap: Space.md },
  webDateTimeRow: {
    flexDirection: "row",
    gap: Space.md,
  },
  webFieldWrap: {
    flex: 1,
  },
  webInput: {
    minHeight: 56,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    color: C.text,
    ...Type.body,
  },
  pickerButton: {
    flex: 1,
    minHeight: 72,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.md,
    padding: Space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  pickerIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerCopy: { flex: 1 },
  pickerLabel: { ...Type.caption, fontWeight: Weight.semibold, color: C.textMuted },
  pickerValue: { ...Type.label, color: C.text, marginTop: Space.xs },
  pickerPanel: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.md,
    padding: Space.xs,
    marginTop: Space.md,
    alignItems: "center",
  },
  donePickerButton: {
    alignSelf: "stretch",
    minHeight: HIT_TARGET,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.primarySoft,
    borderRadius: Radius.md,
    margin: Space.sm,
  },
  donePickerText: { ...Type.body, fontWeight: Weight.bold, color: C.primary },
  suggestionList: { gap: Space.sm, paddingBottom: Space.md },
  locationChip: {
    maxWidth: 235,
    minHeight: 42,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.md,
    backgroundColor: C.primarySoft,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
  },
  locationChipText: { flexShrink: 1, ...Type.caption, fontWeight: Weight.semibold, color: C.primary },
  currentLocationButton: {
    minHeight: HIT_TARGET,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    alignSelf: "flex-start",
    backgroundColor: C.accentSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    marginBottom: Space.md,
  },
  disabledButton: { opacity: 0.6 },
  currentLocationText: { ...Type.caption, fontWeight: Weight.semibold, color: C.primary },
  locationStatus: { ...Type.caption, color: C.textMuted, marginTop: Space.sm },
  error: { color: C.danger, ...Type.caption, fontWeight: Weight.semibold, marginTop: Space.lg },
  save: { width: "100%", marginTop: Space.lg },
});
