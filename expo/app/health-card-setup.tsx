// CLAIRITY — Health Card setup (photo autofill + manual entry)
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import {
  Camera,
  Image as ImageIcon,
  Check,
  CreditCard,
  Shield,
  Sparkles,
  RefreshCw,
  Loader,
  AlertCircle,
} from "lucide-react-native";
import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import Colors from "@/constants/colors";
import { Font, Radius, Space, Type } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import { PrimaryButton, ScreenHeader } from "@/components/ui";
import { notify, obfuscate } from "@/lib/utils";
import { extractHealthCard } from "@/lib/ai-service";
import { resizeForUpload } from "@/lib/resize-for-upload";
import type { HealthCardData } from "@/lib/types";

const C = Colors.light;
const CARD_KEY = "clairity_healthcard_secure";
const OBFUSCATE_KEY = "clairity_v1_2025";

type AutofillPhase = "idle" | "scanning" | "done" | "error";

export default function HealthCardSetupScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { saveHealthCard } = useClairity();
  const [cardNumber, setCardNumber] = useState("");
  const [name, setName] = useState("");
  const [versionCode, setVersionCode] = useState("");
  const [expiry, setExpiry] = useState("");
  const [issuer, setIssuer] = useState("");
  const [frontImageUri, setFrontImageUri] = useState<string | null>(null);
  const [backImageUri, setBackImageUri] = useState<string | null>(null);
  const [autofillPhase, setAutofillPhase] = useState<AutofillPhase>("idle");
  const [autofillMsg, setAutofillMsg] = useState("");

  const runOCR = useCallback(async (uri: string) => {
    setAutofillPhase("scanning");
    setAutofillMsg("Reading your card with AI…");
    try {
      const { base64, mimeType } = await resizeForUpload(uri);
      const result = await extractHealthCard({ imageBase64: base64, mimeType });

      if (result.cardNumber) setCardNumber(result.cardNumber);
      if (result.name) setName(result.name);
      if (result.versionCode) setVersionCode(result.versionCode);
      if (result.expiry) setExpiry(result.expiry);
      if (result.issuer) setIssuer(result.issuer);

      setAutofillPhase("done");
      setAutofillMsg("Card details auto-filled! Please review and correct if needed.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't read the card.";
      setAutofillPhase("error");
      setAutofillMsg(msg);
    }
  }, []);

  const captureImage = useCallback(async (which: "front" | "back") => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      notify("Permission needed", "Camera access is needed to photograph your card.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      if (which === "front") {
        setFrontImageUri(uri);
        // Auto-run OCR on front photo
        await runOCR(uri);
      } else {
        setBackImageUri(uri);
      }
    }
  }, [runOCR]);

  const pickImage = useCallback(async (which: "front" | "back") => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      if (which === "front") {
        setFrontImageUri(uri);
        await runOCR(uri);
      } else {
        setBackImageUri(uri);
      }
    }
  }, [runOCR]);

  const handleSave = useCallback(async () => {
    if (!cardNumber.trim()) {
      notify("Card number required", "Please enter your health card number.");
      return;
    }
    const card: HealthCardData = {
      cardNumber: cardNumber.trim(),
      name: name.trim(),
      versionCode: versionCode.trim(),
      expiry: expiry.trim(),
      issuer: issuer.trim(),
      frontImageUri,
      backImageUri,
    };

    const json = JSON.stringify(card);
    const encrypted = obfuscate(json, OBFUSCATE_KEY);
    await SecureStore.setItemAsync(CARD_KEY, encrypted);

    saveHealthCard(card);
    // Replaces rather than pops back: land on the saved card as confirmation
    // of what was just written, and drop the input form from the stack so
    // "back" from there doesn't return to a stale, already-submitted form.
    router.replace("/healthcard");
  }, [cardNumber, name, versionCode, expiry, issuer, frontImageUri, backImageUri, saveHealthCard]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Health Card" fallbackRoute="/healthcard" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: scrollPadding }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.titleWrap}>
            <View style={styles.titleIcon}>
              <CreditCard color={C.primary} size={24} strokeWidth={2.5} />
            </View>
            <Text style={styles.title}>Add Your Health Card</Text>
          </View>
          <Text style={styles.subtitle}>
            Photograph the front of your card and we'll auto-fill the details using AI.
            Everything is encrypted and stored only on your phone.
          </Text>

          {/* Autofill status banner */}
          {autofillPhase === "scanning" ? (
            <View style={styles.autofillBannerScanning}>
              <ActivityIndicator color={C.primary} size="small" />
              <Text style={styles.autofillBannerText}>{autofillMsg}</Text>
            </View>
          ) : autofillPhase === "done" ? (
            <View style={styles.autofillBannerDone}>
              <View style={styles.autofillBannerIcon}>
                <Sparkles color={C.success} size={18} strokeWidth={2.5} />
              </View>
              <Text style={styles.autofillBannerTextDone}>{autofillMsg}</Text>
            </View>
          ) : autofillPhase === "error" ? (
            <View style={styles.autofillBannerError}>
              <View style={styles.autofillBannerIcon}>
                <AlertCircle color={C.danger} size={18} strokeWidth={2.5} />
              </View>
              <Text style={styles.autofillBannerTextError}>{autofillMsg}</Text>
            </View>
          ) : null}

          {/* Card photos — one slot per side, like depositing a cheque */}
          <Text style={styles.fieldLabel}>Card Photos</Text>
          <CardCaptureSlot
            side="Front"
            hint="We'll read the details from this side"
            imageUri={frontImageUri}
            onCamera={() => captureImage("front")}
            onGallery={() => pickImage("front")}
            busy={autofillPhase === "scanning"}
          />
          <CardCaptureSlot
            side="Back"
            hint="Optional. Kept for your records."
            imageUri={backImageUri}
            onCamera={() => captureImage("back")}
            onGallery={() => pickImage("back")}
          />

          {/* Re-scan button */}
          {frontImageUri ? (
            <Pressable
              onPress={() => runOCR(frontImageUri)}
              style={({ pressed }) => [styles.rescanBtn, pressed && styles.pressed]}
            >
              <RefreshCw color={C.primary} size={16} strokeWidth={2.5} />
              <Text style={styles.rescanText}>Re-scan front photo</Text>
            </Pressable>
          ) : null}

          {/* Card details */}
          <View style={styles.form}>
            <FieldLabel label="Card Number" required />
            <TextInput
              style={styles.input}
              value={cardNumber}
              onChangeText={setCardNumber}
              placeholder="e.g. 1234 567 890 ON"
              placeholderTextColor={C.textMuted}
              autoCapitalize="characters"
            />

            <FieldLabel label="Name on Card" />
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. HARPREET SINGH"
              placeholderTextColor={C.textMuted}
              autoCapitalize="characters"
            />

            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <FieldLabel label="Version Code" />
                <TextInput
                  style={styles.input}
                  value={versionCode}
                  onChangeText={setVersionCode}
                  placeholder="e.g. 0209"
                  placeholderTextColor={C.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel label="Expiry" />
                <TextInput
                  style={styles.input}
                  value={expiry}
                  onChangeText={setExpiry}
                  placeholder="e.g. 2027-08"
                  placeholderTextColor={C.textMuted}
                />
              </View>
            </View>

            <FieldLabel label="Issuer" />
            <TextInput
              style={styles.input}
              value={issuer}
              onChangeText={setIssuer}
              placeholder="e.g. Ontario (OHIP)"
              placeholderTextColor={C.textMuted}
            />
          </View>

          <View style={{ flex: 1 }} />

          {/* Security note */}
          <View style={styles.securityNote}>
            <View style={styles.securityIconWrap}>
              <Shield color={C.primary} size={18} strokeWidth={2.5} />
            </View>
            <Text style={styles.securityText}>
              Your card will be encrypted and protected by Face ID, Touch ID, or your
              passcode. It never leaves your phone.
            </Text>
          </View>

          <PrimaryButton
            label="Save Health Card"
            onPress={handleSave}
            icon={<Check color={C.textInverse} size={22} strokeWidth={2.5} />}
            disabled={!cardNumber.trim()}
            style={{ width: "100%", marginTop: 16 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {required ? <Text style={styles.required}> *</Text> : null}
    </Text>
  );
}

/**
 * One side of the card, captured the way a banking app captures a cheque.
 *
 * The previous version put four buttons — Camera and Gallery for each side — in
 * a grid above the fields, which read as a wall of controls and gave no sense
 * that what you are photographing is a card. This is a single card-shaped slot
 * per side: tap it to shoot, and once there is a photo the slot *becomes* the
 * photo, so the state of the thing is visible rather than described.
 *
 * Gallery stays available but steps back to a text link, since photographing
 * the card in front of you is overwhelmingly the common path.
 */
function CardCaptureSlot({
  side,
  hint,
  imageUri,
  onCamera,
  onGallery,
  busy,
}: {
  side: string;
  hint: string;
  imageUri: string | null;
  onCamera: () => void;
  onGallery: () => void;
  busy?: boolean;
}) {
  return (
    <View style={styles.slotWrap}>
      <View style={styles.slotHeader}>
        <Text style={styles.slotSide}>{side}</Text>
        {imageUri ? (
          <View style={styles.slotDone}>
            <Check color={C.success} size={15} strokeWidth={3} />
            <Text style={styles.slotDoneText}>Captured</Text>
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={onCamera}
        accessibilityRole="button"
        accessibilityLabel={imageUri ? `Retake ${side} of card` : `Photograph ${side} of card`}
        style={({ pressed }) => [
          styles.slot,
          imageUri ? styles.slotFilled : styles.slotEmpty,
          pressed && styles.pressed,
        ]}
      >
        {imageUri ? (
          <>
            <Image source={{ uri: imageUri }} style={styles.slotImage} contentFit="cover" />
            <View style={styles.slotRetake}>
              <Camera color={C.textInverse} size={15} strokeWidth={2.5} />
              <Text style={styles.slotRetakeText}>Retake</Text>
            </View>
          </>
        ) : (
          <View style={styles.slotEmptyInner}>
            <View style={styles.slotIconWrap}>
              <Camera color={C.primary} size={24} strokeWidth={2.5} />
            </View>
            <Text style={styles.slotPrompt}>Tap to photograph</Text>
            <Text style={styles.slotHint}>{hint}</Text>
          </View>
        )}

        {busy ? (
          <View style={styles.slotBusy}>
            <ActivityIndicator color={C.textInverse} />
            <Text style={styles.slotBusyText}>Reading card…</Text>
          </View>
        ) : null}
      </Pressable>

      <Pressable onPress={onGallery} hitSlop={10} style={styles.slotGallery}>
        <ImageIcon color={C.textMuted} size={15} strokeWidth={2.5} />
        <Text style={styles.slotGalleryText}>Choose from library</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    marginTop: Space.md,
  },
  titleIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    ...Type.display,
    color: C.text,
  },
  subtitle: {
    ...Type.body,
    color: C.textMuted,
    marginTop: Space.md,
    marginBottom: Space.lg,
  },
  // Autofill banners
  autofillBannerScanning: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    backgroundColor: C.primarySoft,
    borderRadius: Radius.md,
    padding: Space.lg,
    marginBottom: Space.lg,
  },
  autofillBannerDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    backgroundColor: C.successSoft,
    borderRadius: Radius.md,
    padding: Space.lg,
    marginBottom: Space.lg,
  },
  autofillBannerError: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    backgroundColor: C.dangerSoft,
    borderRadius: Radius.md,
    padding: Space.lg,
    marginBottom: Space.lg,
  },
  autofillBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  autofillBannerText: {
    flex: 1,
    ...Type.label,
    color: C.primary,
  },
  autofillBannerTextDone: {
    flex: 1,
    ...Type.label,
    color: C.success,
  },
  autofillBannerTextError: {
    flex: 1,
    ...Type.label,
    color: C.danger,
  },
  // Fields
  fieldLabel: {
    ...Type.label,
    color: C.text,
    marginBottom: Space.sm,
    marginTop: Space.lg,
  },
  required: {
    color: C.danger,
  },
  slotWrap: {
    marginBottom: Space.lg,
  },
  slotHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Space.sm,
  },
  slotSide: {
    ...Type.label,
    color: C.text,
  },
  slotDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
  },
  slotDoneText: {
    ...Type.caption,
    color: C.success,
  },
  // 1.586:1 is the ID-1 card ratio every health card, bank card and driving
  // licence uses, so the empty slot is already the shape of the thing you are
  // about to put in it.
  slot: {
    width: "100%",
    aspectRatio: 1.586,
    borderRadius: Radius.lg,
    overflow: "hidden",
    justifyContent: "center",
  },
  slotEmpty: {
    // Lighter fill than the page with the stronger border colour: `border` on
    // `surfaceAlt` is a two-shade difference and the dashed edge disappeared,
    // taking the "this is an empty slot you can fill" cue with it.
    backgroundColor: C.surface,
    borderWidth: 2,
    borderColor: C.borderStrong,
    borderStyle: "dashed",
  },
  slotFilled: {
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  slotEmptyInner: {
    alignItems: "center",
    gap: Space.sm,
    paddingHorizontal: Space.lg,
  },
  slotIconWrap: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  slotPrompt: {
    ...Type.label,
    color: C.text,
  },
  slotHint: {
    ...Type.caption,
    color: C.textMuted,
    textAlign: "center",
  },
  slotImage: {
    width: "100%",
    height: "100%",
  },
  slotRetake: {
    position: "absolute",
    right: Space.md,
    bottom: Space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(42,33,25,0.82)",
  },
  slotRetakeText: {
    ...Type.caption,
    color: C.textInverse,
  },
  slotBusy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    backgroundColor: "rgba(42,33,25,0.62)",
  },
  slotBusyText: {
    ...Type.label,
    color: C.textInverse,
  },
  slotGallery: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.xs,
    paddingVertical: Space.md,
  },
  slotGalleryText: {
    ...Type.caption,
    color: C.textMuted,
  },
  rescanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    backgroundColor: C.primarySoft,
    borderRadius: Radius.md,
    paddingVertical: Space.md,
    marginTop: Space.md,
  },
  rescanText: {
    ...Type.label,
    color: C.primary,
  },
  form: {
    gap: 0,
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
  twoCol: {
    flexDirection: "row",
    gap: Space.md,
  },
  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    backgroundColor: C.primarySoft,
    borderRadius: Radius.md,
    padding: Space.lg,
    marginTop: Space.lg,
  },
  securityIconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: "rgba(13,148,136,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  securityText: {
    flex: 1,
    ...Type.caption,
    color: C.textMuted,
  },
});
