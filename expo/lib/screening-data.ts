/**
 * CLAIRITY — routine screening in Canada.
 *
 * A curated local dataset, in the spirit of VACCINE_CATALOG, rather than a live
 * feed. There is no Canadian screening API; the guidance lives in CTFPHC
 * statements and thirteen provincial programs that do not agree with each other.
 *
 * Every age and interval below was read off the cited page on the date recorded.
 * These numbers are the whole feature — a wrong one sends someone for a test
 * their program does not offer, or worse, reassures them out of one it does.
 *
 * Deliberately absent: any notion of being "due". CLAIRITY does not know when
 * you were last screened, what your family history means, or what your clinician
 * has already decided. It reports what a program generally offers at a given
 * age, and says to ask. That is the line the roadmap's Risk section draws.
 *
 * US sources are not used for timing. MyHealthfinder states US ages inline (it
 * puts colorectal screening at 45; Canada says 50), so it appears here only as
 * an optional outbound link about what a test involves, marked as US.
 */

export const PROVINCES = [
  { code: "BC", name: "British Columbia" },
  { code: "AB", name: "Alberta" },
  { code: "SK", name: "Saskatchewan" },
  { code: "MB", name: "Manitoba" },
  { code: "ON", name: "Ontario" },
  { code: "QC", name: "Quebec" },
  { code: "NB", name: "New Brunswick" },
  { code: "NS", name: "Nova Scotia" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "YT", name: "Yukon" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
] as const;

export type ProvinceCode = (typeof PROVINCES)[number]["code"];

/**
 * Who a screening applies to.
 *
 * Anatomy, not gender identity. The profile asks gender because that is the
 * respectful thing to ask; screening depends on which organs a person has, and
 * the two are not the same question. Anything other than "everyone" is offered
 * as "this applies if you have X", never asserted from the gender field.
 */
export type ScreeningAppliesTo = "everyone" | "cervix" | "breasts";

export interface ScreeningRule {
  startAge: number;
  /** null where the program sets no upper bound. */
  stopAge: number | null;
  /** Plain words, because the real intervals are not all a single number. */
  interval: string;
  /**
   * The same interval as a number, for working out when the next one lands.
   *
   * Where a programme states a range ("every 2 to 3 years") this is the longer
   * end. Telling someone they are late when their own programme would still
   * call them on time is the worse of the two errors.
   */
  intervalMonths: number | null;
  note?: string;
}

export interface Screening {
  id: string;
  label: string;
  /** Written for this app. Never lifted from a US source. */
  what: string;
  appliesTo: ScreeningAppliesTo;
  /** Used when the province is unknown, or has no entry below. */
  national: ScreeningRule;
  byProvince?: Partial<Record<ProvinceCode, ScreeningRule>>;
  source: { label: string; url: string; checked: string };
  /**
   * Present on checks that follow a diagnosis rather than an age.
   *
   * Matched case-insensitively against the conditions in the profile. These are
   * not population screening — they are the routine follow-up that comes with
   * already having the condition, which is why they ignore the age bands.
   */
  conditions?: string[];
}

const CHECKED = "2026-08-17";

export const SCREENINGS: Screening[] = [
  {
    id: "colorectal",
    label: "Colorectal cancer screening",
    what:
      "A stool test you do at home, called a FIT, which looks for blood too small to see. Every province and territory uses the same test and the same age range, so this one does not vary by where you live.",
    appliesTo: "everyone",
    national: {
      startAge: 50,
      stopAge: 74,
      interval: "every 2 years",
      intervalMonths: 24,
      note: "Alberta and the Northwest Territories offer it every 1 to 2 years.",
    },
    source: {
      label: "Canadian Partnership Against Cancer — colorectal screening parameters",
      url: "https://www.partnershipagainstcancer.ca/topics/colorectal-screening-canada-2023-2024/programs/screening-parameters/",
      checked: CHECKED,
    },
  },
  {
    id: "cervical",
    label: "Cervical screening",
    what:
      "A test of cells from the cervix, done during a pelvic exam. When it starts and how often varies more by province than any other screening — some start at 21, some at 25.",
    appliesTo: "cervix",
    national: { startAge: 25, stopAge: 69, interval: "every 3 years", intervalMonths: 36 },
    byProvince: {
      BC: { startAge: 21, stopAge: 70, interval: "every 3 years", intervalMonths: 36, note: "If sexually active." },
      AB: { startAge: 25, stopAge: 69, interval: "every 3 years", intervalMonths: 36 },
      SK: { startAge: 25, stopAge: 69, interval: "every 3 years", intervalMonths: 36 },
      MB: {
        startAge: 25,
        stopAge: null,
        interval: "every 3 years", intervalMonths: 36,
        note: "Or 3 years after first sexual contact, whichever is later.",
      },
      ON: {
        startAge: 21,
        stopAge: 70,
        interval: "every 3 years", intervalMonths: 36,
        note: "If sexually active. Ontario is moving the start age to 25 alongside HPV testing.",
      },
      QC: { startAge: 21, stopAge: 65, interval: "every 2 to 3 years", intervalMonths: 36 },
      NB: {
        startAge: 21,
        stopAge: 69,
        interval: "yearly until 3 negative tests, then every 2 to 3 years", intervalMonths: 36,
        note: "Or 3 years after first sexual contact, whichever is later.",
      },
      NS: { startAge: 25, stopAge: 70, interval: "every 3 years", intervalMonths: 36 },
      PE: {
        startAge: 25,
        stopAge: 65,
        interval: "every 5 years", intervalMonths: 60,
        note: "From 66, people with an adequate screening history may stop.",
      },
      NL: {
        startAge: 21,
        stopAge: 70,
        interval: "yearly until 3 negative tests, then every 3 years", intervalMonths: 36,
      },
      NT: {
        startAge: 21,
        stopAge: 69,
        interval: "interval not published", intervalMonths: null,
        note: "Or 3 years after first intimate sexual activity.",
      },
      NU: { startAge: 21, stopAge: null, interval: "yearly until 3 negative tests, then every 2 years", intervalMonths: 24 },
      YT: {
        startAge: 21,
        stopAge: null,
        interval: "no organized program", intervalMonths: null,
        note: "Yukon has no organized cervical screening program; ask your clinician.",
      },
    },
    source: {
      label: "Canadian Partnership Against Cancer — cervical screening guidelines",
      url: "https://www.partnershipagainstcancer.ca/topics/cervical-screening-canada-2023-2024/programs/guidelines/",
      checked: CHECKED,
    },
  },
  {
    id: "breast",
    label: "Breast screening (mammogram)",
    what:
      "An X-ray of the breast. Several provinces have been lowering the age they start, and many will accept you from 40 if you ask, even where the routine invitation begins later — so this is worth asking about rather than waiting for a letter.",
    appliesTo: "breasts",
    national: {
      startAge: 50,
      stopAge: 74,
      interval: "every 2 to 3 years", intervalMonths: 36,
      note: "The national task force treats ages 40 to 49 as a personal choice rather than a routine invitation.",
    },
    byProvince: {
      BC: { startAge: 50, stopAge: 74, interval: "every 2 years", intervalMonths: 24 },
      AB: { startAge: 45, stopAge: 74, interval: "every 2 years", intervalMonths: 24 },
      SK: {
        startAge: 50,
        stopAge: null,
        interval: "every 2 years", intervalMonths: 24,
        note: "Saskatchewan extended its program to ages 40 to 42 in July 2026.",
      },
      MB: { startAge: 50, stopAge: 74, interval: "every 2 years", intervalMonths: 24 },
      ON: {
        startAge: 50,
        stopAge: 74,
        interval: "every 2 years", intervalMonths: 24,
        note: "Ontario began expanding eligibility to ages 40 to 49 in late 2024.",
      },
      QC: { startAge: 50, stopAge: 69, interval: "every 2 years", intervalMonths: 24 },
      NB: { startAge: 50, stopAge: 74, interval: "every 2 years", intervalMonths: 24 },
      NS: { startAge: 50, stopAge: 74, interval: "every 2 years", intervalMonths: 24 },
      PE: { startAge: 50, stopAge: 74, interval: "every 2 years", intervalMonths: 24 },
      NL: { startAge: 50, stopAge: 74, interval: "every 2 years", intervalMonths: 24 },
      YT: { startAge: 50, stopAge: 74, interval: "every 2 years", intervalMonths: 24 },
      NT: { startAge: 50, stopAge: 74, interval: "every 1 to 2 years", intervalMonths: 24 },
      NU: {
        startAge: 50,
        stopAge: null,
        interval: "no organized program", intervalMonths: null,
        note: "Nunavut screens opportunistically rather than by invitation.",
      },
    },
    source: {
      label: "Canadian Partnership Against Cancer — breast screening guidelines",
      url: "https://www.partnershipagainstcancer.ca/topics/breast-screening-canada-2023-2024/programs/guidelines/",
      checked: CHECKED,
    },
  },
  /*
    Below here: follow-up that comes with a diagnosis, not population screening.

    These appear only when the profile names the condition, and they ignore the
    age bands — a 30-year-old with type 2 diabetes needs the same eye check as a
    60-year-old with it. Intervals are the published ones; whether a particular
    person needs theirs sooner is between them and their care team, which is why
    every one of these says to confirm rather than asserting a schedule.
  */
  {
    id: "diabetes-a1c",
    label: "A1C blood test",
    what:
      "A blood test showing your average blood sugar over the past three months or so. It is the main way diabetes control is tracked over time.",
    appliesTo: "everyone",
    conditions: ["diabetes"],
    national: {
      startAge: 0,
      stopAge: null,
      interval: "every 3 months",
      intervalMonths: 3,
      note: "Every 6 months is common once things have been stable and on target for a while.",
    },
    source: {
      label: "Diabetes Canada — glycemic monitoring",
      url: "https://guidelines.diabetes.ca/cpg/chapter9",
      checked: CHECKED,
    },
  },
  {
    id: "diabetes-eye",
    label: "Diabetic eye exam",
    what:
      "An eye exam by an optometrist or ophthalmologist looking for damage to the retina, which can develop before you notice any change in your sight. Not the same as a vision test for glasses.",
    appliesTo: "everyone",
    conditions: ["diabetes"],
    national: {
      startAge: 0,
      stopAge: null,
      interval: "every 1 to 2 years",
      intervalMonths: 24,
      note: "In type 1 this usually starts 5 years after diagnosis and is yearly. In type 2 it starts at diagnosis, then every 1 to 2 years if nothing is found.",
    },
    source: {
      label: "Diabetes Canada — retinopathy",
      url: "https://guidelines.diabetes.ca/cpg/chapter30",
      checked: CHECKED,
    },
  },
  {
    id: "diabetes-kidney",
    label: "Kidney check",
    what:
      "A urine test for protein and a blood test for kidney function, done together. Kidney damage from diabetes is silent early on, which is the reason for testing rather than waiting for symptoms.",
    appliesTo: "everyone",
    conditions: ["diabetes"],
    national: {
      startAge: 0,
      stopAge: null,
      interval: "every year",
      intervalMonths: 12,
      note: "From diagnosis in type 2; usually from 5 years after diagnosis in type 1.",
    },
    source: {
      label: "Diabetes Canada — chronic kidney disease",
      url: "https://guidelines.diabetes.ca/cpg/chapter29",
      checked: CHECKED,
    },
  },
  {
    id: "bp-review",
    label: "Blood pressure review",
    what:
      "A check-in on your blood pressure and how your treatment is working. If you record readings in Vitals, that history is the thing worth bringing.",
    appliesTo: "everyone",
    conditions: ["high blood pressure", "hypertension"],
    national: {
      startAge: 0,
      stopAge: null,
      interval: "every 3 to 6 months",
      intervalMonths: 6,
      note: "More often — every 1 to 2 months — while your blood pressure is still being brought to target.",
    },
    source: {
      label: "Hypertension Canada — diagnosis and follow-up",
      url: "https://hypertension.ca/guidelines/diagnosis-assessment/diagnosis-assessment-diagnosis/",
      checked: CHECKED,
    },
  },
];

export function ruleFor(screening: Screening, province: ProvinceCode | null): ScreeningRule {
  if (!province) return screening.national;
  return screening.byProvince?.[province] ?? screening.national;
}

export function provinceName(code: ProvinceCode | null): string | null {
  return PROVINCES.find((entry) => entry.code === code)?.name ?? null;
}

/** Conditions from the profile are free text; match loosely and case-insensitively. */
export function screeningAppliesToConditions(screening: Screening, conditions: string): boolean {
  if (!screening.conditions) return true;
  const haystack = conditions.toLowerCase();
  return screening.conditions.some((needle) => haystack.includes(needle));
}

export function isConditionLinked(screening: Screening): boolean {
  return Boolean(screening.conditions);
}
