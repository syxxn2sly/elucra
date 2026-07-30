/** CLAIRITY — Core domain types. */

export type DocumentType =
  | "blood_work"
  | "imaging"
  | "pathology"
  | "discharge"
  | "prescription"
  | "referral"
  | "operative_report"
  | "consultation"
  | "diagnosis"
  | "vaccination_record"
  | "general";

export interface DocTypeInfo {
  type: DocumentType;
  label: string;
  icon: string;
  description: string;
}

/** A normalized bounding box from the source image (0–1000 coordinate space). */
export interface SourceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** OCR text block with its location, used to trace every extracted fact. */
export interface SourceBlock {
  id: string;
  page: number;
  text: string;
  box: SourceBox;
  confidence: number;
}

export interface DocumentQuality {
  isReadable: boolean;
  score: number;
  issues: string[];
  message: string;
}

export interface DocumentClassification {
  type: DocumentType;
  confidence: number;
  detectedLanguage: string;
  isMedicalDocument: boolean;
}

export interface SourceLinked {
  sourceBlockIds: string[];
}

export interface ChecklistItem extends SourceLinked {
  id: string;
  text: string;
  required: boolean;
  done: boolean;
}

export interface TimelineItem extends SourceLinked {
  id: string;
  when: string;
  label: string;
  detail: string;
}

export interface WarningSign extends SourceLinked {
  id: string;
  symptom: string;
  action: string;
  isEmergency: boolean;
}

export interface CommunicationScript extends SourceLinked {
  /**
   * A code from TRANSLATION_LANGUAGES. This was once a union of four — en, pa,
   * hi, ur — which is why the app offered only those: the type, the prompt and
   * the picker all agreed on a list that excluded twelve of the sixteen
   * languages the app already supports elsewhere.
   */
  language: string;
  languageLabel: string;
  text: string;
}

export interface ExtractedMedication extends SourceLinked {
  id: string;
  name: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  purpose: string;
  startStopInstructions: string;
}

export interface LabValue extends SourceLinked {
  id: string;
  testName: string;
  value: string;
  unit: string;
  referenceRange: string;
  status: "in_range" | "out_of_range" | "unknown";
  direction: "high" | "low" | "normal" | "unknown";
}

export interface ExtractedFinding extends SourceLinked {
  id: string;
  text: string;
}

export interface ExtractedFollowUp extends SourceLinked {
  id: string;
  what: string;
  withWhom: string;
  byWhen: string;
}

/** An appointment explicitly printed on a source document. It is never inferred. */
export interface ExtractedAppointment extends SourceLinked {
  id: string;
  dateTime: string;
  purpose: string;
  location: string;
  whatToBring: string;
}

export interface ExtractedFacts {
  medications: ExtractedMedication[];
  labValues: LabValue[];
  diagnosesAndFindings: ExtractedFinding[];
  procedures: ExtractedFinding[];
  instructionsAndRestrictions: ExtractedFinding[];
  followUps: ExtractedFollowUp[];
  appointments: ExtractedAppointment[];
  redFlags: WarningSign[];
  unknowns: ExtractedFinding[];
  conflicts: ExtractedFinding[];
}

export interface SafetyCheck {
  numericFidelityPassed: boolean;
  noInventionPassed: boolean;
  redFlagCompletenessPassed: boolean;
  readingLevelPassed: boolean;
  flags: string[];
}

export interface SimplificationResult {
  documentType: DocumentType;
  classification: DocumentClassification;
  quality: DocumentQuality;
  sourceBlocks: SourceBlock[];
  facts: ExtractedFacts;
  safety: SafetyCheck;
  title: string;
  dateAnalyzed: string;
  summary: string;
  interpretation: string;
  checklist: ChecklistItem[];
  timeline: TimelineItem[];
  warnings: WarningSign[];
  scripts: CommunicationScript[];
  extractedMedications: ExtractedMedication[];
}

export interface SavedDocument {
  id: string;
  /** What the user reads. Translated when `language` is not "en". */
  result: SimplificationResult;
  imageUri: string | null;
  createdAt: string;
  /** Language code of `result`. Absent on documents saved before translation existed. */
  language?: string;
  /**
   * The English analysis, kept whenever `result` was translated.
   *
   * The safety checks run on the English; the translation is not re-verified.
   * Keeping the original means a pharmacist, nurse or family member can always
   * cross-check an instruction against the text the checks actually passed.
   */
  originalResult?: SimplificationResult;
}

export interface Medication {
  id: string;
  name: string;
  dose: string;
  frequency: string;
  notes: string;
  reminderEnabled: boolean;
  reminderTime: string;
  notificationId: string | null;
  createdAt: string;
  normalizedName?: string;
  rxNormCui?: string;
  openFdaBrandName?: string;
  openFdaGenericName?: string;
  fhirResource?: Record<string, unknown>;
}

/** A personally confirmed care appointment stored only on this device. */
export interface Appointment {
  id: string;
  title: string;
  dateTime: string;
  location: string;
  whatToBring: string;
  notes: string;
  documentId: string | null;
  sourceBlockIds: string[];
  notificationId: string | null;
  createdAt: string;
}

/** One dose in a multi-dose series. */
export interface VaccineDose {
  /** 1-based. Dose 2 of Shingrix is doseNumber 2. */
  doseNumber: number;
  monthReceived: number | null;
  yearReceived: number | null;
  /**
   * Proof for this dose specifically. A three-dose course is three separate
   * clinic visits and three separate records, so one photo per vaccine could
   * only ever evidence one of them.
   */
  proofImageUri?: string | null;
}

export interface VaccineRecord {
  id: string;
  vaccineId: string;
  name: string;
  category: "suggested" | "popular" | "other";
  monthReceived: number | null;
  yearReceived: number | null;
  hasDate: boolean;
  /**
   * Every dose recorded for this vaccine, dose 1 first.
   *
   * `monthReceived`/`yearReceived` above remain dose 1, so older records and
   * every screen that only cares about "when did you have this" keep working.
   * This is the fuller picture for vaccines given as a series.
   */
  doses: VaccineDose[];
  proofImageUri: string | null;
  verified: boolean;
  nextDueDate: string | null;
  isTravel: boolean;
  travelDestination: string | null;
  createdAt: string;
}

export interface VaccineInfo {
  id: string;
  name: string;
  category: "suggested" | "popular" | "other";
  description: string;
  protectsAgainst: string;
  cadenceMonths: number | null;
  /** Doses in a full course. 1 for a single shot. */
  doseCount: number;
  /** Typical gap between doses in a course, for suggesting when the next is due. */
  doseIntervalMonths: number | null;
  minAge: number;
  maxAge: number | null;
}

export interface TravelDestination {
  id: string;
  country: string;
  flag: string;
  vaccineIds: string[];
}

export interface HealthProfile {
  name: string;
  age: string;
  gender: string;
  conditions: string;
  surgeries: string;
  medications: string;
  allergies: string;
  familyHistory: string;
  smokingStatus: string;
  alcoholStatus: string;
  occupation: string;
  vaccineStatus: string;
  onboarded: boolean;
}

/** Local emergency and care-team contact information for the medical portfolio. */
export interface FamilyDoctor {
  doctorName: string;
  clinicName: string;
  phone: string;
  fax: string;
  address: string;
  afterHoursInstructions: string;
}

export interface HealthCardData {
  cardNumber: string;
  name: string;
  versionCode: string;
  expiry: string;
  issuer: string;
  frontImageUri: string | null;
  backImageUri: string | null;
}

export const DOCUMENT_TYPES: Record<DocumentType, DocTypeInfo> = {
  blood_work: { type: "blood_work", label: "Blood Work", icon: "Droplet", description: "Lab tests, cholesterol, blood sugar, CBC" },
  imaging: { type: "imaging", label: "Imaging", icon: "ScanLine", description: "X-rays, MRI, CT scans, ultrasound" },
  pathology: { type: "pathology", label: "Pathology", icon: "Microscope", description: "Biopsy, tissue, cytology reports" },
  discharge: { type: "discharge", label: "Discharge Summary", icon: "FileText", description: "Hospital discharge instructions" },
  prescription: { type: "prescription", label: "Prescription", icon: "Pill", description: "Medication orders and refills" },
  referral: { type: "referral", label: "Referral", icon: "Send", description: "Specialist referrals and requisitions" },
  operative_report: { type: "operative_report", label: "Operative Report", icon: "Stethoscope", description: "Surgery and procedure reports" },
  consultation: { type: "consultation", label: "Consultation Note", icon: "ClipboardList", description: "Doctor visit notes and assessments" },
  diagnosis: { type: "diagnosis", label: "Diagnosis / Assessment", icon: "ClipboardList", description: "A clinician's diagnosis, assessment, or care plan" },
  vaccination_record: { type: "vaccination_record", label: "Vaccination Record", icon: "Syringe", description: "Immunization records and cards" },
  general: { type: "general", label: "General Medical Document", icon: "FileHeart", description: "A medical document that does not match a dedicated report type" },
};
