/**
 * CLAIRITY — Safety-first medical document pipeline.
 *
 * Stage 1–3: a vision extractor produces source-located, structured facts only.
 * Stage 4–5: a separate communicator receives those facts, never the image.
 * Stage 6: local verification rejects unsupported numbers, facts, or red flags.
 */

import type {
  CommunicationScript,
  DocumentClassification,
  DocumentQuality,
  DocumentType,
  ExtractedFacts,
  ExtractedFinding,
  ExtractedFollowUp,
  ExtractedAppointment,
  ExtractedMedication,
  HealthCardData,
  HealthProfile,
  LabValue,
  SafetyCheck,
  SimplificationResult,
  SourceBlock,
  WarningSign,
} from "./types";

// Direct Anthropic Messages API. The key is read from EXPO_PUBLIC_ANTHROPIC_API_KEY.
// NOTE: an EXPO_PUBLIC_* value is embedded in the shipped client bundle and is
// therefore extractable from the app — acceptable for personal TestFlight
// testing, but for public distribution this key MUST move behind a backend
// proxy so it never ships to the device.
const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
const MODEL_ID = "claude-sonnet-5";
const ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const CLASSIFICATION_THRESHOLD = 0.65;
const QUALITY_THRESHOLD = 0.85;

type UnknownRecord = Record<string, unknown>;

interface AnalysisInput {
  imageBase64: string;
  mimeType: string;
  profile: HealthProfile;
}

interface RawExtraction {
  quality: DocumentQuality;
  classification: DocumentClassification;
  sourceBlocks: SourceBlock[];
  facts: ExtractedFacts;
  title: string;
}

interface CommunicatedCards {
  summary: string;
  interpretation: string;
  checklist: Array<{ id: string; text: string; required: boolean; sourceBlockIds: string[] }>;
  timeline: Array<{ id: string; when: string; label: string; detail: string; sourceBlockIds: string[] }>;
  warnings: WarningSign[];
  scripts: CommunicationScript[];
}

export interface MedicationSuggestion {
  label: string;
  rxNormCui?: string;
}

export interface MedicationNormalizationResult {
  originalName: string;
  normalizedName: string;
  rxNormCui?: string;
  openFdaGenericName?: string;
  openFdaBrandName?: string;
  fhirResource?: Record<string, unknown>;
}

/** A source image needs a clearer re-photo before CLAIRITY can safely continue. */
export class DocumentNeedsRetakeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentNeedsRetakeError";
  }
}

/** The submitted image is readable, but it is not a medical document. */
export class NonMedicalDocumentError extends Error {
  constructor() {
    super("This does not appear to be a medical document. Please upload a report, prescription, referral, discharge paper, imaging result, or vaccination record.");
    this.name = "NonMedicalDocumentError";
  }
}

function requireConfiguration(): void {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("AI service is not configured. Please try again later.");
  }
}

/**
 * The callers below are written in an OpenAI-style shape (a `messages` array
 * that may include a `system` role and `image_url` content parts). Anthropic's
 * Messages API takes the system prompt as a top-level field and uses a
 * different image block, so we translate here — this keeps every call site
 * unchanged while talking directly to Anthropic.
 */
function toAnthropicRequest(body: UnknownRecord): UnknownRecord {
  const messages = asArray(body.messages).map(asRecord);
  const systemText = messages
    .filter((m) => asString(m.role) === "system")
    .map((m) => asString(m.content))
    .filter(Boolean)
    .join("\n\n");

  const converted = messages
    .filter((m) => asString(m.role) !== "system")
    .map((m) => {
      const role = asString(m.role) === "assistant" ? "assistant" : "user";
      if (typeof m.content === "string") {
        return { role, content: m.content };
      }
      const parts = asArray(m.content).map(asRecord).map((part) => {
        if (asString(part.type) === "image_url") {
          const url = asString(asRecord(part.image_url).url);
          const match = /^data:(.+?);base64,(.*)$/s.exec(url);
          if (match) {
            return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } };
          }
          return { type: "text", text: "" };
        }
        return { type: "text", text: asString(part.text) };
      });
      return { role, content: parts };
    });

  return {
    model: asString(body.model) || MODEL_ID,
    max_tokens: asNumber(body.max_tokens, 4000),
    // NO sampling parameters. Claude Sonnet 5 rejects a non-default
    // `temperature`, `top_p` or `top_k` with a 400, and this builder previously
    // defaulted `temperature` to 0 on every request — which failed every call in
    // the app. Call sites may still pass `temperature`; it is deliberately
    // dropped here rather than forwarded.
    //
    // Thinking is disabled explicitly. On Sonnet 5 adaptive thinking is ON when
    // the field is omitted, and thinking tokens are drawn from `max_tokens` — a
    // long extraction could spend the budget reasoning and return truncated
    // JSON, which fails the parse outright. The accuracy this would have bought
    // is already covered by the two-stage extract-then-verify pipeline.
    thinking: { type: "disabled" },
    ...(systemText ? { system: systemText } : {}),
    messages: converted,
  };
}

async function requestCompletion(body: UnknownRecord): Promise<string> {
  requireConfiguration();
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY as string,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(toAnthropicRequest(body)),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("The AI service key is missing or invalid. Please check the app's configuration.");
    }
    if (response.status === 413) {
      throw new DocumentNeedsRetakeError("This photo is too large to process. Please take a new photo that shows just the document.");
    }
    if (response.status === 429) {
      throw new Error("CLAIRITY is busy right now. Please wait a moment and try again.");
    }
    if ([500, 502, 503, 529].includes(response.status)) {
      throw new Error("The document reader is temporarily unavailable. Please try again in a moment.");
    }
    throw new Error("We could not safely read this document. Please try a clearer photo.");
  }

  const data = (await response.json()) as UnknownRecord;
  const blocks = asArray(data.content).map(asRecord);
  const content = asString(blocks.find((block) => asString(block.type) === "text")?.text);
  if (!content) {
    throw new Error("The document reader returned an empty result. Please try a clearer photo.");
  }
  return content;
}

function extractJson(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.text();
}

export async function searchMedicationAutocomplete(query: string): Promise<MedicationSuggestion[]> {
  const cleaned = query.trim();
  if (!cleaned) return [];

  try {
    const body = await fetchJson<[number, string[], null, string[][]]>(`https://clinicaltables.nlm.nih.gov/api/rxterms/v3/search?terms=${encodeURIComponent(cleaned)}`);
    const terms = asArray(body[1]);
    const rxNormIds = asArray(body[3]).map((entry) => asArray(entry).map(asString).filter(Boolean));

    return terms
      .map((term, index) => ({ label: asString(term), rxNormCui: rxNormIds[index]?.[0] }))
      .filter((entry) => entry.label)
      .slice(0, 6);
  } catch {
    return [];
  }
}

export async function normalizeMedicationWithRxNorm(name: string): Promise<MedicationNormalizationResult> {
  const cleaned = name.trim();
  if (!cleaned) {
    throw new Error("A medication name is required.");
  }

  const rxNormResponse = await fetchText(`https://rxnav.nlm.nih.gov/REST/rxcui?name=${encodeURIComponent(cleaned)}`);
  const rxNormCuiMatch = rxNormResponse.match(/<rxnormId>([^<]+)<\/rxnormId>/i);
  const rxNormCui = rxNormCuiMatch?.[1]?.trim();

  const normalizedName = rxNormCui ? cleaned : cleaned;
  const openFdaQuery = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:%22${encodeURIComponent(cleaned)}%22&limit=1`;
  let openFdaGenericName = "";
  let openFdaBrandName = "";

  try {
    const openFdaData = await fetchJson<{ results?: Array<{ openfda?: { generic_name?: string[]; brand_name?: string[] } }> }>(openFdaQuery);
    const firstResult = openFdaData.results?.[0];
    openFdaGenericName = asArray(firstResult?.openfda?.generic_name).map(asString).find(Boolean) ?? "";
    openFdaBrandName = asArray(firstResult?.openfda?.brand_name).map(asString).find(Boolean) ?? "";
  } catch {
    // OpenFDA is optional metadata enrichment; failures should never block a save.
  }

  const fhirResource: Record<string, unknown> = {
    resourceType: "MedicationStatement",
    status: "active",
    medicationCodeableConcept: {
      text: normalizedName,
      coding: rxNormCui ? [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: rxNormCui, display: normalizedName }] : [],
    },
    note: [{ text: "Normalized via RxNorm, Clinical Tables, and OpenFDA metadata." }],
  };

  return {
    originalName: cleaned,
    normalizedName: normalizedName || cleaned,
    rxNormCui,
    openFdaGenericName: openFdaGenericName || undefined,
    openFdaBrandName: openFdaBrandName || undefined,
    fhirResource,
  };
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeBlock(value: unknown, index: number): SourceBlock | null {
  const obj = asRecord(value);
  const text = asString(obj.text);
  if (!text) return null;
  const box = asRecord(obj.box);
  return {
    id: asString(obj.id) || `block-${index + 1}`,
    page: Math.max(1, Math.round(asNumber(obj.page, 1))),
    text,
    box: {
      x: Math.max(0, Math.min(1000, asNumber(box.x, 0))),
      y: Math.max(0, Math.min(1000, asNumber(box.y, 0))),
      width: Math.max(0, Math.min(1000, asNumber(box.width, 0))),
      height: Math.max(0, Math.min(1000, asNumber(box.height, 0))),
    },
    confidence: Math.max(0, Math.min(1, asNumber(obj.confidence, 0))),
  };
}

function normalizeSourceIds(value: unknown): string[] {
  return asArray(value).map(asString).filter(Boolean).slice(0, 8);
}

function normalizeFinding(value: unknown, index: number, prefix: string): ExtractedFinding | null {
  const obj = asRecord(value);
  const text = asString(obj.text);
  const sourceBlockIds = normalizeSourceIds(obj.sourceBlockIds);
  return text && sourceBlockIds.length > 0 ? { id: asString(obj.id) || `${prefix}-${index + 1}`, text, sourceBlockIds } : null;
}

function normalizeMedication(value: unknown, index: number): ExtractedMedication | null {
  const obj = asRecord(value);
  const name = asString(obj.name);
  const sourceBlockIds = normalizeSourceIds(obj.sourceBlockIds);
  if (!name || sourceBlockIds.length === 0) return null;
  return {
    id: asString(obj.id) || `med-${index + 1}`,
    name,
    dose: asString(obj.dose),
    route: asString(obj.route),
    frequency: asString(obj.frequency),
    duration: asString(obj.duration),
    purpose: asString(obj.purpose),
    startStopInstructions: asString(obj.startStopInstructions),
    sourceBlockIds,
  };
}

function normalizeLabValue(value: unknown, index: number): LabValue | null {
  const obj = asRecord(value);
  const testName = asString(obj.testName);
  const sourceBlockIds = normalizeSourceIds(obj.sourceBlockIds);
  if (!testName || sourceBlockIds.length === 0) return null;
  const status = asString(obj.status);
  const direction = asString(obj.direction);
  return {
    id: asString(obj.id) || `lab-${index + 1}`,
    testName,
    value: asString(obj.value),
    unit: asString(obj.unit),
    referenceRange: asString(obj.referenceRange),
    status: status === "in_range" || status === "out_of_range" ? status : "unknown",
    direction: direction === "high" || direction === "low" || direction === "normal" ? direction : "unknown",
    sourceBlockIds,
  };
}

function normalizeFollowUp(value: unknown, index: number): ExtractedFollowUp | null {
  const obj = asRecord(value);
  const what = asString(obj.what);
  const sourceBlockIds = normalizeSourceIds(obj.sourceBlockIds);
  if (!what || sourceBlockIds.length === 0) return null;
  return {
    id: asString(obj.id) || `followup-${index + 1}`,
    what,
    withWhom: asString(obj.withWhom),
    byWhen: asString(obj.byWhen),
    sourceBlockIds,
  };
}

function normalizeAppointment(value: unknown, index: number): ExtractedAppointment | null {
  const obj = asRecord(value);
  const dateTime = asString(obj.dateTime);
  const sourceBlockIds = normalizeSourceIds(obj.sourceBlockIds);
  if (!dateTime || Number.isNaN(new Date(dateTime).getTime()) || sourceBlockIds.length === 0) return null;
  return { id: asString(obj.id) || `appointment-${index + 1}`, dateTime, purpose: asString(obj.purpose), location: asString(obj.location), whatToBring: asString(obj.whatToBring), sourceBlockIds };
}

function normalizeWarning(value: unknown, index: number): WarningSign | null {
  const obj = asRecord(value);
  const symptom = asString(obj.symptom);
  const sourceBlockIds = normalizeSourceIds(obj.sourceBlockIds);
  if (!symptom || sourceBlockIds.length === 0) return null;
  return {
    id: asString(obj.id) || `flag-${index + 1}`,
    symptom,
    action: asString(obj.action),
    isEmergency: obj.isEmergency === true,
    sourceBlockIds,
  };
}

function normalizedFactList(value: unknown, prefix: string): ExtractedFinding[] {
  return asArray(value).map((item, index) => normalizeFinding(item, index, prefix)).filter((item): item is ExtractedFinding => item !== null);
}

function validDocumentType(value: string): DocumentType {
  const types: DocumentType[] = ["blood_work", "imaging", "pathology", "discharge", "prescription", "referral", "operative_report", "consultation", "diagnosis", "vaccination_record", "general"];
  return types.includes(value as DocumentType) ? value as DocumentType : "general";
}

function normalizeExtraction(parsed: UnknownRecord): RawExtraction {
  const rawQuality = asRecord(parsed.quality);
  const rawClassification = asRecord(parsed.classification);
  const blocks = asArray(parsed.sourceBlocks).map(normalizeBlock).filter((block): block is SourceBlock => block !== null).slice(0, 180);
  const rawFacts = asRecord(parsed.facts);

  const facts: ExtractedFacts = {
    medications: asArray(rawFacts.medications).map(normalizeMedication).filter((item): item is ExtractedMedication => item !== null),
    labValues: asArray(rawFacts.labValues).map(normalizeLabValue).filter((item): item is LabValue => item !== null),
    diagnosesAndFindings: normalizedFactList(rawFacts.diagnosesAndFindings, "finding"),
    procedures: normalizedFactList(rawFacts.procedures, "procedure"),
    instructionsAndRestrictions: normalizedFactList(rawFacts.instructionsAndRestrictions, "instruction"),
    followUps: asArray(rawFacts.followUps).map(normalizeFollowUp).filter((item): item is ExtractedFollowUp => item !== null),
    appointments: asArray(rawFacts.appointments).map(normalizeAppointment).filter((item): item is ExtractedAppointment => item !== null),
    redFlags: asArray(rawFacts.redFlags).map(normalizeWarning).filter((item): item is WarningSign => item !== null),
    unknowns: normalizedFactList(rawFacts.unknowns, "unknown"),
    conflicts: normalizedFactList(rawFacts.conflicts, "conflict"),
  };

  return {
    quality: {
      isReadable: rawQuality.isReadable === true,
      score: Math.max(0, Math.min(1, asNumber(rawQuality.score, 0))),
      issues: asArray(rawQuality.issues).map(asString).filter(Boolean),
      message: asString(rawQuality.message),
    },
    classification: {
      type: validDocumentType(asString(rawClassification.type)),
      confidence: Math.max(0, Math.min(1, asNumber(rawClassification.confidence, 0))),
      detectedLanguage: asString(rawClassification.detectedLanguage) || "Unknown",
      isMedicalDocument: rawClassification.isMedicalDocument === true,
    },
    sourceBlocks: blocks,
    facts,
    title: asString(parsed.title) || "Medical Document",
  };
}

function validateExtraction(extraction: RawExtraction): RawExtraction {
  if (!extraction.quality.isReadable || extraction.quality.score < QUALITY_THRESHOLD || extraction.sourceBlocks.length === 0) {
    const issueText = extraction.quality.issues.length ? ` ${extraction.quality.issues.join(" ")}` : "";
    throw new DocumentNeedsRetakeError(`We could not read this document clearly enough to be safe.${issueText} Please take a new photo in good light with all four corners visible.`);
  }
  if (!extraction.classification.isMedicalDocument) {
    throw new NonMedicalDocumentError();
  }

  const sourceIds = new Set(extraction.sourceBlocks.map((block) => block.id));
  const filterSupported = <T extends { sourceBlockIds: string[] }>(items: T[]): T[] => items.filter((item) => item.sourceBlockIds.length > 0 && item.sourceBlockIds.every((id) => sourceIds.has(id)));
  extraction.facts.medications = filterSupported(extraction.facts.medications);
  extraction.facts.labValues = filterSupported(extraction.facts.labValues);
  extraction.facts.diagnosesAndFindings = filterSupported(extraction.facts.diagnosesAndFindings);
  extraction.facts.procedures = filterSupported(extraction.facts.procedures);
  extraction.facts.instructionsAndRestrictions = filterSupported(extraction.facts.instructionsAndRestrictions);
  extraction.facts.followUps = filterSupported(extraction.facts.followUps);
  extraction.facts.appointments = filterSupported(extraction.facts.appointments);
  extraction.facts.redFlags = filterSupported(extraction.facts.redFlags);
  extraction.facts.unknowns = filterSupported(extraction.facts.unknowns);
  extraction.facts.conflicts = filterSupported(extraction.facts.conflicts);

  if (extraction.classification.confidence < CLASSIFICATION_THRESHOLD) {
    extraction.classification.type = "general";
  }
  return extraction;
}

const EXTRACTION_SCHEMA: UnknownRecord = {
  type: "object",
  additionalProperties: false,
  required: ["quality", "classification", "title", "sourceBlocks", "facts"],
  properties: {
    quality: { type: "object", required: ["isReadable", "score", "issues", "message"], properties: { isReadable: { type: "boolean" }, score: { type: "number" }, issues: { type: "array", items: { type: "string" } }, message: { type: "string" } } },
    classification: { type: "object", required: ["type", "confidence", "detectedLanguage", "isMedicalDocument"], properties: { type: { type: "string" }, confidence: { type: "number" }, detectedLanguage: { type: "string" }, isMedicalDocument: { type: "boolean" } } },
    title: { type: "string" },
    sourceBlocks: { type: "array", items: { type: "object", required: ["id", "page", "text", "box", "confidence"], properties: { id: { type: "string" }, page: { type: "number" }, text: { type: "string" }, confidence: { type: "number" }, box: { type: "object", required: ["x", "y", "width", "height"], properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } } } } } },
    facts: { type: "object", required: ["medications", "labValues", "diagnosesAndFindings", "procedures", "instructionsAndRestrictions", "followUps", "appointments", "redFlags", "unknowns", "conflicts"], properties: { medications: { type: "array" }, labValues: { type: "array" }, diagnosesAndFindings: { type: "array" }, procedures: { type: "array" }, instructionsAndRestrictions: { type: "array" }, followUps: { type: "array" }, appointments: { type: "array" }, redFlags: { type: "array" }, unknowns: { type: "array" }, conflicts: { type: "array" } } },
  },
};

async function extractFacts(input: AnalysisInput): Promise<RawExtraction> {
  const content = await requestCompletion({
    model: MODEL_ID,
    max_tokens: 7000,
    messages: [
      {
        role: "system",
        content: `You are the strict extraction stage of a medical record system. You do NOT provide medical advice, explanations, reassurance, diagnosis, or interpretation. You only transcribe and classify what is visibly present in the source image.

First assess image quality. If blurry, cropped, shadowed, rotated, glare-covered, low resolution, or any critical content cannot be read with high confidence, set quality.isReadable=false. Always set quality.score to your confidence that every clinically important character was read correctly, as a number from 0 to 1; a clean scan or a sharp, evenly lit photo is 0.9 or above. Do not guess partial values. If not medical, set classification.isMedicalDocument=false.

For each readable text block, create a sourceBlock using normalized 0-1000 bounding-box coordinates. Every fact MUST include sourceBlockIds that point to the exact block(s) containing it. If it is not explicit in the source, do not include it. Do not infer missing dosage, duration, diagnosis, urgency, normality, or clinical meaning. Preserve medication dose, route, frequency, duration, restrictions, and escalation wording exactly as written. Translate no content in this stage; detectedLanguage identifies the source language.

Classify only as: blood_work, imaging, pathology, discharge, prescription, referral, operative_report, consultation, diagnosis, vaccination_record, general. Confidence below 0.65 means generic/general downstream.

Extract: medications; labs; diagnoses/findings as stated; procedures; instructions/restrictions; follow-ups; appointments; explicit red flags; expected-but-missing details as unknowns; and conflicts. Appointments are ONLY explicitly scheduled visits with a complete, unambiguous date and time. Use ISO 8601 local date-time in dateTime. Copy purpose, location, and what-to-bring wording exactly; do not create an appointment from a vague follow-up instruction. If no item exists, return an empty array.

Return one JSON object and nothing else, in exactly this shape. Every key below is required, every list must be present even when empty, and every extracted item must carry a non-empty sourceBlockIds. Names are exact: an item under a different key, or nested anywhere other than "facts", is discarded.

{
  "quality": { "isReadable": true, "score": 0.0, "issues": ["..."], "message": "..." },
  "classification": { "type": "blood_work", "confidence": 0.0, "detectedLanguage": "English", "isMedicalDocument": true },
  "title": "...",
  "sourceBlocks": [{ "id": "b1", "page": 1, "text": "...", "confidence": 0.0, "box": { "x": 0, "y": 0, "width": 0, "height": 0 } }],
  "facts": {
    "medications": [{ "id": "m1", "name": "...", "dose": "...", "route": "...", "frequency": "...", "duration": "...", "purpose": "...", "startStopInstructions": "...", "sourceBlockIds": ["b1"] }],
    "labValues": [{ "id": "l1", "testName": "...", "value": "...", "unit": "...", "referenceRange": "...", "status": "in_range|out_of_range|unknown", "direction": "high|low|normal|unknown", "sourceBlockIds": ["b1"] }],
    "diagnosesAndFindings": [{ "id": "f1", "text": "...", "sourceBlockIds": ["b1"] }],
    "procedures": [{ "id": "p1", "text": "...", "sourceBlockIds": ["b1"] }],
    "instructionsAndRestrictions": [{ "id": "i1", "text": "...", "sourceBlockIds": ["b1"] }],
    "followUps": [{ "id": "u1", "what": "...", "withWhom": "...", "byWhen": "...", "sourceBlockIds": ["b1"] }],
    "appointments": [{ "id": "a1", "dateTime": "2026-09-19T10:30", "purpose": "...", "location": "...", "whatToBring": "...", "sourceBlockIds": ["b1"] }],
    "redFlags": [{ "id": "r1", "symptom": "...", "action": "...", "isEmergency": false, "sourceBlockIds": ["b1"] }],
    "unknowns": [{ "id": "k1", "text": "...", "sourceBlockIds": ["b1"] }],
    "conflicts": [{ "id": "c1", "text": "...", "sourceBlockIds": ["b1"] }]
  }
}`,
      },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` } },
          { type: "text", text: "Perform strict source-linked extraction only. Return the requested JSON." },
        ],
      },
    ],
  });

  const json = extractJson(content);
  if (!json) throw new DocumentNeedsRetakeError("We could not safely read this photo. Please take a clearer photo of the document.");
  try {
    return validateExtraction(normalizeExtraction(JSON.parse(json) as UnknownRecord));
  } catch (error) {
    if (error instanceof DocumentNeedsRetakeError || error instanceof NonMedicalDocumentError) throw error;
    throw new DocumentNeedsRetakeError("We could not safely verify the text in this photo. Please take a clearer photo.");
  }
}

function factsOnly(extraction: RawExtraction): UnknownRecord {
  return {
    title: extraction.title,
    classification: extraction.classification,
    sourceBlocks: extraction.sourceBlocks,
    facts: extraction.facts,
  };
}

async function communicateFacts(extraction: RawExtraction): Promise<CommunicatedCards> {
  const content = await requestCompletion({
    model: MODEL_ID,
    max_tokens: 4000,
    messages: [
      {
        role: "system",
        content: `You are the communication stage of CLAIRITY. You receive source-linked extracted facts only, never the original image. You may discuss ONLY these facts. Never add medical knowledge, diagnoses, reassurance, recommendations to start/stop/change medication, or missing details.

Write at an approximately grade 5–6 reading level. Explain rather than diagnose. Preserve doses, routes, frequencies, restrictions, and clinician instructions verbatim whenever they appear. Make every card item include sourceBlockIds from the facts it uses. Include every extracted red flag in warnings, with the action stated in the extracted fact. If a fact is unclear or missing, say so plainly and direct the person to ask their pharmacist or clinician; do not guess.

Return JSON with: summary (string); interpretation (string); checklist [{id,text,required,sourceBlockIds}]; timeline [{id,when,label,detail,sourceBlockIds}]; warnings [{id,symptom,action,isEmergency,sourceBlockIds}]; scripts [{language: en|pa|hi|ur, languageLabel, text, sourceBlockIds}]. The summary and interpretation must not contain unsupported numbers.`,
      },
      { role: "user", content: JSON.stringify(factsOnly(extraction)) },
    ],
  });

  const json = extractJson(content);
  if (!json) throw new Error("We could not create a safe explanation from this document. Please try again.");
  const parsed = asRecord(JSON.parse(json));
  return {
    summary: asString(parsed.summary),
    interpretation: asString(parsed.interpretation),
    checklist: asArray(parsed.checklist).map((item, index) => {
      const obj = asRecord(item);
      return { id: asString(obj.id) || `action-${index + 1}`, text: asString(obj.text), required: obj.required === true, sourceBlockIds: normalizeSourceIds(obj.sourceBlockIds) };
    }).filter((item) => item.text && item.sourceBlockIds.length > 0),
    timeline: asArray(parsed.timeline).map((item, index) => {
      const obj = asRecord(item);
      return { id: asString(obj.id) || `timeline-${index + 1}`, when: asString(obj.when), label: asString(obj.label), detail: asString(obj.detail), sourceBlockIds: normalizeSourceIds(obj.sourceBlockIds) };
    }).filter((item) => item.when && item.sourceBlockIds.length > 0),
    warnings: asArray(parsed.warnings).map(normalizeWarning).filter((item): item is WarningSign => item !== null),
    scripts: asArray(parsed.scripts).map((item) => {
      const obj = asRecord(item);
      const language = asString(obj.language);
      return { language: ["en", "pa", "hi", "ur"].includes(language) ? language as CommunicationScript["language"] : "en", languageLabel: asString(obj.languageLabel) || "English", text: asString(obj.text), sourceBlockIds: normalizeSourceIds(obj.sourceBlockIds) };
    }).filter((item) => item.text && item.sourceBlockIds.length > 0),
  };
}

function numbers(text: string): string[] {
  return text.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
}

function flattenOutput(cards: CommunicatedCards): string[] {
  return [cards.summary, cards.interpretation, ...cards.checklist.flatMap((item) => [item.text]), ...cards.timeline.flatMap((item) => [item.when, item.label, item.detail]), ...cards.warnings.flatMap((item) => [item.symptom, item.action]), ...cards.scripts.map((item) => item.text)];
}

function verifySafety(extraction: RawExtraction, cards: CommunicatedCards): SafetyCheck {
  const blockIds = new Set(extraction.sourceBlocks.map((block) => block.id));
  const sourceText = extraction.sourceBlocks.map((block) => block.text).join(" ");
  const sourceNumbers = new Set(numbers(sourceText));
  const outputNumbers = flattenOutput(cards).flatMap(numbers);
  const numericFidelityPassed = outputNumbers.every((number) => sourceNumbers.has(number));
  const outputItems = [...cards.checklist, ...cards.timeline, ...cards.warnings, ...cards.scripts];
  const noInventionPassed = outputItems.every((item) => item.sourceBlockIds.length > 0 && item.sourceBlockIds.every((id) => blockIds.has(id)));
  const missingRedFlags = extraction.facts.redFlags.filter((flag) => !cards.warnings.some((warning) => warning.sourceBlockIds.some((id) => flag.sourceBlockIds.includes(id))));
  const redFlagCompletenessPassed = missingRedFlags.length === 0;
  const jargon = ["hyperlipidemia", "hypertension", "myocardial", "contraindication", "prophylaxis"].filter((term) => flattenOutput(cards).join(" ").toLowerCase().includes(term));
  const readingLevelPassed = jargon.length === 0;
  const flags: string[] = [];
  if (!numericFidelityPassed) flags.push("A number in the explanation could not be matched to the source.");
  if (!noInventionPassed) flags.push("An output item did not link back to the source.");
  if (!redFlagCompletenessPassed) flags.push("An urgent symptom from the source was missing from the warning card.");
  if (!readingLevelPassed) flags.push(`Simplify medical terms before showing this: ${jargon.join(", ")}.`);
  return { numericFidelityPassed, noInventionPassed, redFlagCompletenessPassed, readingLevelPassed, flags };
}

/** Run the full safety-first document pipeline. */
export async function analyzeDocument(input: AnalysisInput): Promise<SimplificationResult> {
  const extraction = await extractFacts(input);
  const cards = await communicateFacts(extraction);
  const safety = verifySafety(extraction, cards);
  if (!safety.numericFidelityPassed || !safety.noInventionPassed || !safety.redFlagCompletenessPassed) {
    throw new Error("We could not verify this explanation against the original document. Please try again with a clearer photo.");
  }

  return {
    documentType: extraction.classification.type,
    classification: extraction.classification,
    quality: extraction.quality,
    sourceBlocks: extraction.sourceBlocks,
    facts: extraction.facts,
    safety,
    title: extraction.title,
    dateAnalyzed: new Date().toISOString(),
    summary: cards.summary,
    interpretation: cards.interpretation,
    checklist: cards.checklist.map((item) => ({ ...item, done: false })),
    timeline: cards.timeline,
    warnings: cards.warnings,
    scripts: cards.scripts,
    extractedMedications: extraction.facts.medications,
  };
}

/** OCR a health-card photo into editable fields. */
export async function extractHealthCard(input: { imageBase64: string; mimeType: string }): Promise<Partial<HealthCardData>> {
  const content = await requestCompletion({
    model: MODEL_ID,
    max_tokens: 700,
    messages: [
      { role: "system", content: "Read only the visible fields on this health card. Return JSON: cardNumber, name, versionCode, expiry, issuer. Use an empty string when a field is not visible. Never guess." },
      { role: "user", content: [{ type: "image_url", image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` } }, { type: "text", text: "Extract visible health-card fields." }] },
    ],
  });
  const parsed = asRecord(JSON.parse(extractJson(content) ?? "{}"));
  return { cardNumber: asString(parsed.cardNumber), name: asString(parsed.name), versionCode: asString(parsed.versionCode), expiry: asString(parsed.expiry), issuer: asString(parsed.issuer) };
}

/** Build a clinical handoff strictly from the verified extraction, never raw imagery. */
export async function generateDoctorSummary(input: { title: string; facts: ExtractedFacts; profile: HealthProfile }): Promise<string> {
  const content = await requestCompletion({
    model: MODEL_ID,
    max_tokens: 900,
    messages: [
      { role: "system", content: "Write a concise clinician-to-clinician handoff from the supplied structured facts only. Do not infer, diagnose, recommend medication changes, or add facts. Preserve explicit medication and follow-up wording. Return plain text under 220 words." },
      { role: "user", content: JSON.stringify({ title: input.title, patientContext: { age: input.profile.age, gender: input.profile.gender, conditions: input.profile.conditions, allergies: input.profile.allergies, medications: input.profile.medications }, facts: input.facts }) },
    ],
  });
  return content.trim();
}

/**
 * Translate already-simplified text with Claude.
 *
 * This is the default translation path. A general-purpose machine-translation
 * engine is cheaper, but it will happily drop a negation — "do not take with
 * food" coming back as "take with food" reads perfectly fluent and is dangerous.
 * The instructions below make the two failure modes that matter explicit, and
 * because the model is doing the work it can also carry the plain-language
 * explanation of a medical term across into the target language rather than
 * transliterating jargon nobody will recognise.
 *
 * Order is load-bearing: the caller maps results back positionally, so the model
 * is told to return exactly one entry per input, in order, translating nothing
 * into nothing. Any length mismatch is treated as a failure by the caller.
 */
export async function translateStrings(texts: string[], languageName: string): Promise<string[]> {
  if (texts.length === 0) return texts;

  const content = await requestCompletion({
    model: MODEL_ID,
    max_tokens: 8000,
    messages: [
      {
        role: "system",
        content: [
          `You translate patient-facing medical text from English into ${languageName}.`,
          "",
          "Rules, in order of importance:",
          `1. Never omit information. Every instruction, symptom, dose, date and warning in the English must appear in the ${languageName}.`,
          "2. Never change a number. Doses, strengths, frequencies, dates, times, temperatures and measurements must appear exactly as written, in Western digits, with the same units.",
          "3. Never reverse or drop a negation. 'Do not', 'avoid', 'stop taking' must stay negative.",
          "4. Render a medical term in plain words the reader will know rather than transliterating it, and put the English term in brackets straight after, e.g. 'white blood cells' becomes the everyday phrase followed by (white blood cells). Confine the explanation to that bracketed phrase.",
          "5. Match the reading level of the English: short sentences, everyday words, second person.",
          "6. Add nothing. No advice, reassurance, diagnosis, or commentary, and no extra sentence explaining what a body part, test or medicine does — even if it is true and would be helpful. The English has been checked for accuracy and the translation has not, so anything you add reaches the reader unverified. One sentence in must be one sentence out.",
          "",
          'Return JSON only: {"translations": ["...", "..."]} — exactly one entry per input string, in the same order. Translate an empty string to an empty string.',
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({ targetLanguage: languageName, strings: texts }),
      },
    ],
  });

  const parsed = asRecord(JSON.parse(extractJson(content) ?? "{}"));
  const translations = asArray(parsed.translations).map((value) => asString(value));

  // A short or long array means the model lost alignment; mapping it back
  // positionally would silently attach the wrong text to the wrong section.
  if (translations.length !== texts.length) {
    throw new Error("The translation came back incomplete. Showing this document in English.");
  }
  return translations.map((value, index) => value || texts[index]);
}
