const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    /*
      The palette is only a system if nothing goes around it.

      This was not theoretical: an audit found Tailwind's teal-600 behind the
      health-card security icon in three places, and Tailwind's red-500 behind
      the home alert icon — two hues that appear nowhere in colors.ts, in an app
      whose palette explicitly reserves colour for clinical meaning. Nothing
      failed, nothing looked obviously wrong, and they had been there for
      months.

      Colour belongs in constants/colors.ts, spacing and radius in theme.ts.
      Where a literal is genuinely correct — the splash background has to match
      the native launch screen byte for byte or the handover flickers — disable
      this rule on that line and say why.
    */
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/^\\s*(#[0-9A-Fa-f]{3,8}|rgba?\\s*\\()/]",
          message:
            "Colour literals bypass the palette. Use a token from constants/colors.ts (C.primary, C.dangerSoft, C.scrim…). If a raw value is genuinely required, disable this rule on the line and explain why.",
        },
      ],
    },
  },
]);
