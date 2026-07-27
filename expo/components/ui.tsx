/**
 * CLAIRITY — Shared UI components.
 * Deliberate clinical interface primitives: clear hierarchy, quiet surfaces,
 * consistent typography, and large high-contrast touch targets.
 */

import { router } from "expo-router";
import { ArrowLeft, ChevronRight } from "lucide-react-native";
import React, { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import Colors from "@/constants/colors";
import { HIT_TARGET, Radius, Space, Type, Weight } from "@/constants/theme";

const C = Colors.light;

/**
 * `router.canGoBack()` is an imperative method that throws on the web/DOM
 * renderer ("canGoBack imperative method is not supported"). We guard it
 * here so the app can safely fall back to a route when running on web.
 */
export function canGoBackSafe(): boolean {
  try {
    return router.canGoBack();
  } catch {
    return false;
  }
}

/** Primary action button — a single, high-emphasis action. */
export function PrimaryButton({
  label,
  onPress,
  icon,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primaryBtn,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={C.textInverse} size="small" />
      ) : (
        <>
          {icon}
          <Text style={styles.primaryBtnText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Secondary action button — quiet outline treatment. */
export function SecondaryButton({
  label,
  onPress,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed, style]}
    >
      {icon}
      <Text style={styles.secondaryBtnText}>{label}</Text>
    </Pressable>
  );
}

/** A content surface with optional navigation affordance. */
export function Card({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A row with a label and chevron for navigation. */
export function NavRow({
  label,
  sublabel,
  onPress,
  icon,
  badge,
}: {
  label: string;
  sublabel?: string;
  onPress: () => void;
  icon?: ReactNode;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.navRow, pressed && styles.cardPressed]}
    >
      {icon && <View style={styles.navRowIcon}>{icon}</View>}
      <View style={styles.navRowText}>
        <Text style={styles.navRowLabel}>{label}</Text>
        {sublabel ? <Text style={styles.navRowSub}>{sublabel}</Text> : null}
      </View>
      {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
      <ChevronRight color={C.textMuted} size={22} />
    </Pressable>
  );
}

/** Section header with optional action. */
export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Tag/chip for status indicators — pill shape. */
export function Tag({
  text,
  color,
  bg,
}: {
  text: string;
  color?: string;
  bg?: string;
}) {
  return (
    <View style={[styles.tag, bg ? { backgroundColor: bg } : null]}>
      <Text style={[styles.tagText, color ? { color } : null]}>{text}</Text>
    </View>
  );
}

/** Empty state placeholder — friendly and encouraging. */
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon?: ReactNode;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      {icon && <View style={styles.emptyIcon}>{icon}</View>}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionLabel && onAction ? (
        <SecondaryButton label={actionLabel} onPress={onAction} style={{ marginTop: 16 }} />
      ) : null}
    </View>
  );
}

/**
 * The app's only header.
 *
 * Every pushed screen draws this rather than using the native stack header,
 * so back always looks and sits in the same place. `onBack` defaults to
 * popping the stack, and falls back to a supplied route when there is no
 * history — a screen reached via `replace` must still have a way out.
 */
export function ScreenHeader({
  title,
  fallbackRoute,
  onBack,
  actions,
}: {
  title?: string;
  fallbackRoute?: string;
  onBack?: () => void;
  actions?: ReactNode;
}) {
  const handleBack = () => {
    if (onBack) return onBack();
    if (canGoBackSafe()) return router.back();
    if (fallbackRoute) return router.replace(fallbackRoute as never);
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.header}>
      <Pressable
        onPress={handleBack}
        hitSlop={12}
        style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <ArrowLeft color={C.text} size={24} />
      </Pressable>
      {title ? (
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <View style={styles.headerActions}>{actions}</View>
    </View>
  );
}

/** Screen wrapper with safe scroll. */
export function Screen({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    backgroundColor: C.primary,
    paddingVertical: Space.md,
    paddingHorizontal: Space.xl,
    borderRadius: Radius.md,
    minHeight: HIT_TARGET,
  },
  primaryBtnText: {
    ...Type.label,
    color: C.textInverse,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderStrong,
    paddingVertical: Space.md,
    paddingHorizontal: Space.xl,
    borderRadius: Radius.md,
    minHeight: HIT_TARGET,
  },
  secondaryBtnText: {
    ...Type.label,
    color: C.primary,
  },
  pressed: {
    opacity: 0.76,
  },
  disabled: {
    opacity: 0.4,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    padding: Space.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardPressed: {
    backgroundColor: C.surfaceAlt,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    backgroundColor: C.surface,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    minHeight: 64,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  navRowIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  navRowText: {
    flex: 1,
  },
  navRowLabel: {
    ...Type.body,
    fontWeight: Weight.semibold,
    color: C.text,
  },
  navRowSub: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: 2,
  },
  badge: {
    backgroundColor: C.primary,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    minWidth: 24,
    alignItems: "center",
  },
  badgeText: {
    ...Type.caption,
    fontWeight: Weight.semibold,
    color: C.textInverse,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    minHeight: 56,
  },
  headerBtn: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.sm,
  },
  headerTitle: {
    flex: 1,
    ...Type.heading,
    color: C.text,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Space.lg,
    marginTop: Space.xl,
    marginBottom: Space.sm,
  },
  sectionTitle: {
    ...Type.title,
    color: C.text,
  },
  sectionAction: {
    ...Type.label,
    color: C.primary,
  },
  tag: {
    backgroundColor: C.surfaceAlt,
    borderRadius: Radius.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  tagText: {
    ...Type.caption,
    fontWeight: Weight.semibold,
    color: C.textMuted,
  },
  empty: {
    alignItems: "center",
    paddingVertical: Space.xxxl,
    paddingHorizontal: Space.xl,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.lg,
  },
  emptyTitle: {
    ...Type.heading,
    color: C.text,
    textAlign: "center",
    marginBottom: Space.xs,
  },
  emptyMessage: {
    ...Type.body,
    color: C.textMuted,
    textAlign: "center",
  },
});
