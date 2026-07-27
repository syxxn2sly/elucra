/**
 * Screen padding helpers.
 *
 * Nothing in the app should hardcode a bottom padding. Devices with a home
 * indicator (every recent iPhone) reserve ~34pt at the bottom of the screen,
 * and tab screens additionally sit above the tab bar — content that ignores
 * both gets clipped or hidden behind the bar.
 */

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Space } from "@/constants/theme";

/** Must match TAB_BAR_CONTENT_HEIGHT in app/(tabs)/_layout.tsx. */
export const TAB_BAR_CONTENT_HEIGHT = 56;

/**
 * Bottom padding for a scroll view on a screen pushed onto the stack.
 * Clears the home indicator and leaves a comfortable gap after the content.
 */
export function useStackScrollPadding(extra: number = Space.xl) {
  const insets = useSafeAreaInsets();
  return insets.bottom + extra;
}

/**
 * Bottom padding for a scroll view inside the tab navigator.
 * Clears the tab bar *and* the home indicator underneath it.
 */
export function useTabScrollPadding(extra: number = Space.xl) {
  const insets = useSafeAreaInsets();
  // Mirror the tab bar's own height math in app/(tabs)/_layout.tsx, which keeps
  // a minimum bottom gap so labels never clip on web (inset 0).
  const bottomGap = Math.max(insets.bottom, Space.sm);
  return TAB_BAR_CONTENT_HEIGHT + bottomGap + extra;
}
