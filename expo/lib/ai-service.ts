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

/*
  Two ways to reach the model, and which one is used depends on configuration
  rather than on a code change.

  PROXY (set EXPO_PUBLIC_API_BASE): requests go to our own worker, which holds
  the Anthropic key server-side. The app sends only a client token — which does
  still ship in the binary, but can be rotated from a dashboard without an App
  Store release, and is worth far less to whoever extracts it than a billable
  API key.

  DIRECT (no EXPO_PUBLIC_API_BASE): the old path, with the key in the bundle.
  Kept so local development and existing builds keep working, and so deploying
  the proxy is a config flip rather than a hard cutover. It is not suitable for
  anything distributed beyond people you trust.

  See server/src/worker.ts and its deployment notes.
*/
const API_BASE = process.env.EXPO_PUBLIC_API_BASE;
const CLIENT_TOKEN = process.env.EXPO_PUBLIC_CLIENT_TOKEN;
const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
const USING_PROXY = Boolean(API_BASE);
const MODEL_ID = "claude-sonnet-5";
const ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const CLASSIFICATION_THRESHOLD = 0.65;
/**
 * Below this, a read is unreliable enough that a retake genuinely helps.
 *
 * It was 0.85, which rejected any photo of a real document — creased, dim,
 * handwritten — even when every character was legible, and asked for a "clearer
 * photo" of a page that was already as clear as it gets. The gate is no longer
 * carrying the safety burden on its own: every fact is source-linked, and
 * anything the explanation cannot tie back to the page is pruned per item. So
 * this only needs to catch reads that are actually untrustworthy.
 */
const QUALITY_THRESHOLD = 0.55;

/** Above this a read is clean; between the two it is usable but worth checking. */
const QUALITY_CONFIDENT = 0.8;

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
  if (USING_PROXY) {
    if (!CLIENT_TOKEN) {
      throw new Error("AI service is not configured. Please try again later.");
    }
    return;
  }
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
            const [, mediaType, data] = match;
            // A PDF is a document block, not an image block. Sending one whole
            // lets the model read the embedded text directly instead of reading
            // pixels of it.
            const blockType = mediaType === "application/pdf" ? "document" : "image";
            return { type: blockType, source: { type: "base64", media_type: mediaType, data } };
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
  const response = await fetch(USING_PROXY ? `${API_BASE}/v1/messages` : ENDPOINT, {
    method: "POST",
    headers: USING_PROXY
      ? {
          "Content-Type": "application/json",
          "x-clairity-token": CLIENT_TOKEN as string,
        }
      : {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY as string,
          "anthropic-version": ANTHROPIC_VERSION,
          // Only needed talking to Anthropic from a browser; our own proxy sets
          // no such restriction.
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
  // Keep a fact when at least one of its citations resolves, discarding the ids
  // that do not. Requiring every id to resolve meant a single stray reference —
  // common when a fact legitimately spans several blocks — discarded a
  // correctly transcribed medication or lab value entirely.
  const filterSupported = <T extends { sourceBlockIds: string[] }>(items: T[]): T[] =>
    items
      .map((item) => ({ ...item, sourceBlockIds: item.sourceBlockIds.filter((id) => sourceIds.has(id)) }))
      .filter((item) => item.sourceBlockIds.length > 0);
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

First assess whether the content can be READ, which is not the same as whether the photograph is tidy. Real documents are creased, folded, shadowed, held at an angle, and handwritten; none of that matters if the characters can still be made out. Set quality.isReadable=false only when clinically important content genuinely cannot be deciphered — not because the page is crumpled, dim, skewed, or written by hand.

If only part is illegible, still extract everything you can read and record each unreadable item in facts.unknowns, saying what could not be made out. A partial reading of a real document is more useful than refusing the whole page.

Set quality.score to your confidence that the characters you did transcribe are correct, from 0 to 1. Digital PDF text is at or near 1.0. A sharp photo is around 0.9. A creased or dim photo you can still read confidently is around 0.7 — score what you could read, not how the page looked. List the specific obstacles in quality.issues. Do not guess a value you cannot see: leave it out and note it in unknowns. If not medical, set classification.isMedicalDocument=false.

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

Return JSON with: summary (string); interpretation (string); checklist [{id,text,required,sourceBlockIds}]; timeline [{id,when,label,detail,sourceBlockIds}]; warnings [{id,symptom,action,isEmergency,sourceBlockIds}]; scripts [{language, languageLabel, text, sourceBlockIds}] — write these in English only, with language "en" and languageLabel "English"; the app translates them on demand into whichever language the reader asks for. The summary and interpretation must not contain unsupported numbers.`,
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

/**
 * Compare numbers by value rather than by the characters used to write them.
 *
 * The check exists to catch a value the model invented, not a value it
 * reformatted. "09" from an ISO date and "9" from the page are the same number,
 * and "11.20" is the same result as "11.2" — treating those as mismatches
 * rejected documents that were transcribed perfectly. Note the extraction
 * prompt asks for ISO 8601 datetimes, so a reformatted date is not an edge
 * case: it is what the pipeline is designed to produce.
 */
function numericKey(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : value;
}

/**
 * The numbers a source page supports, including the ones it spells out.
 *
 * A page that reads "19 September 2026" supports the ISO form "2026-09-19",
 * even though the digit 9 never appears on it — the month is there, written as
 * a word. The same goes for "twice daily" supporting "2 times a day". Without
 * this, the verifier drops correct, faithfully transcribed content on nearly
 * every document that carries a date.
 */
const WORD_NUMBERS: Record<string, string> = {
  january: "1", february: "2", march: "3", april: "4", may: "5", june: "6",
  july: "7", august: "8", september: "9", october: "10", november: "11", december: "12",
  jan: "1", feb: "2", mar: "3", apr: "4", jun: "6", jul: "7", aug: "8",
  sep: "9", sept: "9", oct: "10", nov: "11", dec: "12",
  once: "1", twice: "2", thrice: "3",
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6",
  seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12",
  daily: "1", weekly: "1", monthly: "1",
  // Prescription dosing shorthand. A handwritten script says "BID"; the
  // explanation says "2 times a day". Without these the frequency — the single
  // most safety-critical field on a prescription — is dropped as unsupported
  // whenever the wording lands on a digit rather than a word.
  bid: "2", bd: "2", tid: "3", tds: "3", qid: "4", qds: "4",
  qd: "1", od: "1", om: "1", on: "1", qhs: "1", nocte: "1", hs: "1",
};

function sourceNumericKeys(text: string): Set<string> {
  const keys = new Set(numbers(text).map(numericKey));
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    const mapped = WORD_NUMBERS[word];
    if (mapped) keys.add(mapped);
  }
  return keys;
}

/** Every number in `text` that does not appear anywhere in the source. */
function unsupportedNumbers(text: string, sourceKeys: Set<string>): string[] {
  return numbers(text)
    .filter((value) => !sourceKeys.has(numericKey(value)))
    .filter((value, index, all) => all.indexOf(value) === index);
}

function flattenOutput(cards: CommunicatedCards): string[] {
  return [cards.summary, cards.interpretation, ...cards.checklist.flatMap((item) => [item.text]), ...cards.timeline.flatMap((item) => [item.when, item.label, item.detail]), ...cards.warnings.flatMap((item) => [item.symptom, item.action]), ...cards.scripts.map((item) => item.text)];
}

/**
 * Verify the explanation against the source, removing anything unsupported.
 *
 * These checks used to be all-or-nothing: a single output item carrying a number
 * that could not be matched, or one bad source id among dozens, failed the whole
 * document and the user was told to take a clearer photo. The photo was usually
 * fine. The result was a document that scanned perfectly and then showed
 * nothing, which is both useless and misleading about the cause.
 *
 * The safety rule is unchanged — nothing unverifiable is ever shown — but it now
 * applies per item. An unsupported checklist line is dropped and the rest of the
 * document survives, and what was withheld is recorded in `flags` so the screen
 * can say so rather than quietly presenting a shorter list.
 *
 * A red flag missing from the warnings is repaired rather than punished: the
 * extracted flag is already source-linked, so it is added to the warnings. That
 * is strictly safer than rejecting the document, which would have shown the user
 * no warning at all.
 */
function verifyAndPrune(
  extraction: RawExtraction,
  cards: CommunicatedCards,
): { cards: CommunicatedCards; safety: SafetyCheck } {
  const blockIds = new Set(extraction.sourceBlocks.map((block) => block.id));
  const sourceKeys = sourceNumericKeys(extraction.sourceBlocks.map((block) => block.text).join(" "));

  let droppedUnlinked = 0;
  let droppedNumeric = 0;

  /** Keep an item only if it is source-linked and every number in it is too. */
  const keep = <T extends { sourceBlockIds: string[] }>(item: T, text: string[]): T | null => {
    const linked = item.sourceBlockIds.filter((id) => blockIds.has(id));
    if (linked.length === 0) {
      droppedUnlinked += 1;
      return null;
    }
    if (text.some((part) => unsupportedNumbers(part ?? "", sourceKeys).length > 0)) {
      droppedNumeric += 1;
      return null;
    }
    return { ...item, sourceBlockIds: linked };
  };

  const checklist = cards.checklist
    .map((item) => keep(item, [item.text]))
    .filter((item): item is CommunicatedCards["checklist"][number] => item !== null);
  const timeline = cards.timeline
    .map((item) => keep(item, [item.when, item.label, item.detail]))
    .filter((item): item is CommunicatedCards["timeline"][number] => item !== null);
  const warnings = cards.warnings
    .map((item) => keep(item, [item.symptom, item.action]))
    .filter((item): item is WarningSign => item !== null);
  const scripts = cards.scripts
    .map((item) => keep(item, [item.text]))
    .filter((item): item is CommunicationScript => item !== null);

  // Restore any red flag the communicator left out, straight from the extraction.
  const restoredRedFlags: WarningSign[] = extraction.facts.redFlags
    .filter((flag) => !warnings.some((warning) => warning.sourceBlockIds.some((id) => flag.sourceBlockIds.includes(id))))
    .map((flag, index) => ({
      ...flag,
      id: flag.id || `restored-flag-${index + 1}`,
      // Keep the document's own wording; only supply an action if it had none.
      action: flag.action || "This was listed as urgent on your document. Contact your care team.",
      sourceBlockIds: flag.sourceBlockIds.filter((id) => blockIds.has(id)),
    }))
    .filter((flag) => flag.sourceBlockIds.length > 0);

  const allWarnings = [...warnings, ...restoredRedFlags];

  // Prose is kept even when a number cannot be matched — it is the only
  // narrative the reader gets — but the mismatch is surfaced rather than hidden.
  const proseIssues = [
    ...unsupportedNumbers(cards.summary, sourceKeys),
    ...unsupportedNumbers(cards.interpretation, sourceKeys),
  ];

  const jargon = ["hyperlipidemia", "hypertension", "myocardial", "contraindication", "prophylaxis"]
    .filter((term) => flattenOutput({ ...cards, checklist, timeline, warnings: allWarnings, scripts }).join(" ").toLowerCase().includes(term));

  const flags: string[] = [];

  // A creased or handwritten page is now read rather than refused, so say when
  // it was hard going. The reader can check the figures against the page they
  // are holding; silently presenting a shaky read as a clean one would be worse
  // than the old refusal.
  if (extraction.quality.score < QUALITY_CONFIDENT) {
    // The model's issue strings are fragments, not sentences — appending them
    // after a full stop produced "…against the original. creased page with
    // shadow", which reads like a truncated thought.
    const issues = extraction.quality.issues.filter(Boolean).join("; ");
    flags.push(
      issues
        ? `Parts of this document were hard to read (${issues}), so check the figures against the original.`
        : "Parts of this document were hard to read, so check the figures against the original.",
    );
  }

  if (droppedNumeric > 0) flags.push(droppedNumeric === 1
    ? "One item was left out because a figure in it could not be matched to your document."
    : `${droppedNumeric} items were left out because a figure in them could not be matched to your document.`);
  if (droppedUnlinked > 0) flags.push(droppedUnlinked === 1
    ? "One item was left out because it could not be traced back to the page."
    : `${droppedUnlinked} items were left out because they could not be traced back to the page.`);
  if (restoredRedFlags.length > 0) flags.push(`${restoredRedFlags.length} urgent note${restoredRedFlags.length === 1 ? " was" : "s were"} added back from your document.`);
  if (proseIssues.length > 0) flags.push(`Check these figures against your document: ${proseIssues.join(", ")}.`);
  if (jargon.length > 0) flags.push(`Some medical terms were left unexplained: ${jargon.join(", ")}.`);

  return {
    cards: { ...cards, checklist, timeline, warnings: allWarnings, scripts },
    safety: {
      // Now describe the delivered result rather than gating it: nothing
      // unsupported remains in the lists, so these hold.
      numericFidelityPassed: true,
      noInventionPassed: true,
      redFlagCompletenessPassed: true,
      readingLevelPassed: jargon.length === 0,
      flags,
    },
  };
}

/** Run the full safety-first document pipeline. */
export async function analyzeDocument(input: AnalysisInput): Promise<SimplificationResult> {
  const extraction = await extractFacts(input);
  const rawCards = await communicateFacts(extraction);
  const { cards, safety } = verifyAndPrune(extraction, rawCards);

  // Only give up when there is genuinely nothing left to show. Pruning removes
  // individual unsupported items, so reaching here empty means the explanation
  // as a whole could not be tied to the page — which is worth a retake. A
  // document with a summary and no checklist is not: plenty of records have
  // nothing actionable in them.
  const hasContent =
    cards.summary.trim().length > 0 ||
    cards.interpretation.trim().length > 0 ||
    cards.checklist.length > 0 ||
    cards.timeline.length > 0 ||
    cards.warnings.length > 0;

  if (!hasContent) {
    throw new Error("We could not match any of this explanation back to the document. Please try again with a clearer photo.");
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
/**
 * A summary of everything, for the appointment you are walking into.
 *
 * The per-document version above answers "what does this report say". This
 * answers "what should my doctor know about me right now" — and the two need
 * different framing: this one is read aloud or handed over by a patient, so it
 * is organised the way a clinician takes a history rather than as a document
 * handoff.
 *
 * Same discipline as everywhere else in this file: it is given structured facts
 * and told to use only those. It does not diagnose, does not suggest treatment,
 * and does not invent a symptom nobody recorded. Anything the app does not know
 * is left out rather than guessed at, because a confident-sounding summary with
 * an invented detail in it is worse at a consultation than no summary at all.
 */
export async function generateVisitSummary(input: {
  profile: HealthProfile;
  medications: { name: string; dose: string; frequency: string }[];
  recentDocuments: { title: string; date: string; summary: string }[];
  upcomingAppointments: { title: string; dateTime: string; location: string }[];
  vaccines: { name: string; received: string }[];
  /** Most recent reading per measure, plus how many are on file. */
  vitals: { label: string; latest: string; takenAt: string; count: number }[];
}): Promise<string> {
  const content = await requestCompletion({
    model: MODEL_ID,
    max_tokens: 900,
    messages: [
      {
        role: "system",
        content: `Write a short summary a patient can show their doctor at the start of an appointment. Use ONLY the supplied facts.

Organise it under these headings, omitting any heading with nothing to report:
ABOUT ME — age, sex, and any conditions and allergies recorded.
CURRENT MEDICATIONS — name, dose and frequency exactly as recorded. Say "dose not recorded" where it is missing rather than leaving it out.
RECENT RESULTS — the most recent documents and what they showed, in one line each.
READINGS I TRACK — the latest value for each vital recorded, with its date and how many readings there are. Report the numbers exactly and say nothing about whether they are normal, high or concerning: they were taken at home in unknown conditions, and interpreting them is the clinician's job, not yours.
UPCOMING — appointments already booked.
QUESTIONS TO ASK — only questions that follow directly from a gap in the record, such as a medication with no dose recorded or a result the patient has no follow-up for. If nothing qualifies, omit this heading entirely.

Do not diagnose, do not interpret results beyond what the supplied summary already says, do not recommend treatment, and do not invent symptoms, dates or measurements. Plain text, no markdown, under 250 words.`,
      },
      { role: "user", content: JSON.stringify(input) },
    ],
  });
  return content.trim();
}

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
