// document Simplification flow (capture → AI analysis → result)
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { FileText, Camera, Image as ImageIcon, Sparkles, AlertCircle, ShieldCheck, X, RefreshCw } from "lucide-react-native";
import React, { useState, useCallback, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import Colors from "@/constants/colors";
import { Elevation, HIT_TARGET, Radius, Space, Type } from "@/constants/theme";
import { useStackScrollPadding } from "@/lib/layout";
import { useClairity } from "@/lib/store";
import { analyzeDocument } from "@/lib/ai-service";
import { prepareForUpload } from "@/lib/resize-for-upload";
import { generateId, notify } from "@/lib/utils";
import {
  TRANSLATION_LANGUAGES,
  languageLabel,
  translateSimplification,
} from "@/lib/translate";
import { PrimaryButton, SecondaryButton, Card, ScreenHeader } from "@/components/ui";
import type { SavedDocument, SimplificationResult } from "@/lib/types";

const C = Colors.light;

type Phase = "capture" | "analyzing" | "error";

/**
 * Turn anything a `catch` can receive into a sentence worth showing.
 *
 * Not every rejection is an Error: a native module can reject with a plain
 * `{ code, message }` object, and those used to collapse into a generic
 * "Something went wrong", which hid the actual cause. Anything with a usable
 * message wins; a bare object is serialized rather than stringified, because
 * `String({})` is "[object Object]" and tells nobody anything.
 */
function describeThrown(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err.trim();

  if (err && typeof err === "object") {
    const rec = err as Record<string, unknown>;
    const message = typeof rec.message === "string" ? rec.message.trim() : "";
    const code = typeof rec.code === "string" ? rec.code : "";
    if (message) return code ? `${message} (${code})` : message;
    try {
      const json = JSON.stringify(err);
      if (json && json !== "{}") return `Something went wrong: ${json}`;
    } catch {
      // Circular or otherwise unserializable — fall through to the label below.
    }
    const label = rec.constructor && typeof rec.constructor === "function" ? rec.constructor.name : "object";
    return `Something went wrong (unrecognised ${label}). Please try again.`;
  }

  return `Something went wrong (${String(err)}). Please try again.`;
}

export default function SimplifyScreen() {
  const insets = useSafeAreaInsets();
  const scrollPadding = useStackScrollPadding();
  const { profile, addDocument, preferredLanguage, savePreferredLanguage } = useClairity();
  const [phase, setPhase] = useState<Phase>("capture");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [progressText, setProgressText] = useState("Reading your document…");
  const [language, setLanguage] = useState<string>(preferredLanguage);
  const scrollRef = useRef<ScrollView>(null);

  const handleCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setErrorMsg("Camera permission is needed to photograph documents. You can grant it in Settings.");
      setPhase("error");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      await processDocument(result.assets[0].uri);
    }
  }, []);

  const handleGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      await processDocument(result.assets[0].uri);
    }
  }, []);

  const handleFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ["application/pdf", "image/*"],
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const isPdf = asset.mimeType === "application/pdf" || Boolean(asset.name?.toLowerCase().endsWith(".pdf"));
        const uri = asset.uri;
        // A PDF has no thumbnail to show on the analysing screen, and setting it
        // as the preview would render a broken image.
        setImageUri(isPdf ? null : uri);
        await processDocument(uri, isPdf ? "application/pdf" : asset.mimeType);
      }
    } catch (err) {
      console.error("[ELUCRA] Document pick error:", err);
      setErrorMsg("Couldn't open that file. Please try a photo instead.");
      setPhase("error");
    }
  }, []);

  const processDocument = useCallback(
    async (uri: string, sourceMimeType?: string) => {
      setPhase("analyzing");
      setProgressText("Preparing your document…");

      try {
        setProgressText("Reading the text in your document…");
        const { base64, mimeType } = await prepareForUpload(uri, sourceMimeType);

        setProgressText("Understanding what it means in plain English…");
        const englishResult = await analyzeDocument({
          imageBase64: base64,
          mimeType,
          profile: profile as never,
        });

        // Translate only after the English has been extracted and verified.
        // Doing it earlier would mean the safety checks ran against a
        // machine-rewritten source. If translation fails we still have a
        // perfectly good English analysis, so keep it rather than losing the
        // whole document to a translation error.
        let result = englishResult;
        let originalResult: SimplificationResult | undefined;

        if (language !== "en") {
          setProgressText(`Translating into ${languageLabel(language)}…`);
          try {
            result = await translateSimplification(englishResult, language);
            originalResult = englishResult;
          } catch (translationError) {
            // The analysis itself succeeded, so keep it rather than throwing the
            // document away — but say so plainly, because the user asked for
            // another language and is about to be shown English.
            const reason =
              translationError instanceof Error ? translationError.message : "Translation failed.";
            console.warn("[ELUCRA] Translation failed, keeping English:", reason);
            notify(
              `Could not translate into ${languageLabel(language)}`,
              `${reason}\n\nYour document has been saved in English.`,
            );
          }
        }

        const doc: SavedDocument = {
          id: generateId(),
          result,
          imageUri: uri,
          createdAt: new Date().toISOString(),
          language: originalResult ? language : "en",
          originalResult,
        };
        addDocument(doc);

        router.replace({ pathname: "/document-detail", params: { id: doc.id } });
      } catch (err) {
        // Not everything thrown is an Error — a rejected native module can hand
        // back a plain object, and reporting those as "Something went wrong"
        // hid the real cause. Keep a readable sentence for the user, but never
        // discard what was actually thrown.
        const msg = describeThrown(err);
        console.error("[ELUCRA] Analysis error:", err);
        setErrorMsg(msg);
        setPhase("error");
      }
    },
    [profile, addDocument, language],
  );

  const reset = useCallback(() => {
    setPhase("capture");
    setImageUri(null);
    setErrorMsg("");
  }, []);

  // --- Analyzing phase ---
  if (phase === "analyzing") {
    return (
      // Analysis is a network round-trip that can hang. Without a header this
      // phase had no exit at all, so a stalled request trapped the user.
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScreenHeader title="Analyzing" onBack={reset} />
        <View style={styles.centerContent}>
          <View style={styles.analyzingCard}>
            {imageUri ? (
              <View style={styles.analyzingImageWrap}>
                <Image source={{ uri: imageUri }} style={styles.analyzingImage} contentFit="contain" />
                <View style={styles.analyzingOverlay}>
                  <ActivityIndicator size="large" color={C.textInverse} />
                </View>
              </View>
            ) : null}
            <View style={styles.analyzingIconWrap}>
              <Sparkles color={C.primary} size={28} strokeWidth={2.5} />
            </View>
            <Text style={styles.analyzingTitle}>Analyzing your document</Text>
            <Text style={styles.analyzingSub}>{progressText}</Text>
            <View style={styles.analyzingDots}>
              <View style={[styles.dot, styles.dotActive]} />
              <View style={[styles.dot, styles.dotActive]} />
              <View style={[styles.dot, styles.dotPulse]} />
            </View>
            <Text style={styles.analyzingHint}>This usually takes 15–30 seconds</Text>
          </View>
        </View>
      </View>
    );
  }

  // --- Error phase ---
  if (phase === "error") {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScreenHeader title="Understand a document" />
        <View style={styles.centerContent}>
          <View style={styles.errorCard}>
            <View style={styles.errorIconWrap}>
              <AlertCircle color={C.danger} size={36} strokeWidth={2.5} />
            </View>
            <Text style={styles.errorTitle}>Couldn&apos;t analyze that</Text>
            <Text style={styles.errorMsg}>{errorMsg}</Text>
            <PrimaryButton
              label="Try Again"
              onPress={reset}
              icon={<RefreshCw color={C.textInverse} size={20} strokeWidth={2.5} />}
              style={{ marginTop: 24, width: "100%" }}
            />
            {/* The error state previously offered only a retry, which left no
                route out if the document simply could not be read. */}
            <SecondaryButton
              label="Go back"
              onPress={() => router.back()}
              style={{ marginTop: 12, width: "100%" }}
            />
          </View>
        </View>
      </View>
    );
  }

  // --- Capture phase ---
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Understand a document" />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: scrollPadding, flexGrow: 1 }}
      >
        <Text style={styles.subtitle}>
          Photograph, scan, or upload a medical document. ELUCRA will read it and explain it in
          plain language: what it means, what to do, and when to worry.
        </Text>

        {/* Language is chosen before capture, not after: it changes what the
            result screen shows, and asking afterwards would mean re-running the
            translation on a document the user is already reading. */}
        <Text style={styles.languageLabel}>Explain it in</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.languageRow}
        >
          {TRANSLATION_LANGUAGES.map((lang) => {
            const selected = lang.code === language;
            return (
              <Pressable
                key={lang.code}
                onPress={() => {
                  setLanguage(lang.code);
                  savePreferredLanguage(lang.code);
                }}
                style={[styles.languageChip, selected && styles.languageChipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={lang.english}
              >
                <Text style={[styles.languageChipText, selected && styles.languageChipTextOn]}>
                  {lang.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {language !== "en" ? (
          <Text style={styles.languageNote}>
            The English version is kept too, so you can always check it against the original.
          </Text>
        ) : null}

        {/* Preview if image selected */}
        {imageUri && (
          <View style={styles.previewWrap}>
            <Image source={{ uri: imageUri }} style={styles.preview} contentFit="contain" />
            <Pressable onPress={() => setImageUri(null)} style={styles.previewClose}>
              <X color={C.textInverse} size={18} strokeWidth={2.5} />
            </Pressable>
          </View>
        )}

        {/* Capture options */}
        <View style={styles.options}>
          <CaptureOption
            icon={<Camera color={C.primary} size={30} strokeWidth={2.5} />}
            iconBg={C.primarySoft}
            title="Take a Photo"
            sub="Use your camera to photograph a document"
            onPress={handleCamera}
          />
          <CaptureOption
            icon={<ImageIcon color={C.accent} size={30} strokeWidth={2.5} />}
            iconBg={C.accentSoft}
            title="Pick from Gallery"
            sub="Choose a photo or screenshot from your phone"
            onPress={handleGallery}
          />
          <CaptureOption
            icon={<FileText color={C.docConsultation} size={30} strokeWidth={2.5} />}
            iconBg={C.accentSoft}
            title="Upload a File"
            sub="Pick a PDF or image from your files"
            onPress={handleFile}
          />
        </View>

        {/* What you'll get */}
        <View style={styles.expectCard}>
          <View style={styles.expectHeader}>
            <View style={styles.expectIconWrap}>
              <Sparkles color={C.primary} size={18} strokeWidth={2.5} />
            </View>
            <Text style={styles.expectTitle}>What you'll get</Text>
          </View>
          <ExpectItem text="Plain-English explanation of what the document means" />
          <ExpectItem text="An action checklist, in priority order" />
          <ExpectItem text="A recovery timeline" />
          <ExpectItem text="Warning signs that need immediate care" />
          <ExpectItem text="Things to say, in sixteen languages" />
        </View>

        {/* Privacy note */}
        <View style={styles.privacyNote}>
          <ShieldCheck color={C.textMuted} size={18} strokeWidth={2.5} />
          <Text style={styles.privacyText}>
            Your document is sent securely to our AI for analysis. It is not stored on any server.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function CaptureOption({
  icon,
  iconBg,
  title,
  sub,
  onPress,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.captureOpt, pressed && styles.pressed]}
    >
      <View style={[styles.captureIcon, { backgroundColor: iconBg }]}>{icon}</View>
      <View style={styles.captureText}>
        <Text style={styles.captureTitle}>{title}</Text>
        <Text style={styles.captureSub}>{sub}</Text>
      </View>
    </Pressable>
  );
}

function ExpectItem({ text }: { text: string }) {
  return (
    <View style={styles.expectItem}>
      <View style={styles.expectDot} />
      <Text style={styles.expectText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Space.xl,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    marginTop: Space.lg,
  },
  titleIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Type.display,
    color: C.text,
  },
  subtitle: {
    ...Type.body,
    color: C.textMuted,
    marginTop: Space.md,
    marginBottom: Space.lg,
  },
  // Language
  languageLabel: {
    ...Type.label,
    color: C.text,
    marginBottom: Space.sm,
  },
  languageRow: {
    gap: Space.sm,
    paddingBottom: Space.sm,
  },
  languageChip: {
    minHeight: HIT_TARGET,
    justifyContent: "center",
    paddingHorizontal: Space.lg,
    borderRadius: Radius.pill,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  languageChipOn: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  languageChipText: {
    ...Type.label,
    color: C.text,
  },
  languageChipTextOn: {
    color: C.textInverse,
  },
  languageNote: {
    ...Type.caption,
    color: C.textMuted,
    marginBottom: Space.lg,
  },
  // Preview
  previewWrap: {
    position: "relative",
    marginBottom: Space.lg,
  },
  preview: {
    width: "100%",
    height: 200,
    borderRadius: Radius.md,
    backgroundColor: C.surface,
  },
  previewClose: {
    position: "absolute",
    top: Space.sm,
    right: Space.sm,
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    backgroundColor: C.scrim,
    alignItems: "center",
    justifyContent: "center",
  },
  // Options
  options: {
    gap: Space.md,
  },
  captureOpt: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.lg,
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    padding: Space.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  captureIcon: {
    width: 60,
    height: 60,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  captureText: {
    flex: 1,
  },
  captureTitle: {
    ...Type.heading,
    color: C.text,
  },
  captureSub: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: Space.xs,
  },
  // Expect card
  expectCard: {
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    padding: Space.lg,
    marginTop: Space.xl,
    borderWidth: 1,
    borderColor: C.border,
  },
  expectHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    marginBottom: Space.lg,
  },
  expectIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  expectTitle: {
    ...Type.heading,
    color: C.text,
  },
  expectItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Space.md,
    marginBottom: Space.md,
  },
  expectDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: C.primary,
    marginTop: Space.sm,
  },
  expectText: {
    flex: 1,
    ...Type.body,
    color: C.text,
  },
  // Privacy
  privacyNote: {
    marginTop: Space.lg,
    backgroundColor: C.primarySoft,
    borderRadius: Radius.md,
    padding: Space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
  },
  privacyText: {
    flex: 1,
    ...Type.caption,
    color: C.textMuted,
  },
  // Analyzing — a focal, dialog-like card; deliberately elevated.
  analyzingCard: {
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    padding: Space.xl,
    width: "100%",
    ...Elevation.raised,
  },
  analyzingImageWrap: {
    width: "100%",
    borderRadius: Radius.md,
    marginBottom: Space.xl,
    overflow: "hidden",
    position: "relative",
  },
  analyzingImage: {
    width: "100%",
    height: 180,
    backgroundColor: C.surfaceAlt,
  },
  analyzingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.scrim,
    alignItems: "center",
    justifyContent: "center",
  },
  analyzingIconWrap: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.lg,
  },
  analyzingTitle: {
    ...Type.title,
    color: C.text,
  },
  analyzingSub: {
    ...Type.body,
    color: C.textMuted,
    textAlign: "center",
    marginTop: Space.md,
  },
  analyzingDots: {
    flexDirection: "row",
    gap: Space.sm,
    marginTop: Space.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
  },
  dotActive: {
    backgroundColor: C.primary,
  },
  dotPulse: {
    backgroundColor: C.primary,
    opacity: 0.5,
  },
  analyzingHint: {
    ...Type.caption,
    color: C.textMuted,
    marginTop: Space.md,
    opacity: 0.7,
  },
  // Error — focal, dialog-like card; deliberately elevated.
  errorCard: {
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    padding: Space.xl,
    width: "100%",
    ...Elevation.raised,
  },
  errorIconWrap: {
    width: 72,
    height: 72,
    borderRadius: Radius.pill,
    backgroundColor: C.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.lg,
  },
  errorTitle: {
    ...Type.title,
    color: C.text,
  },
  errorMsg: {
    ...Type.body,
    color: C.textMuted,
    textAlign: "center",
    marginTop: Space.md,
  },
});
