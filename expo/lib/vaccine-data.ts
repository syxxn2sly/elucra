/** CLAIRITY — Vaccine catalog and travel destinations. */

import type { VaccineInfo, TravelDestination } from "./types";

export const VACCINE_CATALOG: VaccineInfo[] = [
  // --- Suggested (age/profile-driven) ---
  {
    id: "flu",
    name: "Influenza (Flu)",
    category: "suggested",
    description:
      "Protects against seasonal influenza, a contagious respiratory illness that can cause fever, cough, and body aches.",
    protectsAgainst: "Seasonal flu",
    cadenceMonths: 12,
    doseCount: 1,
    doseIntervalMonths: null,
    minAge: 6,
    maxAge: null,
  },
  {
    id: "covid",
    name: "COVID-19",
    category: "suggested",
    description:
      "Protects against severe illness, hospitalization, and death from COVID-19 and its variants.",
    protectsAgainst: "COVID-19",
    cadenceMonths: 12,
    doseCount: 2,
    doseIntervalMonths: 1,
    minAge: 6,
    maxAge: null,
  },
  {
    id: "tdap",
    name: "Tetanus, Diphtheria, Pertussis (Tdap)",
    category: "suggested",
    description:
      "Protects against three serious bacterial diseases — tetanus (lockjaw), diphtheria, and whooping cough.",
    protectsAgainst: "Tetanus, diphtheria, pertussis",
    cadenceMonths: 120,
    doseCount: 1,
    doseIntervalMonths: null,
    minAge: 11,
    maxAge: null,
  },
  {
    id: "shingles",
    name: "Shingles (Shingrix)",
    category: "suggested",
    description:
      "Protects against shingles, a painful rash caused by the reactivation of the chickenpox virus in adults.",
    protectsAgainst: "Shingles",
    cadenceMonths: null,
    doseCount: 2,
    doseIntervalMonths: 4,
    minAge: 50,
    maxAge: null,
  },
  {
    id: "pneumococcal",
    name: "Pneumococcal",
    category: "suggested",
    description:
      "Protects against pneumococcal disease, which can cause pneumonia, meningitis, and bloodstream infections.",
    protectsAgainst: "Pneumonia, meningitis",
    cadenceMonths: null,
    doseCount: 1,
    doseIntervalMonths: null,
    minAge: 65,
    maxAge: null,
  },
  {
    id: "rsb",
    name: "RSV",
    category: "suggested",
    description:
      "Protects against respiratory syncytial virus, which can cause serious lung infections especially in older adults.",
    protectsAgainst: "RSV",
    cadenceMonths: null,
    doseCount: 1,
    doseIntervalMonths: null,
    minAge: 60,
    maxAge: null,
  },
  {
    id: "hpv",
    name: "HPV",
    category: "suggested",
    description:
      "Protects against human papillomavirus, which can cause cervical cancer and other cancers later in life.",
    protectsAgainst: "HPV-related cancers",
    cadenceMonths: null,
    doseCount: 3,
    doseIntervalMonths: 6,
    minAge: 9,
    maxAge: 45,
  },

  // --- Popular (recommended for all adults) ---
  {
    id: "mmr",
    name: "Measles, Mumps, Rubella (MMR)",
    category: "popular",
    description:
      "Protects against three highly contagious viral diseases that can cause serious complications.",
    protectsAgainst: "Measles, mumps, rubella",
    cadenceMonths: null,
    doseCount: 2,
    doseIntervalMonths: 1,
    minAge: 12,
    maxAge: null,
  },
  {
    id: "hep_a",
    name: "Hepatitis A",
    category: "popular",
    description:
      "Protects against hepatitis A, a liver disease spread through contaminated food or water.",
    protectsAgainst: "Hepatitis A",
    cadenceMonths: null,
    doseCount: 2,
    doseIntervalMonths: 6,
    minAge: 12,
    maxAge: null,
  },
  {
    id: "hep_b",
    name: "Hepatitis B",
    category: "popular",
    description:
      "Protects against hepatitis B, a serious liver infection spread through blood or body fluids.",
    protectsAgainst: "Hepatitis B",
    cadenceMonths: null,
    doseCount: 3,
    doseIntervalMonths: 6,
    minAge: 0,
    maxAge: null,
  },
  {
    id: "varicella",
    name: "Chickenpox (Varicella)",
    category: "popular",
    description:
      "Protects against chickenpox, a highly contagious disease causing itchy blisters and fever.",
    protectsAgainst: "Chickenpox",
    cadenceMonths: null,
    doseCount: 2,
    doseIntervalMonths: 1,
    minAge: 12,
    maxAge: null,
  },
  {
    id: "meningococcal",
    name: "Meningococcal",
    category: "popular",
    description:
      "Protects against meningococcal disease, a serious bacterial infection that can cause meningitis.",
    protectsAgainst: "Meningitis",
    cadenceMonths: null,
    doseCount: 2,
    doseIntervalMonths: 2,
    minAge: 11,
    maxAge: 25,
  },

  // --- Other (searchable long tail) ---
  {
    id: "typhoid",
    name: "Typhoid",
    category: "other",
    description:
      "Protects against typhoid fever, a life-threatening illness spread through contaminated food and water.",
    protectsAgainst: "Typhoid fever",
    cadenceMonths: 24,
    doseCount: 1,
    doseIntervalMonths: null,
    minAge: 2,
    maxAge: null,
  },
  {
    id: "yellow_fever",
    name: "Yellow Fever",
    category: "other",
    description:
      "Protects against yellow fever, a mosquito-borne viral disease found in tropical regions of Africa and South America.",
    protectsAgainst: "Yellow fever",
    cadenceMonths: null,
    doseCount: 1,
    doseIntervalMonths: null,
    minAge: 9,
    maxAge: null,
  },
  {
    id: "japanese_encephalitis",
    name: "Japanese Encephalitis",
    category: "other",
    description:
      "Protects against Japanese encephalitis, a mosquito-borne viral infection common in rural Asia.",
    protectsAgainst: "Japanese encephalitis",
    cadenceMonths: null,
    doseCount: 2,
    doseIntervalMonths: 1,
    minAge: 2,
    maxAge: null,
  },
  {
    id: "rabies",
    name: "Rabies",
    category: "other",
    description:
      "Protects against rabies, a deadly viral disease spread through animal bites.",
    protectsAgainst: "Rabies",
    cadenceMonths: null,
    doseCount: 3,
    doseIntervalMonths: 1,
    minAge: 0,
    maxAge: null,
  },
  {
    id: "cholera",
    name: "Cholera",
    category: "other",
    description:
      "Protects against cholera, an intestinal infection spread through contaminated water.",
    protectsAgainst: "Cholera",
    cadenceMonths: 24,
    doseCount: 2,
    doseIntervalMonths: 1,
    minAge: 2,
    maxAge: null,
  },
];

export const TRAVEL_DESTINATIONS: TravelDestination[] = [
  {
    id: "india",
    country: "India",
    flag: "🇮🇳",
    vaccineIds: ["hep_a", "typhoid", "hep_b", "covid", "flu"],
  },
  {
    id: "pakistan",
    country: "Pakistan",
    flag: "🇵🇰",
    vaccineIds: ["hep_a", "typhoid", "hep_b", "polio", "covid"],
  },
  {
    id: "bangladesh",
    country: "Bangladesh",
    flag: "🇧🇩",
    vaccineIds: ["hep_a", "typhoid", "hep_b", "japanese_encephalitis", "covid"],
  },
  {
    id: "nigeria",
    country: "Nigeria",
    flag: "🇳🇬",
    vaccineIds: ["yellow_fever", "hep_a", "typhoid", "meningococcal", "covid"],
  },
  {
    id: "brazil",
    country: "Brazil",
    flag: "🇧🇷",
    vaccineIds: ["yellow_fever", "hep_a", "typhoid", "covid"],
  },
  {
    id: "thailand",
    country: "Thailand",
    flag: "🇹🇭",
    vaccineIds: ["hep_a", "typhoid", "japanese_encephalitis", "covid"],
  },
  {
    id: "mexico",
    country: "Mexico",
    flag: "🇲🇽",
    vaccineIds: ["hep_a", "typhoid", "covid"],
  },
  {
    id: "indonesia",
    country: "Indonesia",
    flag: "🇮🇩",
    vaccineIds: ["hep_a", "typhoid", "japanese_encephalitis", "covid"],
  },
  {
    id: "kenya",
    country: "Kenya",
    flag: "🇰🇪",
    vaccineIds: ["yellow_fever", "hep_a", "typhoid", "covid"],
  },
  {
    id: "philippines",
    country: "Philippines",
    flag: "🇵🇭",
    vaccineIds: ["hep_a", "typhoid", "japanese_encephalitis", "covid"],
  },
];

// Add polio to catalog for travel
VACCINE_CATALOG.push({
  id: "bcg",
  name: "Tuberculosis (BCG)",
  category: "other",
  description:
    "Protects against severe tuberculosis. Given routinely in many countries but not in Canada, so most people vaccinated abroad. Separate from the TB skin or blood test, which checks for infection rather than preventing it.",
  protectsAgainst: "Tuberculosis",
  cadenceMonths: null,
  doseCount: 1,
  doseIntervalMonths: null,
  minAge: 0,
  maxAge: null,
});

VACCINE_CATALOG.push({
  id: "polio",
  name: "Polio",
  category: "other",
  description:
    "Protects against polio, a crippling and potentially deadly infectious disease.",
  protectsAgainst: "Polio",
  cadenceMonths: null,
  doseCount: 3,
  doseIntervalMonths: 2,
  minAge: 6,
  maxAge: null,
});
