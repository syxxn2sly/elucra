/**
 * CLAIRITY — a text field that looks up real places as you type.
 *
 * Anywhere the app asks for a clinic, lab or hospital, it should offer the same
 * help rather than leaving the user to type an address from memory. This is the
 * plain version: field, suggestions, and an opt-in control to rank them near
 * you. The appointment screen keeps its own copy because it also folds saved
 * favourites into the same list.
 */

import * as Location from "expo-location";
import { Crosshair, MapPin, Star } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import Colors from "@/constants/colors";
import { HIT_TARGET, Radius, Space, Type } from "@/constants/theme";
import { useClairity } from "@/lib/store";
import { searchPlaces, MIN_QUERY_LENGTH, type Coords, type PlaceResult } from "@/lib/geocode";

const C = Colors.light;

export function PlaceField({
  label,
  value,
  onChangeText,
  onPickPlace,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /**
   * Called instead of onChangeText when a result is chosen from the list, so a
   * screen with separate name and address fields can fill both. Without it the
   * whole one-line label lands in this field and the address field stays empty.
   */
  onPickPlace?: (place: PlaceResult) => void;
  placeholder: string;
}) {
  const { favouriteLocations, addFavouriteLocation, removeFavouriteLocation } = useClairity();
  const [matches, setMatches] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [near, setNear] = useState<Coords | null>(null);
  const [nearState, setNearState] = useState<"idle" | "finding" | "denied">("idle");

  useEffect(() => {
    const query = value.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setMatches([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const found = await searchPlaces(query, controller.signal, near);
      setMatches(found.filter((match) => match.label.toLowerCase() !== query.toLowerCase()));
    }, 320);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, near]);

  /** Coordinates rank results only — never written into the field or stored. */
  const useNearMe = useCallback(async () => {
    setNearState("finding");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setNearState("denied");
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      setNear({ latitude: current.coords.latitude, longitude: current.coords.longitude });
      setNearState("idle");
    } catch {
      setNearState("denied");
    }
  }, []);

  const isFavourite = favouriteLocations.some(
    (place) => place.toLowerCase() === value.trim().toLowerCase(),
  );

  // Saved places first, then whatever the lookup found, deduplicated by label.
  const rows = (() => {
    const seen = new Set<string>();
    const out: { place: PlaceResult; saved: boolean }[] = [];
    const push = (place: PlaceResult, saved: boolean) => {
      const key = place.label.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ place, saved });
    };
    favouriteLocations.forEach((label) => push({ label, name: label, address: "" }, true));
    matches.forEach((place) => push(place, false));
    return out.slice(0, 6);
  })();

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          autoCapitalize="words"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
        />
        {value.trim() ? (
          <Pressable
            onPress={() => (isFavourite ? removeFavouriteLocation(value.trim()) : addFavouriteLocation(value))}
            hitSlop={10}
            style={styles.nearBtn}
            accessibilityRole="button"
            accessibilityLabel={isFavourite ? "Remove from saved places" : "Save this place"}
          >
            <Star color={C.primary} size={20} strokeWidth={2.5} fill={isFavourite ? C.primary : "transparent"} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={useNearMe}
          disabled={nearState === "finding"}
          hitSlop={10}
          style={styles.nearBtn}
          accessibilityRole="button"
          accessibilityLabel={near ? "Showing places near you" : "Show places near me"}
        >
          <Crosshair color={near ? C.primary : C.textMuted} size={20} strokeWidth={2.5} />
        </Pressable>
      </View>

      {nearState === "finding" ? (
        <Text style={styles.note}>Finding your area…</Text>
      ) : nearState === "denied" ? (
        <Text style={styles.note}>Location off — results are not narrowed to your area.</Text>
      ) : near ? (
        <Text style={styles.note}>Showing places near you first.</Text>
      ) : null}

      {(open || matches.length > 0) && rows.length > 0 ? (
        <View style={styles.list}>
          {rows.map(({ place, saved }) => (
            <Pressable
              key={place.label}
              onPress={() => {
                if (onPickPlace) onPickPlace(place);
                else onChangeText(place.label);
                setMatches([]);
                setOpen(false);
              }}
              onLongPress={saved ? () => removeFavouriteLocation(place.label) : undefined}
              delayLongPress={400}
              style={({ pressed }) => [styles.listRow, pressed && styles.listPressed]}
              accessibilityRole="button"
              accessibilityLabel={saved ? `${place.label}. Saved place, hold to remove.` : place.label}
            >
              {saved ? (
                <Star color={C.primary} size={16} strokeWidth={2.5} fill={C.primary} />
              ) : (
                <MapPin color={C.textMuted} size={16} strokeWidth={2.5} />
              )}
              <Text style={styles.listText} numberOfLines={2}>{place.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: Space.lg },
  fieldLabel: { ...Type.label, color: C.text, marginBottom: Space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  input: {
    flex: 1,
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
  nearBtn: { width: HIT_TARGET, height: HIT_TARGET, alignItems: "center", justifyContent: "center" },
  note: { ...Type.caption, color: C.textMuted, marginTop: Space.xs },
  list: {
    marginTop: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
  },
  listPressed: { backgroundColor: C.surfaceAlt },
  listText: { ...Type.body, color: C.text, flex: 1 },
});
