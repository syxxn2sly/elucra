/**
 * CLAIRITY design tokens.
 *
 * Every spacing, radius, and type value in the app comes from this file.
 * If a screen needs a number that isn't here, the answer is almost always to
 * use the nearest token rather than to add a new one — the whole point is that
 * the set stays small enough to hold in your head.
 */

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
 * Three radii, chosen by role rather than by size:
 * `sm` for inline chips and tags, `md` for every card/button/input surface,
 * `pill` for anything genuinely circular.
 */
export const Radius = {
  sm: 8,
  md: 12,
  pill: 999,
} as const;

/**
 * Four type levels plus a caption. Weight carries hierarchy alongside size —
 * body text is regular, structural text is semibold, and only page titles are
 * bold. Nothing in the app should use 800.
 */
export const Type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "700" },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  label: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
} as const;

export const Weight = {
  regular: "400",
  semibold: "600",
  bold: "700",
} as const;

/**
 * A single elevation step. Cards are separated by a hairline border, not by
 * shadow — the shadow here is reserved for surfaces that genuinely float
 * above the page (sheets, the tab bar).
 */
export const Elevation = {
  raised: {
    shadowColor: "#0F2A3A",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;

/** Minimum touch target. Below this, a control fails accessibility review. */
export const HIT_TARGET = 48;
