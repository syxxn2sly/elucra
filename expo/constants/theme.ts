/**
 * CLAIRITY design tokens.
 *
 * Every spacing, radius, and type value in the app comes from this file.
 * If a screen needs a number that isn't here, the answer is almost always to
 * use the nearest token rather than to add a new one — the whole point is that
 * the set stays small enough to hold in your head.
 */

import { Platform } from "react-native";

/** 8px grid. `xs` and `sm` are the only sub-grid steps, for tight inline gaps. */
export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/**
 * Radii by role rather than by size: `sm` for inline chips and tags, `md` for
 * every card, row, button and input, `lg` for the blocks that carry a whole
 * section, `xl` for sheets, `pill` for anything genuinely circular.
 *
 * `md` covers roughly three quarters of all uses, so it is the value that
 * actually sets how soft the app feels.
 */
export const Radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
} as const;

/**
 * Typefaces.
 *
 * Nunito for anything structural and NunitoSans for reading: rounded terminals
 * on headings carry the warmth, while the companion sans keeps body copy calm
 * at small sizes. Both are bundled — see `useFonts` in app/_layout.tsx.
 *
 * IMPORTANT: with a custom font, React Native picks the face by family name,
 * and `fontWeight` is ignored. Weight therefore lives in the family here, and
 * there is deliberately no `Weight` export any more: a leftover
 * `fontWeight: Weight.semibold` would silently render regular.
 */
export const Font = {
  headSemi: "Nunito_600SemiBold",
  headBold: "Nunito_700Bold",
  bodyRegular: "NunitoSans_400Regular",
  bodySemi: "NunitoSans_600SemiBold",
  /** Doses, card numbers and record IDs — anything read against a printed source. */
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) as string,
} as const;

/**
 * Four type levels plus a caption. Hierarchy comes from size and family
 * together — body copy is regular, structural text is semibold, and only page
 * titles are bold.
 */
export const Type = {
  display: { fontFamily: Font.headBold, fontSize: 28, lineHeight: 34 },
  title: { fontFamily: Font.headBold, fontSize: 20, lineHeight: 26 },
  heading: { fontFamily: Font.headSemi, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: Font.bodyRegular, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: Font.bodySemi, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: Font.bodySemi, fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: Font.mono, fontSize: 14, lineHeight: 20 },
} as const;

/**
 * A single elevation step. Cards are separated by a hairline border, not by
 * shadow — the shadow here is reserved for surfaces that genuinely float
 * above the page (sheets, the tab bar).
 */
export const Elevation = {
  raised: {
    shadowColor: "#2A2119",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;

/** Minimum touch target. Below this, a control fails accessibility review. */
export const HIT_TARGET = 48;
