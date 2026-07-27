import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as Location from "expo-location";
import { router } from "expo-router";
import { CalendarDays, Check, ChevronDown, Clock3, LocateFixed, MapPin, X } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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
  const { addAppointment, appointments, familyDoctor, favouriteLocation, saveFavouriteLocation } = useClairity();
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
  const [editingFavourite, setEditingFavourite] = useState<boolean>(false);
  const [favouriteDraft, setFavouriteDraft] = useState<string>("");

  const locationSuggestions = useMemo((): string[] => {
    const doctorLocation = [familyDoctor.clinicName, familyDoctor.address].filter(Boolean).join(" — ");
    const priorLocations = appointments.map((appointment) => appointment.location);
    return [doctorLocation, ...priorLocations]
      // Without this the empty doctor placeholder became a chip with an icon and
      // no label — an unlabelled pin the user could tap to set nothing.
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value) => value !== favouriteLocation)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 4);
  }, [appointments, familyDoctor.address, familyDoctor.clinicName, favouriteLocation]);

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
        <Text style={styles.helperText}>Use your favourite place, your current location, or enter a different clinic.</Text>

        {/* Favourite and current location sit together — they are the two
            one-tap ways to fill the field, so they belong on the same row. */}
        <View style={styles.locationActionRow}>
          <Pressable
            onPress={() => {
              if (favouriteLocation) {
                setLocation(favouriteLocation);
                setLocationStatus("Favourite location added. Please check it before saving.");
              } else {
                setFavouriteDraft("");
                setEditingFavourite(true);
              }
            }}
            onLongPress={() => {
              setFavouriteDraft(favouriteLocation);
              setEditingFavourite(true);
            }}
            delayLongPress={350}
            style={styles.locationChip}
            accessibilityRole="button"
            accessibilityLabel={
              favouriteLocation
                ? `Favourite location, ${favouriteLocation}. Hold to edit.`
                : "Set a favourite location"
            }
            accessibilityHint="Press and hold to change your favourite location"
          >
            <MapPin color={C.primary} size={16} strokeWidth={2.5} />
            <Text style={styles.locationChipText} numberOfLines={1}>
              {favouriteLocation || "Set favourite location"}
            </Text>
          </Pressable>

          <Pressable
            onPress={useCurrentLocation}
            disabled={isFindingLocation}
            style={[styles.currentLocationButton, isFindingLocation && styles.disabledButton]}
            accessibilityRole="button"
          >
            <LocateFixed color={C.primary} size={19} strokeWidth={2.5} />
            <Text style={styles.currentLocationText} numberOfLines={1}>
              {isFindingLocation ? "Finding…" : "Use my location"}
            </Text>
          </Pressable>
        </View>

        {favouriteLocation ? (
          <Text style={styles.favouriteHint}>Hold the favourite to change it.</Text>
        ) : null}

        {/* Other places worth one tap: the family doctor's clinic and anywhere
            previous appointments were held. */}
        {locationSuggestions.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionList}>
            {locationSuggestions.map((suggestion) => (
              <Pressable
                key={suggestion}
                onPress={() => { setLocation(suggestion); setLocationStatus("Saved location added. Please check it before saving."); }}
                style={styles.locationChip}
              >
                <MapPin color={C.primary} size={16} strokeWidth={2.5} />
                <Text style={styles.locationChipText} numberOfLines={1}>{suggestion}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="Clinic name or address" placeholderTextColor={C.textMuted} autoCapitalize="words" />
        {locationStatus ? <Text style={styles.locationStatus}>{locationStatus}</Text> : null}

        <Modal visible={editingFavourite} transparent animationType="fade" onRequestClose={() => setEditingFavourite(false)}>
          <Pressable style={styles.favouriteOverlay} onPress={() => setEditingFavourite(false)}>
            <Pressable style={styles.favouriteSheet} onPress={(event) => event.stopPropagation()}>
              <Text style={styles.favouriteSheetTitle}>Favourite location</Text>
              <Text style={styles.favouriteSheetSub}>The place you go to most — offered first whenever you add an appointment.</Text>
              <TextInput
                style={styles.input}
                value={favouriteDraft}
                onChangeText={setFavouriteDraft}
                placeholder="e.g. Lakeshore Family Clinic"
                placeholderTextColor={C.textMuted}
                autoCapitalize="words"
                autoFocus
              />
              <View style={styles.favouriteSheetActions}>
                {favouriteLocation ? (
                  <Pressable
                    onPress={() => { saveFavouriteLocation(""); setEditingFavourite(false); }}
                    style={styles.favouriteRemove}
                  >
                    <Text style={styles.favouriteRemoveText}>Remove</Text>
                  </Pressable>
                ) : <View />}
                <Pressable
                  onPress={() => { saveFavouriteLocation(favouriteDraft); setEditingFavourite(false); }}
                  style={styles.favouriteSave}
                >
                  <Text style={styles.favouriteSaveText}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

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
  // Favourite and "use my location" share a row and split it evenly, so neither
  // reads as the primary choice.
  locationActionRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  favouriteHint: {
    ...Type.caption,
    color: C.textMuted,
    marginBottom: Space.md,
  },
  locationChip: {
    flex: 1,
    maxWidth: 235,
    minHeight: HIT_TARGET,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.md,
    backgroundColor: C.primarySoft,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
  },
  favouriteOverlay: {
    flex: 1,
    backgroundColor: C.scrim,
    justifyContent: "center",
    paddingHorizontal: Space.xl,
  },
  favouriteSheet: {
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    padding: Space.xl,
    gap: Space.sm,
  },
  favouriteSheetTitle: { ...Type.title, color: C.text },
  favouriteSheetSub: { ...Type.caption, color: C.textMuted, marginBottom: Space.xs },
  favouriteSheetActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Space.md,
  },
  favouriteRemove: {
    minHeight: HIT_TARGET,
    justifyContent: "center",
    paddingHorizontal: Space.sm,
  },
  favouriteRemoveText: { ...Type.label, color: C.danger },
  favouriteSave: {
    minHeight: HIT_TARGET,
    justifyContent: "center",
    paddingHorizontal: Space.xl,
    borderRadius: Radius.md,
    backgroundColor: C.primary,
  },
  favouriteSaveText: { ...Type.label, color: C.textInverse },
  locationChipText: { flexShrink: 1, ...Type.caption, fontWeight: Weight.semibold, color: C.primary },
  currentLocationButton: {
    flex: 1,
    minHeight: HIT_TARGET,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.md,
    backgroundColor: C.accentSoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
  },
  disabledButton: { opacity: 0.6 },
  currentLocationText: { ...Type.caption, fontWeight: Weight.semibold, color: C.primary },
  locationStatus: { ...Type.caption, color: C.textMuted, marginTop: Space.sm },
  error: { color: C.danger, ...Type.caption, fontWeight: Weight.semibold, marginTop: Space.lg },
  save: { width: "100%", marginTop: Space.lg },
});
