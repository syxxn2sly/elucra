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
    national: { startAge: 25, stopAge: 69, interval: "every 3 years" },
    byProvince: {
      BC: { startAge: 21, stopAge: 70, interval: "every 3 years", note: "If sexually active." },
      AB: { startAge: 25, stopAge: 69, interval: "every 3 years" },
      SK: { startAge: 25, stopAge: 69, interval: "every 3 years" },
      MB: {
        startAge: 25,
        stopAge: null,
        interval: "every 3 years",
        note: "Or 3 years after first sexual contact, whichever is later.",
      },
      ON: {
        startAge: 21,
        stopAge: 70,
        interval: "every 3 years",
        note: "If sexually active. Ontario is moving the start age to 25 alongside HPV testing.",
      },
      QC: { startAge: 21, stopAge: 65, interval: "every 2 to 3 years" },
      NB: {
        startAge: 21,
        stopAge: 69,
        interval: "yearly until 3 negative tests, then every 2 to 3 years",
        note: "Or 3 years after first sexual contact, whichever is later.",
      },
      NS: { startAge: 25, stopAge: 70, interval: "every 3 years" },
      PE: {
        startAge: 25,
        stopAge: 65,
        interval: "every 5 years",
        note: "From 66, people with an adequate screening history may stop.",
      },
      NL: {
        startAge: 21,
        stopAge: 70,
        interval: "yearly until 3 negative tests, then every 3 years",
      },
      NT: {
        startAge: 21,
        stopAge: 69,
        interval: "interval not published",
        note: "Or 3 years after first intimate sexual activity.",
      },
      NU: { startAge: 21, stopAge: null, interval: "yearly until 3 negative tests, then every 2 years" },
      YT: {
        startAge: 21,
        stopAge: null,
        interval: "no organized program",
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
      interval: "every 2 to 3 years",
      note: "The national task force treats ages 40 to 49 as a personal choice rather than a routine invitation.",
    },
    byProvince: {
      BC: { startAge: 50, stopAge: 74, interval: "every 2 years" },
      AB: { startAge: 45, stopAge: 74, interval: "every 2 years" },
      SK: {
        startAge: 50,
        stopAge: null,
        interval: "every 2 years",
        note: "Saskatchewan extended its program to ages 40 to 42 in July 2026.",
      },
      MB: { startAge: 50, stopAge: 74, interval: "every 2 years" },
      ON: {
        startAge: 50,
        stopAge: 74,
        interval: "every 2 years",
        note: "Ontario began expanding eligibility to ages 40 to 49 in late 2024.",
      },
      QC: { startAge: 50, stopAge: 69, interval: "every 2 years" },
      NB: { startAge: 50, stopAge: 74, interval: "every 2 years" },
      NS: { startAge: 50, stopAge: 74, interval: "every 2 years" },
      PE: { startAge: 50, stopAge: 74, interval: "every 2 years" },
      NL: { startAge: 50, stopAge: 74, interval: "every 2 years" },
      YT: { startAge: 50, stopAge: 74, interval: "every 2 years" },
      NT: { startAge: 50, stopAge: 74, interval: "every 1 to 2 years" },
      NU: {
        startAge: 50,
        stopAge: null,
        interval: "no organized program",
        note: "Nunavut screens opportunistically rather than by invitation.",
      },
    },
    source: {
      label: "Canadian Partnership Against Cancer — breast screening guidelines",
      url: "https://www.partnershipagainstcancer.ca/topics/breast-screening-canada-2023-2024/programs/guidelines/",
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
