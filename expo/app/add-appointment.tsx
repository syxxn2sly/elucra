import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { CalendarDays, Check, ChevronDown, MapPin, Star, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton, canGoBackSafe } from "@/components/ui";
import Colors from "@/constants/colors";
import { Font, HIT_TARGET, Radius, Space, Type } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import { searchPlaces, MIN_QUERY_LENGTH } from "@/lib/geocode";
import { TimeWheel } from "@/components/smart-inputs";

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
  const { addAppointment, appointments, familyDoctor, favouriteLocations, addFavouriteLocation, removeFavouriteLocation } = useClairity();
  const initialAppointmentDate = useMemo(() => defaultAppointmentDate(), []);
  const [title, setTitle] = useState<string>("");
  const [appointmentDate, setAppointmentDate] = useState<Date>(initialAppointmentDate);
  const [dateInput, setDateInput] = useState<string>(() => formatDateInput(initialAppointmentDate));
  const [timeInput, setTimeInput] = useState<string>(() => formatTimeInput(initialAppointmentDate));
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [location, setLocation] = useState<string>("");
  const [placeMatches, setPlaceMatches] = useState<string[]>([]);
  const [showPlaces, setShowPlaces] = useState<boolean>(false);
  const [whatToBring, setWhatToBring] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string>("");

  const locationSuggestions = useMemo((): string[] => {
    const doctorLocation = [familyDoctor.clinicName, familyDoctor.address].filter(Boolean).join(" — ");
    const priorLocations = appointments.map((appointment) => appointment.location);
    return [doctorLocation, ...priorLocations]
      // Without this the empty doctor placeholder became a chip with an icon and
      // no label — an unlabelled pin the user could tap to set nothing.
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value) => !favouriteLocations.includes(value))
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 4);
  }, [appointments, familyDoctor.address, familyDoctor.clinicName, favouriteLocations]);

  const isFavourite = favouriteLocations.some(
    (place) => place.toLowerCase() === location.trim().toLowerCase(),
  );

  /**
   * What the dropdown offers, in the order it is useful: places you pinned,
   * then places you have been, then whatever the lookup found. Deduplicated,
   * and capped so the list never becomes the whole screen.
   */
  const dropdownPlaces = useMemo(() => {
    const seen = new Set<string>();
    const rows: { place: string; saved: boolean }[] = [];
    const push = (place: string, saved: boolean) => {
      const key = place.trim().toLowerCase();
      if (!place.trim() || seen.has(key)) return;
      seen.add(key);
      rows.push({ place, saved });
    };
    favouriteLocations.forEach((place) => push(place, true));
    locationSuggestions.forEach((place) => push(place, false));
    placeMatches.forEach((place) => push(place, false));
    return rows.slice(0, 6);
  }, [favouriteLocations, locationSuggestions, placeMatches]);

  /**
   * Look the typed place up as you go.
   *
   * Debounced, and the previous request is aborted when another keystroke
   * arrives — otherwise a slow response for "lake" can land after the one for
   * "lakeshore" and replace better results with worse. Skipped entirely once
   * the field matches a suggestion already taken, so choosing one does not
   * immediately search for what was chosen.
   */
  useEffect(() => {
    const query = location.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setPlaceMatches([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const matches = await searchPlaces(query, controller.signal);
      setPlaceMatches(matches.filter((match) => match.toLowerCase() !== query.toLowerCase()));
    }, 320);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [location]);

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
        <View style={styles.hero}><View style={styles.heroIcon}><CalendarDays color={C.primary} size={25} strokeWidth={2.5}/></View><View><Text style={styles.title}>Add Appointment</Text><Text style={styles.subtitle}>Reminder 24 hours before.</Text></View></View>
        <TextField label="What for?" value={title} onChangeText={setTitle} placeholder="e.g. Cardiology follow-up" />

        <Text style={styles.label}>When</Text>
        <View style={styles.whenRow}>
          <View style={styles.whenField}>
            {Platform.OS === "web" ? (
              <TextInput
                style={styles.webInput}
                value={dateInput}
                onChangeText={handleWebDateChange}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={C.textMuted}
                keyboardType="numeric"
                autoCapitalize="none"
              />
            ) : (
              <PickerButton
                icon={<CalendarDays color={C.primary} size={20} strokeWidth={2.4} />}
                label="Date"
                value={formatDate(appointmentDate)}
                onPress={() => setPickerMode("date")}
              />
            )}
          </View>
          {/* Time is a dial on every platform: the 24-hour text field asked
              people to convert from the clock they actually read. */}
          <View style={styles.whenField}>
            <TimeWheel value={appointmentDate} onChange={syncAppointmentDate} />
          </View>
        </View>
        {pickerMode === "date" ? (
          <View style={styles.pickerPanel}>
            <DateTimePicker
              value={appointmentDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              // The iOS spinner follows the system theme, so on a phone set to
              // dark mode it drew white text on this light sheet and the date
              // was invisible. The app is light-only for now, so pin it.
              themeVariant="light"
              minimumDate={new Date()}
              onChange={handlePickerChange}
            />
            {Platform.OS === "ios" ? (
              <Pressable onPress={() => setPickerMode(null)} style={styles.donePickerButton}>
                <Text style={styles.donePickerText}>Done</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.label}>Where <Text style={styles.optional}>(optional)</Text></Text>

        <View style={styles.locationInputRow}>
          <TextInput
            style={[styles.input, styles.locationInput]}
            value={location}
            onChangeText={setLocation}
            placeholder="Clinic name or address"
            placeholderTextColor={C.textMuted}
            autoCapitalize="words"
            onFocus={() => setShowPlaces(true)}
            // Delayed so a tap on a row below lands before the list closes.
            onBlur={() => setTimeout(() => setShowPlaces(false), 180)}
          />
          {location.trim() ? (
            <Pressable
              onPress={() => (isFavourite ? removeFavouriteLocation(location.trim()) : addFavouriteLocation(location))}
              hitSlop={10}
              style={styles.starButton}
              accessibilityRole="button"
              accessibilityLabel={isFavourite ? "Remove from favourites" : "Save as favourite"}
            >
              <Star
                color={C.primary}
                size={21}
                strokeWidth={2.5}
                fill={isFavourite ? C.primary : "transparent"}
              />
            </Pressable>
          ) : null}
        </View>

        {/*
          One list rather than a row of chips above the field: saved places,
          then anywhere you have been, then whatever the lookup finds. The chips
          crowded the screen and duplicated what this already shows.
        */}
        {(showPlaces || placeMatches.length > 0) && dropdownPlaces.length > 0 ? (
          <View style={styles.placeList}>
            {dropdownPlaces.map(({ place, saved }) => (
              <Pressable
                key={place}
                onPress={() => { setLocation(place); setShowPlaces(false); setPlaceMatches([]); }}
                onLongPress={saved ? () => removeFavouriteLocation(place) : undefined}
                delayLongPress={400}
                style={({ pressed }) => [styles.placeRow, pressed && styles.placePressed]}
                accessibilityRole="button"
                accessibilityLabel={saved ? `${place}. Saved place, hold to remove.` : place}
              >
                {saved ? (
                  <Star color={C.primary} size={16} strokeWidth={2.5} fill={C.primary} />
                ) : (
                  <MapPin color={C.textMuted} size={16} strokeWidth={2.5} />
                )}
                <Text style={styles.placeText} numberOfLines={2}>{place}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <TextField label="Bring" value={whatToBring} onChangeText={setWhatToBring} placeholder="e.g. Health card, medication list" multiline />
        <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
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
  optional: { color: C.textMuted, fontFamily: Font.bodyRegular },
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
  pickerLabel: { ...Type.caption, fontFamily: Font.bodySemi, color: C.textMuted },
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
  donePickerText: { ...Type.body, fontFamily: Font.headBold, color: C.primary },
  // Favourite and "use my location" share a row and split it evenly, so neither
  // reads as the primary choice.
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
  locationChipText: { flexShrink: 1, ...Type.caption, fontFamily: Font.bodySemi, color: C.primary },
  whenRow: { flexDirection: "row", gap: Space.md, marginBottom: Space.md },
  whenField: { flex: 1 },
  locationInputRow: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  locationInput: { flex: 1, marginBottom: 0 },
  starButton: { width: HIT_TARGET, height: HIT_TARGET, alignItems: "center", justifyContent: "center" },
  placeList: { marginTop: Space.sm, borderRadius: Radius.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  placeRow: { flexDirection: "row", alignItems: "center", gap: Space.sm, paddingVertical: Space.md, paddingHorizontal: Space.md },
  placePressed: { backgroundColor: C.surfaceAlt },
  placeText: { ...Type.body, color: C.text, flex: 1 },
  error: { color: C.danger, ...Type.caption, fontFamily: Font.bodySemi, marginTop: Space.lg },
  save: { width: "100%", marginTop: Space.lg },
});
