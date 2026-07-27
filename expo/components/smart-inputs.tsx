/**
 * CLAIRITY — Smart input components.
 * AutocompleteInput, ChipSelect, MultiChipInput, AgeWheel.
 * Reduces user error with tap-to-select suggestions and pickers.
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  FlatList,
  Modal,
} from "react-native";
import { ChevronDown, Check, X, Plus } from "lucide-react-native";

import Colors from "@/constants/colors";
import { Elevation, HIT_TARGET, Radius, Space, Type, Weight } from "@/constants/theme";

const C = Colors.light;

/** Autocomplete text input with dropdown suggestions. */
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

/** Single-select chip picker — tap one option from a row of pills. */
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

/** Multi-select chip picker — tap multiple options, build a list. */
export function MultiChipInput({
  selectedItems,
  onToggle,
  onAddCustom,
  suggestions,
  placeholder,
  label,
  required,
}: {
  selectedItems: string[];
  onToggle: (item: string) => void;
  onAddCustom?: (item: string) => void;
  suggestions: string[];
  placeholder?: string;
  label?: string;
  required?: boolean;
}) {
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
        {visibleSuggestions.map((opt) => {
          const selected = selectedItems.includes(opt);
          return (
            <Pressable
              key={opt}
              onPress={() => onToggle(opt)}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && styles.chipPressed,
              ]}
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
      {showCustom ? (
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

/** Age selection wheel — modal with scrollable number picker. */
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
  const [modalVisible, setModalVisible] = useState(false);
  const [draftAge, setDraftAge] = useState(50);
  const ages = useMemo(() => {
    const arr: number[] = [];
    for (let i = 1; i <= 120; i++) arr.push(i);
    return arr;
  }, []);

  const currentAge = parseInt(value, 10);
  const safeAge = isNaN(currentAge) ? 50 : Math.max(1, Math.min(120, currentAge));
  const ITEM_HEIGHT = 56;

  const handleAgeScroll = useCallback((offsetY: number) => {
    const index = Math.round(offsetY / ITEM_HEIGHT);
    const nextAge = Math.max(1, Math.min(120, index + 1));
    setDraftAge(nextAge);
  }, [ITEM_HEIGHT]);

  const handleOpen = useCallback(() => {
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
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Select your age</Text>
            <Text style={styles.modalSub}>Scroll to find your age, then tap Done.</Text>
            <View style={styles.wheelContainer}>
              <FlatList
                data={ages}
                keyExtractor={(item) => String(item)}
                initialScrollIndex={safeAge - 1}
                getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
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
                contentContainerStyle={{ paddingVertical: 112 }}
              />
              <View style={styles.wheelHighlight} pointerEvents="none" />
            </View>
            <Pressable
              onPress={handleDone}
              style={({ pressed }) => [styles.modalDoneBtn, pressed && styles.pressed]}
            >
              <Text style={styles.modalDoneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontWeight: Weight.semibold,
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
    fontWeight: Weight.semibold,
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
    backgroundColor: "rgba(0,0,0,0.4)",
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
    height: 280,
    position: "relative",
    justifyContent: "center",
  },
  wheelHighlight: {
    position: "absolute",
    top: 112,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: C.primarySoft,
    borderRadius: Radius.md,
    opacity: 0.5,
  },
  wheelItem: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Space.md,
  },
  wheelItemSelected: {},
  wheelItemText: {
    ...Type.title,
    fontWeight: Weight.semibold,
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
