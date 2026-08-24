/**
 * CLAIRITY — the launch animation.
 *
 * The native splash is a still image and cannot animate, so it is configured to
 * show the mark small and centred on the same cream this screen uses. This
 * component then takes over on the identical background, which means the
 * handover is invisible: the mark appears to settle rather than the app appearing
 * to restart.
 *
 * Deliberately brief. A launch animation is a first impression, not an
 * interlude — anything long enough to admire is long enough to resent on the
 * twentieth open.
 */

import { Image } from "expo-image";
import React, { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { Font, Space, Type } from "@/constants/theme";

const C = Colors.light;

/** Matches the native splash background exactly, or the handover flickers. */
const SPLASH_BACKGROUND = "#FAF6F0";

const MARK_SIZE = 132;

/** Sum of the sequence below. Kept beside it so the deadline cannot drift. */
const TOTAL_DURATION_MS = 520 + 280 + 240 + 320;

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const markOpacity = useRef(new Animated.Value(0)).current;
  const markScale = useRef(new Animated.Value(0.88)).current;
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  const finish = useCallback(() => onFinish(), [onFinish]);

  useEffect(() => {
    const run = Animated.sequence([
      // The mark settles in, rather than popping.
      Animated.parallel([
        Animated.timing(markOpacity, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(markScale, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(wordmarkOpacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(240),
      // Fade the whole thing, so whatever is underneath is already laid out and
      // does not have to animate in behind it.
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 320,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    run.start(({ finished }) => {
      if (finished) finish();
    });

    /*
      A hard deadline, independent of the animation.

      This overlay covers the whole app, so "the animation did not call back" has
      to be survivable rather than fatal — and it happened: the sequence stalled
      and left the splash sitting at full opacity over a fully rendered screen,
      with no way past it. An animation callback is not a guarantee. It can be
      dropped when the app backgrounds mid-sequence, and on react-native-web the
      native driver does not always deliver one at all.

      Set comfortably past the animation's own length so it never truncates a
      run that is working.
    */
    const deadline = setTimeout(finish, TOTAL_DURATION_MS + 400);

    return () => {
      clearTimeout(deadline);
      run.stop();
      finish();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[styles.overlay, { opacity: overlayOpacity }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.center}>
        <Animated.View style={{ opacity: markOpacity, transform: [{ scale: markScale }] }}>
          <Image
            source={require("../assets/images/splash-icon.png")}
            style={styles.mark}
            contentFit="contain"
          />
        </Animated.View>
        <Animated.View style={{ opacity: wordmarkOpacity }}>
          <Text style={styles.wordmark}>ELUCI</Text>
          <Text style={styles.tagline}>Your medical documents, made clear</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SPLASH_BACKGROUND,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  center: { alignItems: "center" },
  mark: { width: MARK_SIZE, height: MARK_SIZE },
  wordmark: {
    ...Type.display,
    fontFamily: Font.headBold,
    color: C.text,
    letterSpacing: 3,
    textAlign: "center",
    marginTop: Space.xl,
  },
  tagline: {
    ...Type.caption,
    color: C.textMuted,
    textAlign: "center",
    marginTop: Space.xs,
  },
});
