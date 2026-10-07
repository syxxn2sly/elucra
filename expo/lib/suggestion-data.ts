/**
 * autocomplete suggestion data.
 * Common medical conditions, medications, allergies, surgeries, and
 * occupations that users can tap instead of typing. Reduces user error
 * and makes onboarding seamless.
 */

import { VACCINE_CATALOG } from "./vaccine-data";

/**
 * Vaccine names for the onboarding chip picker.
 *
 * Derived from VACCINE_CATALOG rather than retyped, so the names a user taps
 * during onboarding are exactly the ones the Vaccines tab tracks — otherwise
 * "Flu shot" and "Influenza (Flu)" become two different records.
 */
export const COMMON_VACCINES: string[] = VACCINE_CATALOG.map((v) => v.name);

export const COMMON_CONDITIONS: string[] = [
  "Type 2 Diabetes",
  "Type 1 Diabetes",
  "High Blood Pressure",
  "High Cholesterol",
  "Heart Disease",
  "Asthma",
  "COPD",
  "Thyroid Disorder",
  "Arthritis",
  "Osteoporosis",
  "Kidney Disease",
  "Liver Disease",
  "Depression",
  "Anxiety",
  "Sleep Apnea",
  "Acid Reflux (GERD)",
  "Anemia",
  "Gout",
  "Glaucoma",
  "Cataracts",
];

export const COMMON_MEDICATIONS: string[] = [
  "Metformin",
  "Atorvastatin",
  "Lisinopril",
  "Amlodipine",
  "Levothyroxine",
  "Metoprolol",
  "Omeprazole",
  "Losartan",
  "Simvastatin",
  "Aspirin",
  "Insulin",
  "Gabapentin",
  "Pantoprazole",
  "Rosuvastatin",
  "Hydrochlorothiazide",
  "Sertraline",
  "Escitalopram",
  "Ramipril",
  "Salbutamol",
  "Warfarin",
  "Clopidogrel",
  "Furosemide",
  "Vitamin D",
  "Calcium",
  "Iron Supplement",
];

export const COMMON_ALLERGIES: string[] = [
  "Penicillin",
  "Amoxicillin",
  "Sulfa Drugs",
  "Aspirin",
  "Ibuprofen",
  "Shellfish",
  "Peanuts",
  "Latex",
  "Iodine",
  "Codeine",
  "Eggs",
  "Milk",
  "Wheat",
  "Soy",
  "Pollen",
  "Dust Mites",
  "Pet Dander",
  "Aspirin",
  "Contrast Dye",
];

export const COMMON_SURGERIES: string[] = [
  "Appendectomy",
  "Knee Replacement",
  "Hip Replacement",
  "Cataract Surgery",
  "Gallbladder Removal",
  "C-Section",
  "Angioplasty",
  "Pacemaker Implantation",
  "Tonsillectomy",
  "Hernia Repair",
  "Heart Bypass",
  "Spinal Fusion",
];

export const COMMON_FAMILY_HISTORY: string[] = [
  "Heart Disease",
  "Diabetes",
  "High Blood Pressure",
  "Cancer",
  "Stroke",
  "Alzheimer's",
  "Asthma",
  "Thyroid Disorder",
  "Kidney Disease",
  "Mental Health",
];

export const OCCUPATION_OPTIONS: string[] = [
  "Retired",
  "Healthcare Worker",
  "Teacher",
  "Office Worker",
  "Construction Worker",
  "Farmer",
  "Driver",
  "Factory Worker",
  "Restaurant Worker",
  "Business Owner",
  "Student",
  "Homemaker",
];

export const SMOKING_OPTIONS: string[] = [
  "Never smoked",
  "Quit smoking",
  "Current smoker",
];

export const ALCOHOL_OPTIONS: string[] = [
  "Don't drink",
  "Rarely (1-2 drinks/month)",
  "Occasionally (1-2 drinks/week)",
  "Regularly (3-5 drinks/week)",
  "Daily",
];
