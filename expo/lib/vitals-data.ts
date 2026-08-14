/**
 * CLAIRITY — what each vital is, and how it is written down.
 *
 * Units are Canadian throughout: mmol/L for glucose, °C for temperature, kg for
 * weight. This is not cosmetic — a glucose of 5.5 is unremarkable in mmol/L and
 * implausible in mg/dL, so getting the unit wrong would make every reading
 * meaningless to whoever reads it.
 *
 * The reference ranges below are shown as *reference*, never as a verdict.
 * CLAIRITY records what you measured; deciding whether a number is a problem is
 * a clinician's job, and an app that colours a reading red is making a call it
 * has no business making from a single measurement taken who-knows-how.
 */

import type { VitalKind } from "./types";

export interface VitalDefinition {
  kind: VitalKind;
  label: string;
  unit: string;
  /** Two inputs rather than one. Only blood pressure. */
  paired?: { firstLabel: string; secondLabel: string };
  /** Plain-language reference, shown as context and nothing more. */
  reference: string;
  /** Rejects a typo before it becomes a data point. Generous on purpose. */
  min: number;
  max: number;
  /** Whole numbers, or one decimal place. */
  decimals: 0 | 1;
  placeholder: string;
}

export const VITAL_DEFINITIONS: VitalDefinition[] = [
  {
    kind: "bloodPressure",
    label: "Blood pressure",
    unit: "mmHg",
    paired: { firstLabel: "Systolic (top)", secondLabel: "Diastolic (bottom)" },
    reference: "Often quoted as around 120/80, but what is right for you depends on your history.",
    min: 40,
    max: 260,
    decimals: 0,
    placeholder: "120",
  },
  {
    kind: "heartRate",
    label: "Heart rate",
    unit: "bpm",
    reference: "Resting is commonly 60–100, and lower in people who train regularly.",
    min: 20,
    max: 250,
    decimals: 0,
    placeholder: "72",
  },
  {
    kind: "bloodGlucose",
    label: "Blood glucose",
    unit: "mmol/L",
    reference: "Fasting is commonly 4.0–7.0. Readings after eating are expected to be higher.",
    min: 1,
    max: 40,
    decimals: 1,
    placeholder: "5.4",
  },
  {
    kind: "oxygenSaturation",
    label: "Oxygen saturation",
    unit: "%",
    reference: "Usually 95–100 at rest, and lower in some long-term lung conditions.",
    min: 50,
    max: 100,
    decimals: 0,
    placeholder: "98",
  },
  {
    kind: "weight",
    label: "Weight",
    unit: "kg",
    reference: "Recorded so you and your clinician can see the direction of travel over time.",
    min: 1,
    max: 400,
    decimals: 1,
    placeholder: "68.5",
  },
  {
    kind: "temperature",
    label: "Temperature",
    unit: "°C",
    reference: "Around 36.5–37.5 is typical. A fever is usually considered 38.0 or above.",
    min: 30,
    max: 45,
    decimals: 1,
    placeholder: "36.8",
  },
];

export function vitalDefinition(kind: VitalKind): VitalDefinition {
  // Every kind in the union has an entry; the fallback keeps the return type
  // non-nullable so callers do not each need a guard.
  return VITAL_DEFINITIONS.find((definition) => definition.kind === kind) ?? VITAL_DEFINITIONS[0];
}

/** How a reading reads on a row: "120/80 mmHg", "5.4 mmol/L". */
export function formatVital(reading: {
  kind: VitalKind;
  value: number | null;
  systolic: number | null;
  diastolic: number | null;
}): string {
  const definition = vitalDefinition(reading.kind);
  if (definition.paired) {
    if (reading.systolic === null || reading.diastolic === null) return "—";
    return `${reading.systolic}/${reading.diastolic} ${definition.unit}`;
  }
  if (reading.value === null) return "—";
  return `${reading.value.toFixed(definition.decimals)} ${definition.unit}`;
}
