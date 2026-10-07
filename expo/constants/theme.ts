// design tokens. every spacing, radius and type value comes from here.
// if a screen needs a number that isn't here, use the nearest token rather
// than adding one — the set is meant to stay small.

import { Platform } from "react-native";

/** 8px grid. xs and sm are the only sub-grid steps, for tight inline gaps. */
export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

// radii by role, not size: sm for chips and tags, md for cards, rows,
// buttons and inputs, lg for section blocks, xl for sheets, pill for circles.
// md covers most uses, so it's the value that sets how soft the app looks.
export const Radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
} as const;

// Nunito for headings, NunitoSans for body. both bundled — see useFonts in
// app/_layout.tsx.
//
// gotcha: with a custom font React Native picks the face by family name and
// ignores fontWeight. weight lives in the family name here, and there is no
// Weight export on purpose — a leftover fontWeight would silently render
// regular.
export const Font = {
  headSemi: "Nunito_600SemiBold",
  headBold: "Nunito_700Bold",
  bodyRegular: "NunitoSans_400Regular",
  bodySemi: "NunitoSans_600SemiBold",
  /** doses, card numbers, record IDs — anything read against a printed source. */
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) as string,
} as const;

// four levels plus a caption. hierarchy comes from size and family together:
// body is regular, structural text semibold, only page titles bold.
export const Type = {
  display: { fontFamily: Font.headBold, fontSize: 28, lineHeight: 34 },
  title: { fontFamily: Font.headBold, fontSize: 20, lineHeight: 26 },
  heading: { fontFamily: Font.headSemi, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: Font.bodyRegular, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: Font.bodySemi, fontSize: 15, lineHeight: 20 },
  /**
   * 14, not 13. carries dates, reference ranges, citations and disclaimers —
   * the text an older reader is most likely to squint at, used in ~130 places.
   * 14 is the floor for secondary text; smaller needs a stated reason.
   */
  caption: { fontFamily: Font.bodySemi, fontSize: 14, lineHeight: 19 },
  mono: { fontFamily: Font.mono, fontSize: 14, lineHeight: 20 },
} as const;

// one elevation step. cards are separated by a hairline border, not shadow.
// this is only for surfaces that actually float: sheets and the tab bar.
export const Elevation = {
  raised: {
    shadowColor: "#2A2119",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;

/** minimum touch target. below this a control fails accessibility review. */
export const HIT_TARGET = 48;
