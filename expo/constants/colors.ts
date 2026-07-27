/**
 * CLAIRITY palette.
 *
 * One primary (clinical blue), one accent, a neutral gray ramp, and three
 * status colors. Everything else is derived. Category colors below are
 * deliberately NOT ten different hues — see the note above `docGeneral`.
 */

// Brand
const primary = "#075985";
const primaryDark = "#063F62";
const primarySoft = "#E7F0F6";
const accent = "#2F5D8F";
const accentSoft = "#EDF3F9";

// Neutral ramp — warm-tinted gray so the app keeps its calm, paper-like feel
// without the previous parchment/ivory pair muddying white cards.
const background = "#F7F6F4";
const surface = "#FFFFFF";
const surfaceAlt = "#F1EFEC";
const border = "#E2E0DC";
const borderStrong = "#CFCCC7";
const textDark = "#16242E";
const textMuted = "#5E6C77";

// Status
const danger = "#B4232D";
const dangerSoft = "#FBEAEB";
const success = "#176B50";
const successSoft = "#E6F2ED";
const warning = "#8A5310";
const warningSoft = "#FBF0DE";

export default {
  light: {
    primary,
    primaryDark,
    primarySoft,
    accent,
    accentSoft,
    danger,
    dangerSoft,
    success,
    successSoft,
    warning,
    warningSoft,
    background,
    surface,
    surfaceAlt,
    text: textDark,
    textMuted,
    textInverse: "#FFFFFF",
    border,
    borderStrong,
    tint: primary,
    tabIconDefault: "#8A949B",
    tabIconSelected: primary,
    shadow: "rgba(15, 42, 58, 0.06)",
    shadowDeep: "rgba(15, 42, 58, 0.14)",

    // Document categories.
    //
    // These keys are looked up dynamically in document-detail.tsx, so all of
    // them must exist. But ten competing hues made every report screen read
    // like a colour chart, so they now collapse onto four meanings:
    //   danger  — results you may need to act on
    //   warning — time-sensitive paperwork
    //   success — medication and immunisation
    //   accent  — everything routine
    docBloodWork: danger,
    docPathology: danger,
    docImaging: accent,
    docConsultation: accent,
    docReferral: accent,
    docOperative: accent,
    docGeneral: accent,
    docDischarge: warning,
    docPrescription: success,
    docVaccination: success,
  },
};
