// health Card viewer (biometric-locked secure storage).
// Reached from Settings › Health Card once a card is saved; it is a pushed
// stack screen, not a tab, so it draws its own ScreenHeader for the way back.
import { router } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import { CreditCard, Lock, Shield, Plus, Copy, Check, Eye, EyeOff } from "lucide-react-native";
import React, { useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { ZoomablePhoto } from "@/components/photo-viewer";
import { type Palette } from "@/constants/colors";
import { useTheme } from "@/lib/theme";
import { Elevation, Font, HIT_TARGET, Radius, Space, Type } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import { Card, PrimaryButton, EmptyState, ScreenHeader } from "@/components/ui";
import { confirmDestructive, deobfuscate, notify, obfuscate } from "@/lib/utils";
import type { HealthCardData } from "@/lib/types";

// old name on purpose: renaming either key makes a stored card unreadable.
const CARD_KEY = "clairity_healthcard_secure";
const OBFUSCATE_KEY = "clairity_v1_2025";

export default function HealthCardScreen() {
  const { C, styles } = useTheme(makeStyles);
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { healthCard, saveHealthCard, removeHealthCard } = useClairity();
  const [unlocked, setUnlocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [cardData, setCardData] = useState<HealthCardData | null>(null);
  const [showNumber, setShowNumber] = useState(true);
  const [showFront, setShowFront] = useState(true);
  const [copied, setCopied] = useState(false);

  // Load encrypted card data from SecureStore on mount
  useEffect(() => {
    (async () => {
      const encrypted = await SecureStore.getItemAsync(CARD_KEY);
      if (encrypted && !healthCard) {
        // Card exists in SecureStore but not in context — load it
        try {
          const json = deobfuscate(encrypted, OBFUSCATE_KEY);
          const parsed = JSON.parse(json) as HealthCardData;
          setCardData(parsed);
        } catch {
          // Corrupted data
        }
      } else if (healthCard) {
        setCardData(healthCard);
      }
    })();
  }, [healthCard]);

  const handleUnlock = useCallback(async () => {
    setAuthenticating(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (hasHardware && isEnrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Unlock your health card",
          fallbackLabel: "Use passcode",
          cancelLabel: "Cancel",
        });
        if (result.success) {
          // Load card from SecureStore
          const encrypted = await SecureStore.getItemAsync(CARD_KEY);
          if (encrypted) {
            const json = deobfuscate(encrypted, OBFUSCATE_KEY);
            const parsed = JSON.parse(json) as HealthCardData;
            setCardData(parsed);
          }
          setUnlocked(true);
        }
      } else {
        // No biometrics available — use device passcode as fallback
        const encrypted = await SecureStore.getItemAsync(CARD_KEY);
        if (encrypted) {
          const json = deobfuscate(encrypted, OBFUSCATE_KEY);
          const parsed = JSON.parse(json) as HealthCardData;
          setCardData(parsed);
        }
        setUnlocked(true);
      }
    } catch (err) {
      console.error("[ELUCRA] Auth error:", err);
      notify("Authentication failed", "Please try again.");
    } finally {
      setAuthenticating(false);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    if (!cardData?.cardNumber) return;
    await Clipboard.setStringAsync(cardData.cardNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [cardData]);

  const hasCard = Boolean(cardData || healthCard);

  // No card yet — empty state
  if (!hasCard) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScreenHeader title="Health Card" fallbackRoute="/(tabs)/settings" />
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, flexGrow: 1, paddingBottom: scrollPadding }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flex: 1, justifyContent: "center" }}>
            <EmptyState
              icon={<CreditCard color={C.primary} size={40} strokeWidth={2.5} />}
              title="No health card saved"
              message="Keep a copy of your health card here so you always have it when you need it at a clinic or pharmacy."
              actionLabel="Add your health card"
              onAction={() => router.push("/health-card-setup")}
            />
          </View>

          {/* Security note */}
          <View style={styles.securityNote}>
            <View style={styles.securityIconWrap}>
              <Shield color={C.primary} size={20} strokeWidth={2.5} />
            </View>
            <Text style={styles.securityText}>
              Your health card is encrypted and stored only on this phone. It's protected by
              Face ID, Touch ID, or your passcode. It's never sent to any server.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // Card exists but locked
  if (!unlocked) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScreenHeader title="Health Card" fallbackRoute="/(tabs)/settings" />
        <View style={styles.lockedScreen}>
          <View style={styles.lockIcon}>
            <Lock color={C.primary} size={40} strokeWidth={2.5} />
          </View>
          <Text style={styles.lockedTitle}>Your health card is locked</Text>
          <Text style={styles.lockedMsg}>
            Authenticate with Face ID, Touch ID, or your passcode to view your card.
          </Text>
          <PrimaryButton
            label={authenticating ? "Authenticating…" : "Unlock Card"}
            onPress={handleUnlock}
            loading={authenticating}
            icon={!authenticating ? <Lock color={C.textInverse} size={22} strokeWidth={2.5} /> : undefined}
            style={{ marginTop: 28, width: "100%" }}
          />
        </View>
      </View>
    );
  }

  // Unlocked — show card
  const displayCard = cardData ?? healthCard;
  if (!displayCard) return null;

  /*
    Only one side photographed is the normal case, not an edge case: plenty of
    cards have nothing on the back worth keeping.

    Selecting a side that was never uploaded used to leave `currentImage`
    undefined, which rendered the whole block — image *and* the Front/Back
    toggle — as null. The toggle was the only way back, so tapping "Back" on a
    front-only card stranded you on an empty screen. Show whichever side exists,
    and only offer the toggle when there is genuinely something to toggle between.
  */
  const hasFront = Boolean(displayCard.frontImageUri);
  const hasBack = Boolean(displayCard.backImageUri);
  const bothSides = hasFront && hasBack;
  const currentImage = bothSides
    ? showFront
      ? displayCard.frontImageUri
      : displayCard.backImageUri
    : (displayCard.frontImageUri ?? displayCard.backImageUri);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Health Card"
        fallbackRoute="/(tabs)/settings"
        actions={
          <Pressable
            onPress={() => {
              setUnlocked(false);
              setCardData(null);
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Lock health card"
          >
            <Lock color={C.textMuted} size={22} strokeWidth={2.5} />
          </Pressable>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: scrollPadding }}
      >
        {/* Card image with front/back toggle */}
        {currentImage ? (
          <View style={styles.cardImageWrap}>
            <ZoomablePhoto
              uri={currentImage}
              style={styles.cardImage}
              contentFit="contain"
              accessibilityLabel="Open health card photo full screen"
              caption="Tap the close button when you are done"
            />
            {bothSides ? (
              <View style={styles.flipToggle}>
                <Pressable
                  onPress={() => setShowFront(true)}
                  style={({ pressed }) => [styles.flipBtn, showFront && styles.flipBtnActive, pressed && styles.pressed]}
                >
                  <Text style={[styles.flipBtnText, showFront && styles.flipBtnTextActive]}>Front</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowFront(false)}
                  style={({ pressed }) => [styles.flipBtn, !showFront && styles.flipBtnActive, pressed && styles.pressed]}
                >
                  <Text style={[styles.flipBtnText, !showFront && styles.flipBtnTextActive]}>Back</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Card number — the hero */}
        <View style={styles.numberCard}>
          <Text style={styles.numberLabel}>Card Number</Text>
          <Pressable onPress={handleCopy} style={styles.numberRow}>
            <Text style={styles.cardNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {showNumber ? displayCard.cardNumber : "•••• •••• •••• ••••"}
            </Text>
            <View style={styles.numberActions}>
              <Pressable onPress={() => setShowNumber(!showNumber)} hitSlop={12} style={styles.iconBtn}>
                {showNumber ? <EyeOff color={C.onPrimaryMuted} size={20} strokeWidth={2.5} /> : <Eye color={C.onPrimaryMuted} size={20} strokeWidth={2.5} />}
              </Pressable>
              <Pressable onPress={handleCopy} hitSlop={12} style={styles.iconBtn}>
                {copied ? <Check color={C.textInverse} size={20} strokeWidth={2.5} /> : <Copy color={C.onPrimaryMuted} size={20} strokeWidth={2.5} />}
              </Pressable>
            </View>
          </Pressable>
          <Text style={styles.tapHint}>
            {copied ? "✓ Copied to clipboard" : "Tap the copy icon to copy the number"}
          </Text>
        </View>

        {/* Card details */}
        <Card style={{ marginTop: 16 }}>
          <DetailRow label="Name" value={displayCard.name} />
          <DetailRow label="Version Code" value={displayCard.versionCode} />
          <DetailRow label="Expiry" value={displayCard.expiry} />
          <DetailRow label="Issuer" value={displayCard.issuer} last />
        </Card>

        {/* Apple Wallet note */}
        <View style={styles.walletNote}>
          <Text style={styles.walletTitle}>About Apple Wallet</Text>
          <Text style={styles.walletText}>
            Canadian health cards are not Apple Wallet passes. ELUCRA keeps a copy of your card
            here so you always have it. For official use, always carry your physical card.
          </Text>
        </View>

        {/* Security note */}
        <View style={styles.securityNoteSmall}>
          <View style={styles.securityIconWrapSmall}>
            <Shield color={C.primary} size={16} strokeWidth={2.5} />
          </View>
          <Text style={styles.securityTextSmall}>
            Encrypted on-device. Never synced to any server. Protected by biometric authentication.
          </Text>
        </View>

        {/* Delete */}
        <Pressable
          onPress={() => {
            confirmDestructive(
              "Delete health card?",
              "This will permanently remove your card from this phone.",
              "Delete",
              async () => {
                await SecureStore.deleteItemAsync(CARD_KEY);
                removeHealthCard();
                setCardData(null);
                setUnlocked(false);
              },
            );
          }}
          style={styles.deleteBtn}
        >
          <Text style={styles.deleteText}>Delete health card</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { styles } = useTheme(makeStyles);
  return (
    <View style={[styles.detailRow, !last && styles.detailRowBorder]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || "–"}</Text>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  // Empty
  securityNote: {
    flexDirection: "row",
    gap: Space.md,
    backgroundColor: C.primarySoft,
    borderRadius: Radius.md,
    padding: Space.lg,
    marginTop: Space.xl,
  },
  securityIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: C.successSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  securityText: {
    flex: 1,
    ...Type.caption,
    color: C.textMuted,
  },
  securityNoteSmall: {
    flexDirection: "row",
    gap: Space.md,
    backgroundColor: C.primarySoft,
    borderRadius: Radius.md,
    padding: Space.md,
    marginTop: Space.lg,
  },
  securityIconWrapSmall: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    backgroundColor: C.successSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  securityTextSmall: {
    flex: 1,
    ...Type.caption,
    color: C.textMuted,
  },
  // Locked
  lockedScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Space.xl,
  },
  lockIcon: {
    width: 88,
    height: 88,
    borderRadius: Radius.pill,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.xl,
  },
  lockedTitle: {
    ...Type.title,
    color: C.text,
    textAlign: "center",
  },
  lockedMsg: {
    ...Type.body,
    color: C.textMuted,
    textAlign: "center",
    marginTop: Space.md,
  },
  // Card image
  cardImageWrap: {
    marginBottom: Space.lg,
  },
  cardImage: {
    width: "100%",
    height: 200,
    borderRadius: Radius.md,
    backgroundColor: C.surfaceAlt,
  },
  flipToggle: {
    flexDirection: "row",
    gap: Space.xs,
    marginTop: Space.md,
    backgroundColor: C.surfaceAlt,
    borderRadius: Radius.md,
    padding: Space.xs,
  },
  flipBtn: {
    flex: 1,
    paddingVertical: Space.md,
    alignItems: "center",
    borderRadius: Radius.sm,
  },
  flipBtnActive: {
    backgroundColor: C.surface,
  },
  flipBtnText: {
    ...Type.label,
    color: C.textMuted,
  },
  flipBtnTextActive: {
    color: C.text,
  },
  // Number card — the one deliberately-elevated surface (a physical card).
  numberCard: {
    backgroundColor: C.primary,
    borderRadius: Radius.md,
    padding: Space.xl,
    ...Elevation.raised,
  },
  numberLabel: {
    ...Type.caption,
    fontFamily: Font.bodySemi,
    color: C.onPrimaryMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  numberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Space.sm,
    gap: Space.md,
  },
  cardNumber: {
    flex: 1,
    // One step down from display. An Ontario number with its dashes wrapped to
    // a second line at 28px, which broke the grouping that makes it readable
    // and readable-aloud. Tracking drops with it so the digits stay grouped.
    ...Type.title,
    color: C.textInverse,
    letterSpacing: 0.5,
  },
  numberActions: {
    flexDirection: "row",
    gap: Space.md,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.onPrimaryFill,
    borderRadius: Radius.md,
  },
  tapHint: {
    ...Type.caption,
    color: C.onPrimaryMuted,
    marginTop: Space.md,
  },
  // Details
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Space.md,
  },
  detailRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  detailLabel: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.textMuted,
  },
  detailValue: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.text,
    textAlign: "right",
    flex: 1,
  },
  // Wallet note
  walletNote: {
    marginTop: Space.lg,
    backgroundColor: C.surfaceAlt,
    borderRadius: Radius.md,
    padding: Space.lg,
  },
  walletTitle: {
    ...Type.label,
    color: C.text,
    marginBottom: Space.xs,
  },
  walletText: {
    ...Type.caption,
    color: C.textMuted,
  },
  // Delete
  deleteBtn: {
    alignItems: "center",
    paddingVertical: Space.lg,
    marginTop: Space.lg,
  },
  deleteText: {
    ...Type.body,
    fontFamily: Font.bodySemi,
    color: C.danger,
  },
});
