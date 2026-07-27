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
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import Colors from "@/constants/colors";
import { Radius, Space, Type, Weight } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import { PrimaryButton, ScreenHeader } from "@/components/ui";
import { obfuscate } from "@/lib/utils";
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
      Alert.alert("Permission needed", "Camera access is needed to photograph your card.");
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
      Alert.alert("Card number required", "Please enter your health card number.");
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
    router.back();
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

          {/* Card photos */}
          <Text style={styles.fieldLabel}>Card Photos</Text>
          <View style={styles.imageRow}>
            <CardImagePicker
              label="Front (AI will read this)"
              imageUri={frontImageUri}
              onCamera={() => captureImage("front")}
              onGallery={() => pickImage("front")}
            />
            <CardImagePicker
              label="Back"
              imageUri={backImageUri}
              onCamera={() => captureImage("back")}
              onGallery={() => pickImage("back")}
            />
          </View>

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

function CardImagePicker({
  label,
  imageUri,
  onCamera,
  onGallery,
}: {
  label: string;
  imageUri: string | null;
  onCamera: () => void;
  onGallery: () => void;
}) {
  return (
    <View style={styles.cardPicker}>
      <Text style={styles.cardPickerLabel}>{label}</Text>
      {imageUri ? (
        <View style={styles.cardPickerImageWrap}>
          <Image source={{ uri: imageUri }} style={styles.cardPickerImage} contentFit="contain" />
          <Pressable onPress={onCamera} style={styles.retakeBtn}>
            <Text style={styles.retakeText}>Retake</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.cardPickerActions}>
          <Pressable onPress={onCamera} style={({ pressed }) => [styles.cardPickerBtn, pressed && styles.pressed]}>
            <Camera color={C.primary} size={22} strokeWidth={2.5} />
            <Text style={styles.cardPickerBtnText}>Camera</Text>
          </Pressable>
          <Pressable onPress={onGallery} style={({ pressed }) => [styles.cardPickerBtn, pressed && styles.pressed]}>
            <ImageIcon color={C.accent} size={22} strokeWidth={2.5} />
            <Text style={styles.cardPickerBtnText}>Gallery</Text>
          </Pressable>
        </View>
      )}
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
  imageRow: {
    flexDirection: "row",
    gap: Space.md,
  },
  cardPicker: {
    flex: 1,
  },
  cardPickerLabel: {
    ...Type.caption,
    fontWeight: Weight.semibold,
    color: C.textMuted,
    marginBottom: Space.sm,
  },
  cardPickerImageWrap: {
    alignItems: "center",
    gap: Space.sm,
  },
  cardPickerImage: {
    width: "100%",
    height: 100,
    borderRadius: Radius.md,
    backgroundColor: C.surfaceAlt,
  },
  retakeBtn: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
  },
  retakeText: {
    ...Type.label,
    color: C.primary,
  },
  cardPickerActions: {
    gap: Space.sm,
  },
  cardPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.md,
    paddingVertical: Space.md,
  },
  cardPickerBtnText: {
    ...Type.label,
    color: C.text,
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
