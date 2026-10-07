/**
 * form inputs with suggestions.
 * AutocompleteInput, ChipSelect, MultiChipInput, AgeWheel.
 * Reduces user error with tap-to-select suggestions and pickers.
 */

import * as Haptics from "expo-haptics";
import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Platform,
  ScrollView,
  FlatList,
  Modal,
} from "react-native";
import { ChevronDown, Check, X, Plus } from "lucide-react-native";

import { type Palette } from "@/constants/colors";
import { useTheme } from "@/lib/theme";
import { NONE_ANSWER, isNoneAnswer } from "@/lib/utils";
import { Elevation, Font, HIT_TARGET, Radius, Space, Type } from "@/constants/theme";


/**
 * Age wheel geometry. The highlight band sits one item-height tall, centred in
 * a container two items taller on each side — so the padding, the band offset
 * and the snap interval all derive from this one number. Item `i` is centred
 * under the band exactly when scrollY === ITEM_HEIGHT * i.
 */
const ITEM_HEIGHT = 56;
const WHEEL_VISIBLE_ROWS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * WHEEL_VISIBLE_ROWS;
const WHEEL_PADDING = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2;
const MIN_AGE = 1;
const MAX_AGE = 120;


export function AutocompleteInput({
  value,
  onChangeText,
  suggestions,
  placeholder,
  multiline,
  label,
  required,
}: {
  value: string;
  onChangeText: (text: string) => void;
  suggestions: string[];
  placeholder?: string;
  multiline?: boolean;
  label?: string;
  required?: boolean;
}) {
  const { C, styles } = useTheme(makeStyles);
  const [focused, setFocused] = useState(false);

  const filtered = useMemo(() => {
    if (!value.trim()) return [];
    const q = value.toLowerCase().trim();
    return suggestions
      .filter((s) => s.toLowerCase().includes(q))
      .filter((s) => !value.toLowerCase().includes(s.toLowerCase()))
      .slice(0, 6);
  }, [value, suggestions]);

  const showSuggestions = focused && filtered.length > 0;

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}
      <View style={styles.inputWrap}>
        <TextInput
          style={[styles.input, multiline && styles.inputMultiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          multiline={multiline}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          autoCapitalize="words"
          autoCorrect={false}
        />
      </View>
      {showSuggestions ? (
        <ScrollView style={styles.suggestionList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {filtered.map((suggestion) => (
            <Pressable
              key={suggestion}
              onPress={() => {
                onChangeText(
                  value.trim().endsWith(",")
                    ? value + " " + suggestion
                    : value.trim()
                      ? value + ", " + suggestion
                      : suggestion
                );
                setFocused(false);
              }}
              style={({ pressed }) => [styles.suggestionItem, pressed && styles.suggestionPressed]}
            >
              <Plus color={C.primary} size={16} strokeWidth={2.5} />
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

/** pick one. */
export function ChipSelect({
  options,
  value,
  onSelect,
  label,
  required,
}: {
  options: string[];
  value: string;
  onSelect: (val: string) => void;
  label?: string;
  required?: boolean;
}) {
  const { styles } = useTheme(makeStyles);
  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const selected = value === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => onSelect(opt)}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && styles.chipPressed,
              ]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** pick several. */
export function MultiChipInput({
  selectedItems,
  onToggle,
  onAddCustom,
  suggestions,
  placeholder,
  label,
  required,
  maxItems,
  allowNone,
}: {
  selectedItems: string[];
  onToggle: (item: string) => void;
  onAddCustom?: (item: string) => void;
  suggestions: string[];
  placeholder?: string;
  label?: string;
  required?: boolean;
  /** max selections. unlimited when omitted. */
  maxItems?: number;
  /**
   * Offer "None" as an answer. Without it, having nothing to report and not
   * having answered yet look identical — both are an empty list.
   *
   * Mutual exclusion is the caller's job: it owns the list.
   */
  allowNone?: boolean;
}) {
  const { C, styles } = useTheme(makeStyles);
  /*
    At the cap, unselected options stop responding but stay visible and
    deselecting still works — hiding them would make it look like the list had
    changed, and disabling everything would strip out the way back.
  */
  const noneSelected = selectedItems.some(isNoneAnswer);
  const atCap = maxItems !== undefined && selectedItems.length >= maxItems;
  const [showAll, setShowAll] = useState(false);
  const [customText, setCustomText] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const visibleSuggestions = showAll ? suggestions : suggestions.slice(0, 8);

  const handleAddCustom = useCallback(() => {
    const trimmed = customText.trim();
    if (trimmed && onAddCustom) {
      onAddCustom(trimmed);
      setCustomText("");
      setShowCustom(false);
    }
  }, [customText, onAddCustom]);

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}

      {/* Selected items as removable pills */}
      {selectedItems.length > 0 ? (
        <View style={styles.selectedList}>
          {selectedItems.map((item) => (
            <View key={item} style={styles.selectedPill}>
              <Text style={styles.selectedPillText}>{item}</Text>
              <Pressable
                onPress={() => onToggle(item)}
                hitSlop={8}
                style={styles.selectedPillRemove}
              >
                <X color={C.primary} size={14} strokeWidth={2.5} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {/* Suggestion chips */}
      <View style={styles.chipRow}>
        {allowNone ? (
          <Pressable
            onPress={() => onToggle(NONE_ANSWER)}
            style={({ pressed }) => [
              styles.chip,
              noneSelected && styles.chipSelected,
              pressed && styles.chipPressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: noneSelected }}
          >
            {noneSelected ? <Check color={C.textInverse} size={14} strokeWidth={2.5} /> : null}
            <Text style={[styles.chipText, noneSelected && styles.chipTextSelected]}>
              {NONE_ANSWER}
            </Text>
          </Pressable>
        ) : null}
        {visibleSuggestions.map((opt) => {
          const selected = selectedItems.includes(opt);
          const blocked = atCap && !selected;
          return (
            <Pressable
              key={opt}
              onPress={() => { if (!blocked) onToggle(opt); }}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                blocked && styles.chipBlocked,
                pressed && !blocked && styles.chipPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: blocked }}
            >
              {selected ? (
                <Check color={C.textInverse} size={14} strokeWidth={2.5} />
              ) : null}
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Show more / less */}
      {suggestions.length > 8 ? (
        <Pressable onPress={() => setShowAll(!showAll)} hitSlop={8} style={styles.showMoreBtn}>
          <Text style={styles.showMoreText}>
            {showAll ? "Show less" : `Show ${suggestions.length - 8} more`}
          </Text>
          <ChevronDown
            color={C.primary}
            size={16}
            strokeWidth={2.5}
            style={showAll ? { transform: [{ rotate: "180deg" }] } : undefined}
          />
        </Pressable>
      ) : null}

      {/* Add custom */}
      {atCap ? (
        <Text style={styles.capNote}>
          That&apos;s {maxItems}. Deselect one to choose a different option.
        </Text>
      ) : showCustom ? (
        <View style={styles.customRow}>
          <TextInput
            style={styles.customInput}
            value={customText}
            onChangeText={setCustomText}
            placeholder={placeholder ?? "Type your own…"}
            placeholderTextColor={C.textMuted}
            autoFocus
            onSubmitEditing={handleAddCustom}
          />
          <Pressable onPress={handleAddCustom} style={styles.customAddBtn}>
            <Check color={C.textInverse} size={18} strokeWidth={2.5} />
          </Pressable>
          <Pressable onPress={() => { setShowCustom(false); setCustomText(""); }} style={styles.customCancelBtn}>
            <X color={C.textMuted} size={18} strokeWidth={2.5} />
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setShowCustom(true)} hitSlop={8} style={styles.addCustomBtn}>
          <Plus color={C.primary} size={16} strokeWidth={2.5} />
          <Text style={styles.addCustomText}>Add my own</Text>
        </Pressable>
      )}
    </View>
  );
}


export function AgeWheel({
  value,
  onChange,
  label,
  required,
}: {
  value: string;
  onChange: (val: string) => void;
  label?: string;
  required?: boolean;
}) {
  const { C, styles } = useTheme(makeStyles);
  const [modalVisible, setModalVisible] = useState(false);
  const [draftAge, setDraftAge] = useState(50);
  const ages = useMemo(() => {
    const arr: number[] = [];
    for (let i = 1; i <= 120; i++) arr.push(i);
    return arr;
  }, []);

  const currentAge = parseInt(value, 10);
  const safeAge = isNaN(currentAge) ? 50 : Math.max(MIN_AGE, Math.min(MAX_AGE, currentAge));

  const listRef = useRef<FlatList<number>>(null);

  // Tracks the row currently under the highlight band. Scroll events fire every
  // frame, so this guard keeps us to one state update (and one haptic tick) per
  // row crossed rather than one per frame.
  const settledAge = useRef(safeAge);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);

  /**
   * Pull the list onto a whole row.
   *
   * `snapToInterval` alone is not enough: react-native-web does not implement it
   * for FlatList, so on web the wheel came to rest between two numbers. Snapping
   * explicitly makes the behaviour identical on web and native, and on native it
   * is a no-op because the built-in snap has already landed on the interval.
   */
  const snapToNearestRow = useCallback((offsetY: number) => {
    const index = Math.max(0, Math.min(MAX_AGE - MIN_AGE, Math.round(offsetY / ITEM_HEIGHT)));
    const target = index * ITEM_HEIGHT;
    if (Math.abs(offsetY - target) > 0.5) {
      listRef.current?.scrollToOffset({ offset: target, animated: true });
    }
  }, []);

  const handleAgeScroll = useCallback(
    (offsetY: number) => {
      const index = Math.round(offsetY / ITEM_HEIGHT);
      const nextAge = Math.max(MIN_AGE, Math.min(MAX_AGE, index + 1));

      if (nextAge !== settledAge.current) {
        settledAge.current = nextAge;
        if (Platform.OS !== "web") {
          Haptics.selectionAsync().catch(() => {});
        }
        setDraftAge(nextAge);
      }

      // Debounce rather than snapping on the scroll-end events directly: doing it
      // on release would fight the momentum, and a flick that coasts to a stop
      // does not reliably fire momentum-end on every platform. Once the wheel has
      // been quiet briefly, it has stopped — whatever got it there.
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => snapToNearestRow(offsetY), 120);
    },
    [snapToNearestRow],
  );

  const handleOpen = useCallback(() => {
    settledAge.current = safeAge;
    setDraftAge(safeAge);
    setModalVisible(true);
  }, [safeAge]);

  const handleDone = useCallback(() => {
    onChange(String(draftAge));
    setModalVisible(false);
  }, [draftAge, onChange]);

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}
      <Pressable
        onPress={handleOpen}
        style={({ pressed }) => [styles.agePickerBtn, pressed && styles.pressed]}
      >
        <Text style={styles.agePickerValue}>
          {value ? `${value} years old` : "Tap to select your age"}
        </Text>
        <ChevronDown color={C.primary} size={22} strokeWidth={2.5} />
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        {/*
          The dismiss-on-tap-outside target is a sibling behind the sheet, not a
          parent wrapping it. Wrapping the sheet in a Pressable and calling
          stopPropagation works on web, where these are DOM events, but on native
          the outer Pressable claims the touch responder and the wheel below it
          never receives the pan — the dial simply would not turn on device.
        */}
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select your age</Text>
            <Text style={styles.modalSub}>Scroll to find your age, then tap Done.</Text>
            <View style={styles.wheelContainer}>
              <FlatList
                ref={listRef}
                data={ages}
                keyExtractor={(item) => String(item)}
                initialScrollIndex={safeAge - 1}
                getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                // Rest on a whole row every time. `decelerationRate="fast"` is what
                // gives it the short, weighted glide of a physical dial; leaving
                // interval momentum on means a hard flick still travels several rows.
                snapToInterval={ITEM_HEIGHT}
                snapToAlignment="start"
                decelerationRate="fast"
                // Track continuously so the highlighted number follows your finger
                // instead of only catching up once scrolling stops.
                onScroll={(event) => handleAgeScroll(event.nativeEvent.contentOffset.y)}
                scrollEventThrottle={16}
                // Both end events are kept: rounding is idempotent, and Android
                // does not reliably fire momentum-end on a zero-velocity release.
                onMomentumScrollEnd={(event) => handleAgeScroll(event.nativeEvent.contentOffset.y)}
                onScrollEndDrag={(event) => handleAgeScroll(event.nativeEvent.contentOffset.y)}
                renderItem={({ item }) => {
                  const isSelected = item === draftAge;
                  return (
                    <View style={[styles.wheelItem, isSelected && styles.wheelItemSelected]}>
                      <Text style={[styles.wheelItemText, isSelected && styles.wheelItemTextSelected]}>
                        {item}
                      </Text>
                      {isSelected ? <Check color={C.primary} size={20} strokeWidth={2.5} /> : null}
                    </View>
                  );
                }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.wheelContent}
              />
              <View style={styles.wheelHighlight} pointerEvents="none" />
            </View>
            <Pressable
              onPress={handleDone}
              style={({ pressed }) => [styles.modalDoneBtn, pressed && styles.pressed]}
            >
              <Text style={styles.modalDoneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  wrapper: {
    marginBottom: Space.xs,
  },
  label: {
    ...Type.label,
    color: C.text,
    marginBottom: Space.sm,
  },
  required: {
    color: C.danger,
  },
  // Input
  inputWrap: {
    position: "relative",
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    ...Type.body,
    color: C.text,
    minHeight: 56,
  },
  inputMultiline: {
    minHeight: 130,
    textAlignVertical: "top",
  },
  // Suggestions — a floating dropdown; deliberately elevated.
  suggestionList: {
    marginTop: Space.xs,
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
    ...Elevation.raised,
    maxHeight: 220,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  suggestionPressed: {
    backgroundColor: C.primarySoft,
  },
  suggestionText: {
    ...Type.body,
    color: C.text,
  },
  // Chips
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    backgroundColor: C.surface,
    borderRadius: Radius.pill,
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipSelected: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  chipBlocked: {
    opacity: 0.4,
  },
  capNote: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: Space.md,
  },
  chipPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  chipText: {
    ...Type.label,
    color: C.text,
  },
  chipTextSelected: {
    color: C.textInverse,
  },
  // MultiChip
  selectedList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm,
    marginBottom: Space.md,
  },
  selectedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    backgroundColor: C.primarySoft,
    borderRadius: Radius.pill,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
  },
  selectedPillText: {
    ...Type.label,
    color: C.primary,
  },
  selectedPillRemove: {
    padding: 2,
  },
  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    marginTop: Space.md,
    paddingVertical: Space.xs,
  },
  showMoreText: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.primary,
  },
  addCustomBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    marginTop: Space.md,
    paddingVertical: Space.xs,
  },
  addCustomText: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.primary,
  },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    marginTop: Space.md,
  },
  customInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    ...Type.body,
    color: C.text,
  },
  customAddBtn: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    borderRadius: Radius.md,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  customCancelBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  // Age wheel
  agePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    minHeight: 56,
  },
  agePickerValue: {
    ...Type.body,
    color: C.text,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: C.scrim,
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: C.surface,
    borderTopLeftRadius: Radius.md,
    borderTopRightRadius: Radius.md,
    paddingHorizontal: Space.xl,
    paddingTop: Space.xl,
    paddingBottom: Space.xxxl,
  },
  modalTitle: {
    ...Type.title,
    color: C.text,
    textAlign: "center",
  },
  modalSub: {
    ...Type.body,
    color: C.textMuted,
    textAlign: "center",
    marginTop: Space.xs,
    marginBottom: Space.lg,
  },
  wheelContainer: {
    height: WHEEL_HEIGHT,
    position: "relative",
    justifyContent: "center",
  },
  wheelContent: {
    paddingVertical: WHEEL_PADDING,
  },
  timeColumns: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: Space.sm,
    // Without an explicit height the columns lay out to their full content —
    // twelve rows each — and spill out of the sheet, over the form behind it.
    height: WHEEL_HEIGHT,
    overflow: "hidden",
  },
  wheelTriggerText: {
    ...Type.label,
    color: C.primary,
  },
  timeColon: {
    ...Type.display,
    color: C.text,
    lineHeight: ITEM_HEIGHT,
    marginTop: WHEEL_PADDING,
  },
  wheelHighlight: {
    position: "absolute",
    top: WHEEL_PADDING,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    backgroundColor: C.primarySoft,
    borderRadius: Radius.md,
    opacity: 0.5,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Space.md,
  },
  wheelItemSelected: {},
  wheelItemText: {
    ...Type.title,
    fontFamily: Font.headSemi,
    color: C.textMuted,
  },
  wheelItemTextSelected: {
    ...Type.display,
    color: C.primary,
  },
  modalDoneBtn: {
    backgroundColor: C.primary,
    borderRadius: Radius.md,
    paddingVertical: Space.lg,
    alignItems: "center",
    marginTop: Space.lg,
  },
  modalDoneText: {
    ...Type.heading,
    color: C.textInverse,
  },
});

/**
 * A single scrollable column of a picker wheel.
 *
 * Shared by the time dial's three columns. Behaves like the age wheel: it
 * snaps to a whole row, and reports the row under the highlight band as it
 * moves rather than only when it stops.
 */
function WheelColumn<T extends string | number>({
  data,
  value,
  onChange,
  width,
  format,
}: {
  data: T[];
  value: T;
  onChange: (next: T) => void;
  width: number;
  format?: (item: T) => string;
}) {
  const { styles } = useTheme(makeStyles);
  const listRef = useRef<FlatList<T>>(null);
  const settled = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Position on the current value once the rows exist.
  //
  // `initialScrollIndex` is unreliable on react-native-web and a mount effect
  // fires before layout, so both left the dial reading 1:00 AM whatever time it
  // was editing. onContentSizeChange runs when the list can actually be
  // scrolled; the ref keeps it to the first time, so it never fights the user.
  const positioned = useRef(false);
  const positionOnValue = useCallback(() => {
    if (positioned.current) return;
    const index = data.indexOf(value);
    if (index < 0) return;
    positioned.current = true;
    listRef.current?.scrollToOffset({ offset: index * ITEM_HEIGHT, animated: false });
  }, [data, value]);

  const handleScroll = useCallback(
    (offsetY: number) => {
      const index = Math.max(0, Math.min(data.length - 1, Math.round(offsetY / ITEM_HEIGHT)));
      const next = data[index];
      if (next !== settled.current) {
        settled.current = next;
        if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
        onChange(next);
      }
      // Snap once the column has been still for a moment. react-native-web does
      // not implement snapToInterval for FlatList, so without this the wheel
      // rests between two rows on web.
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const target = index * ITEM_HEIGHT;
        if (Math.abs(offsetY - target) > 0.5) {
          listRef.current?.scrollToOffset({ offset: target, animated: true });
        }
      }, 120);
    },
    [data, onChange],
  );

  return (
    <FlatList
      ref={listRef}
      // Height matters as much as width: without it the list lays out at its
      // full content height and is merely clipped by the parent, so it is not a
      // scroll viewport at all and scrollToOffset silently does nothing.
      style={{ width, height: WHEEL_HEIGHT }}
      data={data}
      keyExtractor={(item) => String(item)}
      initialScrollIndex={Math.max(0, data.indexOf(value))}
      getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
      snapToInterval={ITEM_HEIGHT}
      snapToAlignment="start"
      decelerationRate="fast"
      scrollEventThrottle={16}
      onScroll={(e) => handleScroll(e.nativeEvent.contentOffset.y)}
      onMomentumScrollEnd={(e) => handleScroll(e.nativeEvent.contentOffset.y)}
      onScrollEndDrag={(e) => handleScroll(e.nativeEvent.contentOffset.y)}
      onContentSizeChange={positionOnValue}
      onLayout={positionOnValue}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.wheelContent}
      renderItem={({ item }) => (
        <View style={styles.wheelItem}>
          <Text style={[styles.wheelItemText, item === value && styles.wheelItemTextSelected]}>
            {format ? format(item) : String(item)}
          </Text>
        </View>
      )}
    />
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const PERIODS = ["AM", "PM"] as const;

/**
 * Pick a time on a dial rather than typing it.
 *
 * The form previously took a 24-hour "HH:MM" string, which is a keyboard task
 * and asks people to convert from the clock they actually read. Hours, minutes
 * and AM/PM are three columns of the same wheel, so choosing 2:30 PM is three
 * flicks and no arithmetic. Minutes step by five — appointments are not made to
 * the minute, and 60 rows to scroll would be its own problem.
 */
export function TimeWheel({ value, onChange }: { value: Date; onChange: (next: Date) => void }) {
  const { C, styles } = useTheme(makeStyles);
  const [open, setOpen] = useState(false);

  const hour24 = value.getHours();
  const [hour, setHour] = useState(hour24 % 12 === 0 ? 12 : hour24 % 12);
  const [minute, setMinute] = useState(Math.round(value.getMinutes() / 5) * 5 % 60);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(hour24 >= 12 ? "PM" : "AM");

  const openWheel = useCallback(() => {
    const h = value.getHours();
    setHour(h % 12 === 0 ? 12 : h % 12);
    setMinute(Math.round(value.getMinutes() / 5) * 5 % 60);
    setPeriod(h >= 12 ? "PM" : "AM");
    setOpen(true);
  }, [value]);

  const confirm = useCallback(() => {
    const next = new Date(value);
    const h24 = period === "PM" ? (hour === 12 ? 12 : hour + 12) : hour === 12 ? 0 : hour;
    next.setHours(h24, minute, 0, 0);
    onChange(next);
    setOpen(false);
  }, [hour, minute, period, value, onChange]);

  const display = `${hour24 % 12 === 0 ? 12 : hour24 % 12}:${String(value.getMinutes()).padStart(2, "0")} ${hour24 >= 12 ? "PM" : "AM"}`;

  return (
    <View>
      <Pressable
        onPress={openWheel}
        accessibilityRole="button"
        accessibilityLabel={`Time, ${display}. Tap to change.`}
        style={({ pressed }) => [styles.agePickerBtn, pressed && styles.pressed]}
      >
        <Text style={styles.agePickerValue}>{display}</Text>
        <ChevronDown color={C.primary} size={22} strokeWidth={2.5} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select a time</Text>
            <View style={styles.wheelContainer}>
              <View style={styles.timeColumns}>
                <WheelColumn data={HOURS} value={hour} onChange={setHour} width={84} />
                <Text style={styles.timeColon}>:</Text>
                <WheelColumn data={MINUTES} value={minute} onChange={setMinute} width={84} format={(m) => String(m).padStart(2, "0")} />
                <WheelColumn data={[...PERIODS]} value={period} onChange={setPeriod} width={84} />
              </View>
              <View style={styles.wheelHighlight} pointerEvents="none" />
            </View>
            <Pressable onPress={confirm} style={({ pressed }) => [styles.modalDoneBtn, pressed && styles.pressed]}>
              <Text style={styles.modalDoneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * Pick a month and year on a dial.
 *
 * Vaccination dates are remembered as "some time in March a couple of years
 * ago", not to the day, so month and year are all this asks for. Two columns of
 * the same wheel the age and time pickers use, rather than a month chip strip
 * plus a typed year — that was two different input styles for one date, and the
 * year field could be left half-typed.
 *
 * Years run from this year backwards; nobody records a vaccine they have not had.
 */
export function MonthYearWheel({
  month,
  year,
  onConfirm,
  label,
  triggerLabel,
}: {
  month: number | null;
  year: number | null;
  onConfirm: (month: number, year: number) => void;
  label?: string;
  triggerLabel: string;
}) {
  const { styles } = useTheme(makeStyles);
  const [open, setOpen] = useState(false);
  const thisYear = new Date().getFullYear();
  const years = useMemo(
    () => Array.from({ length: 100 }, (_, i) => thisYear - i),
    [thisYear],
  );

  const [draftMonth, setDraftMonth] = useState(month ?? new Date().getMonth() + 1);
  const [draftYear, setDraftYear] = useState(year ?? thisYear);

  const openWheel = useCallback(() => {
    setDraftMonth(month ?? new Date().getMonth() + 1);
    setDraftYear(year ?? thisYear);
    setOpen(true);
  }, [month, year, thisYear]);

  return (
    <>
      <Pressable
        onPress={openWheel}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label ? `${triggerLabel}, ${label}` : triggerLabel}
      >
        <Text style={styles.wheelTriggerText}>{triggerLabel}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{label ?? "Select a date"}</Text>
            <View style={styles.wheelContainer}>
              <View style={styles.timeColumns}>
                <WheelColumn
                  data={MONTH_LABELS.map((_, i) => i + 1)}
                  value={draftMonth}
                  onChange={setDraftMonth}
                  width={110}
                  format={(m) => MONTH_LABELS[m - 1]}
                />
                <WheelColumn data={years} value={draftYear} onChange={setDraftYear} width={110} />
              </View>
              <View style={styles.wheelHighlight} pointerEvents="none" />
            </View>
            <Pressable
              onPress={() => {
                onConfirm(draftMonth, draftYear);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.modalDoneBtn, pressed && styles.pressed]}
            >
              <Text style={styles.modalDoneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
