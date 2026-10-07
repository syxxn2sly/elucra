// light/dark wiring.
//
// the palettes live in constants/colors.ts. this is the part that picks one and
// makes a screen re-render when the system theme changes.
//
// screens used to bind `const C = Colors.light` at module scope and build their
// StyleSheet next to it. that happens once, at import, so nothing could react to
// a theme change — which is why a complete dark palette sat unused. styles are
// now built per palette instead: a screen declares `makeStyles(C)` at module
// scope and calls `useTheme(makeStyles)` inside the component.

import { useMemo } from "react";
import { useColorScheme } from "react-native";

import Colors, { type Palette } from "@/constants/colors";

/** the palette for the current system theme. */
export function usePalette(): Palette {
  return useColorScheme() === "dark" ? Colors.dark : Colors.light;
}

/**
 * palette plus the stylesheet built from it.
 *
 * `make` must be defined at module scope so its identity is stable — passing an
 * inline arrow rebuilds the StyleSheet every render.
 */
export function useTheme<T>(make: (C: Palette) => T): { C: Palette; styles: T } {
  const C = usePalette();
  const styles = useMemo(() => make(C), [C, make]);
  return { C, styles };
}
