/**
 * CLAIRITY palette — "warm clinical".
 *
 * Two ideas hold this system together:
 *
 * 1. The interface is warm neutrals only. Sand and cocoa, no decorative brand
 *    hue. `primary` is deliberately the *ink* rather than a colour, which is
 *    what lets a primary button (background `primary`, label `textInverse`)
 *    invert correctly between the two themes instead of needing a second token.
 *
 * 2. Colour is reserved for clinical meaning — danger / warning / success, i.e.
 *    overdue, due soon, up to date. Nothing is tinted for decoration, so a
 *    screen with colour on it is a screen that needs the user. Keep it that way:
 *    if you reach for a hue here for emphasis alone, use weight or spacing
 *    instead.
 *
 * `light` and `dark` MUST keep identical key sets — document-detail.tsx builds
 * a palette key at runtime (`doc${PascalCase(type)}`) and indexes into this, so
 * a key missing from one theme fails silently at the `?? docGeneral` fallback.
 */

const light = {
  // Ink — the primary action colour, not a hue
  primary: "#2A2119",
  primaryDark: "#1B1510",
  primarySoft: "#E9DDC9",
  accent: "#6B5A46",
  accentSoft: "#EFE6D6",

  // Clinical status
  danger: "#B34530",
  dangerSoft: "#F8E3DB",
  success: "#56704E",
  successSoft: "#E4EBDE",
  warning: "#8B610C",
  warningSoft: "#F9ECD3",

  // Warm neutral ramp
  background: "#F2E9DA",
  surface: "#FDF9F1",
  surfaceAlt: "#E9DDC9",
  text: "#2A2119",
  textMuted: "#6B5A46",
  textInverse: "#FDF9F1",
  border: "#E6D9C4",
  borderStrong: "#D9C8AC",

  tint: "#2A2119",
  tabIconDefault: "#A2917B",
  tabIconSelected: "#2A2119",

  shadow: "rgba(42, 33, 25, 0.07)",
  shadowDeep: "rgba(42, 33, 25, 0.16)",
  /** Modal/overlay backdrop. Theme-independent by intent — it dims whatever is behind it. */
  scrim: "rgba(20, 15, 10, 0.45)",

  /*
    Marks drawn ON a dark surface: the health card, the photo viewer, the
    primary button. These were a dozen different rgba(255,255,255,…) alphas
    scattered across five files, which is how a system quietly stops being one.
    Three weights is enough for every use that existed.
  */
  onDark: "#FDF9F1",
  onDarkMuted: "rgba(253,249,241,0.72)",
  onDarkFill: "rgba(253,249,241,0.16)",
  /** Veils over a photo or a live camera, darkest first. */
  scrimHeavy: "rgba(15,11,7,0.96)",
  inkVeil: "rgba(42,33,25,0.82)",
  inkVeilSoft: "rgba(42,33,25,0.62)",


  // Document categories.
  //
  // Ten keys, four meanings — the keys exist because the lookup in
  // document-detail.tsx is dynamic, not because these are ten design decisions:
  //   danger  — results you may need to act on
  //   warning — time-sensitive paperwork
  //   success — medication and immunisation
  //   accent  — everything routine
  docBloodWork: "#BF4A34",
  docPathology: "#BF4A34",
  docImaging: "#7C6B57",
  docConsultation: "#7C6B57",
  docReferral: "#7C6B57",
  docOperative: "#7C6B57",
  docGeneral: "#7C6B57",
  docDischarge: "#A8760F",
  docPrescription: "#56704E",
  docVaccination: "#56704E",
};

/**
 * Dark theme. Not an inversion — the ground is warm cocoa rather than black,
 * and body text is a warm sand rather than white. Pure white on a dark ground
 * reads as harsh at the sizes this app uses.
 */
const dark: typeof light = {
  primary: "#DFD2BD",
  primaryDark: "#F2E9DA",
  primarySoft: "#2F2820",
  accent: "#A5947E",
  accentSoft: "#2A241C",

  danger: "#E88C72",
  dangerSoft: "#3B2018",
  success: "#A0C094",
  successSoft: "#212B1E",
  warning: "#DCA94E",
  warningSoft: "#3A2C14",

  background: "#1B1510",
  surface: "#262019",
  surfaceAlt: "#151009",
  text: "#DFD2BD",
  textMuted: "#A5947E",
  textInverse: "#1B1510",
  border: "#352B21",
  borderStrong: "#453A2D",

  tint: "#DFD2BD",
  tabIconDefault: "#7A6A57",
  tabIconSelected: "#DFD2BD",

  shadow: "rgba(0, 0, 0, 0.5)",
  shadowDeep: "rgba(0, 0, 0, 0.75)",
  scrim: "rgba(0, 0, 0, 0.6)",

  onDark: "#FDF9F1",
  onDarkMuted: "rgba(253,249,241,0.72)",
  onDarkFill: "rgba(253,249,241,0.16)",
  scrimHeavy: "rgba(15,11,7,0.96)",
  inkVeil: "rgba(42,33,25,0.82)",
  inkVeilSoft: "rgba(42,33,25,0.62)",


  docBloodWork: "#E88C72",
  docPathology: "#E88C72",
  docImaging: "#A5947E",
  docConsultation: "#A5947E",
  docReferral: "#A5947E",
  docOperative: "#A5947E",
  docGeneral: "#A5947E",
  docDischarge: "#DCA94E",
  docPrescription: "#A0C094",
  docVaccination: "#A0C094",
};

/** The shape every screen styles against. */
export type Palette = typeof light;

export default { light, dark };
