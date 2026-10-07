/**
 * tap any attached photo to open it full screen and zoom in.
 *
 * A health card number, a handwritten dose, a lab value in small print: the
 * thumbnail is never enough to check the thing you actually care about, and the
 * whole point of keeping the original alongside the explanation is being able to
 * go and look. Pinch to zoom, drag to pan, double-tap to toggle, tap the close
 * button or the backdrop to leave.
 */

import { Image } from "expo-image";
import { X } from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { type Palette } from "@/constants/colors";
import { useTheme } from "@/lib/theme";
import { HIT_TARGET, Radius, Space, Type } from "@/constants/theme";


const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * A thumbnail that opens its own full-screen viewer.
 *
 * `style` sizes the thumbnail; the viewer always fills the screen.
 */
export function ZoomablePhoto({
  uri,
  style,
  contentFit = "cover",
  accessibilityLabel,
  caption,
}: {
  uri: string;
  style?: object;
  contentFit?: "cover" | "contain";
  accessibilityLabel?: string;
  caption?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? "Open photo full screen"}
      >
        <Image source={{ uri }} style={style} contentFit={contentFit} />
      </Pressable>
      {open ? <PhotoViewer uri={uri} caption={caption} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PhotoViewer({
  uri,
  caption,
  onClose,
}: {
  uri: string;
  caption?: string;
  onClose: () => void;
}) {
  const { C, styles } = useTheme(makeStyles);
  const { width, height } = useWindowDimensions();

  /*
    RN's own Animated rather than Reanimated: Reanimated is not installed here
    and adding it needs a Babel plugin, which is a build-config change this
    feature does not justify. Gesture callbacks are marked runOnJS so they can
    drive these values directly.
  */
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const savedScale = useRef(1);
  const savedX = useRef(0);
  const savedY = useRef(0);

  const spring = useCallback(
    (value: Animated.Value, to: number) =>
      Animated.spring(value, { toValue: to, useNativeDriver: true, friction: 9 }).start(),
    [],
  );

  const reset = useCallback(() => {
    spring(scale, 1);
    spring(translateX, 0);
    spring(translateY, 0);
    savedScale.current = 1;
    savedX.current = 0;
    savedY.current = 0;
  }, [scale, translateX, translateY, spring]);

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onUpdate((event) => {
      const next = Math.min(MAX_SCALE, Math.max(1, savedScale.current * event.scale));
      scale.setValue(next);
    })
    .onEnd(() => {
      // Snap back rather than leaving the picture stranded slightly zoomed out.
      const current = savedScale.current * 1;
      savedScale.current = Math.min(MAX_SCALE, Math.max(1, current));
      // @ts-expect-error -- reading the current value is the simplest way to settle.
      const shown = scale.__getValue() as number;
      if (shown <= 1.02) reset();
      else savedScale.current = shown;
    });

  // Panning only matters once zoomed in; at 1x a drag would slide the picture
  // off screen for no reason.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((event) => {
      if (savedScale.current <= 1) return;
      translateX.setValue(savedX.current + event.translationX);
      translateY.setValue(savedY.current + event.translationY);
    })
    .onEnd(() => {
      if (savedScale.current <= 1) return;
      // @ts-expect-error -- same reason as above.
      savedX.current = translateX.__getValue() as number;
      // @ts-expect-error
      savedY.current = translateY.__getValue() as number;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd(() => {
      if (savedScale.current > 1) {
        reset();
      } else {
        spring(scale, DOUBLE_TAP_SCALE);
        savedScale.current = DOUBLE_TAP_SCALE;
      }
    });

  const gesture = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, pan));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Behind the image, so a tap on empty space closes but a drag on the
            picture still pans. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close photo" />

        <GestureDetector gesture={gesture}>
          <Animated.View style={{ transform: [{ translateX }, { translateY }, { scale }] }}>
            <Image
              source={{ uri }}
              style={{ width, height: height * 0.8 }}
              contentFit="contain"
            />
          </Animated.View>
        </GestureDetector>

        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
        <Text style={styles.hint}>Pinch or double-tap to zoom</Text>

        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
        >
          <X color={C.onDark} size={24} strokeWidth={2.5} />
        </Pressable>
      </View>
    </Modal>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: C.scrimHeavy,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    position: "absolute",
    top: 52,
    right: Space.lg,
    width: HIT_TARGET,
    height: HIT_TARGET,
    borderRadius: Radius.pill,
    backgroundColor: C.onDarkFill,
    alignItems: "center",
    justifyContent: "center",
  },
  caption: {
    position: "absolute",
    bottom: 72,
    left: Space.xl,
    right: Space.xl,
    ...Type.label,
    color: C.onDark,
    textAlign: "center",
  },
  hint: {
    position: "absolute",
    bottom: 40,
    ...Type.caption,
    color: C.onDarkMuted,
  },
});
