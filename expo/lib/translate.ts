/**
 * CLAIRITY — translation of an already-simplified document.
 *
 * The pipeline is: document → Claude (extract facts, then explain them) →
 * this module (translate the explanation) → the user's language.
 *
 * Translating *after* simplification is deliberate. Machine-translating the raw
 * report first would hand the model a mistranslated source and every downstream
 * safety check would be validating the wrong text.
 *
 * The safety problem this module has to solve is that Claude's output is
 * verified — numbers checked against the source, red flags checked for
 * completeness — and then a general-purpose translation engine rewrites it,
 * unverified. Two failure modes matter in medical text:
 *
 *   - a dropped negation ("do not take with food" → "take with food") reads
 *     perfectly fluent and is dangerous;
 *   - a mangled dosage.
 *
 * We cannot prevent the first with an MT engine, which is why the UI keeps the
 * English alongside the translation for instructions and red flags. We can
 * prevent the second: every number and dose is marked no-translate so it passes
 * through byte-identical.
 */

import { translateStrings as translateWithClaude } from "./ai-service";
import type { SimplificationResult } from "./types";

const KEY = process.env.EXPO_PUBLIC_AZURE_TRANSLATOR_KEY;
const REGION = process.env.EXPO_PUBLIC_AZURE_TRANSLATOR_REGION;
const ENDPOINT = "https://api.cognitive.microsofttranslator.com/translate";
const API_VERSION = "3.0";

/** Azure caps a request at 1000 elements and 50,000 characters. Stay well under. */
const MAX_ITEMS_PER_REQUEST = 100;
const MAX_CHARS_PER_REQUEST = 40000;

export interface TranslationLanguage {
  code: string;
  /** Shown in the picker, in the language itself — someone looking for their own language reads it there. */
  label: string;
  english: string;
}

/**
 * Offered languages.
 *
 * Ordered by speakers at home in Canada after English and French, then the
 * others we were asked to cover. `en` is first and means "leave it as written".
 *
 * `english` is not decoration — it is the name handed to Claude as the
 * translation target, so it has to be the language's ordinary English name.
 *
 * Chinese is listed by the dialect people actually name when asked what they
 * speak, rather than by script. The script still differs underneath — Mandarin
 * renders Simplified, Cantonese Traditional — which is what `english` carries
 * to the model.
 */
export const TRANSLATION_LANGUAGES: TranslationLanguage[] = [
  { code: "en", label: "English", english: "English" },
  { code: "fr", label: "Français", english: "French" },
  { code: "zh-Hans", label: "普通话", english: "Mandarin Chinese, in Simplified characters" },
  { code: "yue", label: "廣東話", english: "Cantonese, in Traditional characters" },
  { code: "pa", label: "ਪੰਜਾਬੀ", english: "Punjabi" },
  { code: "es", label: "Español", english: "Spanish" },
  { code: "tl", label: "Tagalog", english: "Tagalog" },
  { code: "ar", label: "العربية", english: "Arabic" },
  { code: "it", label: "Italiano", english: "Italian" },
  { code: "hi", label: "हिन्दी", english: "Hindi" },
  { code: "gu", label: "ગુજરાતી", english: "Gujarati" },
  { code: "sw", label: "Kiswahili", english: "Swahili" },
  { code: "ur", label: "اردو", english: "Urdu" },
  { code: "vi", label: "Tiếng Việt", english: "Vietnamese" },
  { code: "pt", label: "Português", english: "Portuguese" },
  { code: "ru", label: "Русский", english: "Russian" },
];

/** Which engine will actually run. Claude is the default; Azure takes over once configured. */
export type TranslationProvider = "claude" | "azure" | "none";

export function translationProvider(): TranslationProvider {
  if (KEY && REGION) return "azure";
  // Claude is reachable either through the proxy (which holds the Anthropic key
  // server-side) or, in local development only, with the key in the bundle.
  // Checking only the latter would report "none" on every shipped build.
  if (process.env.EXPO_PUBLIC_API_BASE || process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY) return "claude";
  return "none";
}

export function isTranslationConfigured(): boolean {
  return translationProvider() !== "none";
}

export function isAzureConfigured(): boolean {
  return Boolean(KEY && REGION);
}

export function languageLabel(code: string): string {
  return TRANSLATION_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/** Right-to-left scripts need `writingDirection` on the rendered text. */
export function isRightToLeft(code: string): boolean {
  return ["ar", "ur", "fa", "he"].includes(code);
}

export class TranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationError";
  }
}

/* ---------------------------------------------------------------- protection */

const AMP = /&/g;
const LT = /</g;
const GT = />/g;

function escapeHtml(text: string): string {
  return text.replace(AMP, "&amp;").replace(LT, "&lt;").replace(GT, "&gt;");
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

/**
 * Numbers, doses, times and ranges. Anything matched here is wrapped so Azure
 * leaves it exactly as-is — "500 mg twice daily" must never come back as a
 * different number, and localised digits would make a dose harder to read
 * against the pill bottle, not easier.
 */
const NUMERIC =
  /\d+(?:[.,:/-]\d+)*\s?(?:mg|mcg|µg|g|kg|ml|mL|L|IU|units?|tablets?|capsules?|puffs?|drops?|%|°C|°F)?/gi;

function protectNumbers(text: string): string {
  return escapeHtml(text).replace(NUMERIC, (match) => `<span translate="no">${match}</span>`);
}

function unprotectNumbers(text: string): string {
  return unescapeHtml(text.replace(/<span translate="no">([\s\S]*?)<\/span>/gi, "$1"));
}

/* ------------------------------------------------------------------ requests */

async function translateBatch(texts: string[], to: string): Promise<string[]> {
  const url = `${ENDPOINT}?api-version=${API_VERSION}&from=en&to=${encodeURIComponent(to)}&textType=html`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": KEY as string,
      "Ocp-Apim-Subscription-Region": REGION as string,
    },
    body: JSON.stringify(texts.map((text) => ({ Text: protectNumbers(text) }))),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new TranslationError("The translation key is missing or invalid.");
    }
    if (response.status === 429) {
      throw new TranslationError("Translation is busy right now. Please try again in a moment.");
    }
    throw new TranslationError("We could not translate this document. Showing it in English.");
  }

  const data = (await response.json()) as { translations?: { text?: string }[] }[];
  return texts.map((original, index) => {
    const translated = data[index]?.translations?.[0]?.text;
    return typeof translated === "string" ? unprotectNumbers(translated) : original;
  });
}

/**
 * Translate a list of strings, preserving order and index. Empty entries are
 * passed straight through so the caller can map results back positionally
 * without worrying about Azure collapsing blanks.
 */
export async function translateTexts(texts: string[], to: string): Promise<string[]> {
  if (to === "en" || texts.length === 0) return texts;

  const provider = translationProvider();
  if (provider === "none") {
    throw new TranslationError("Translation is not set up in this build.");
  }

  // Claude is the default engine. It costs tokens where Azure's free tier does
  // not, but it keeps negations and dosages intact and can explain a term rather
  // than transliterate it — which is the whole point of this screen.
  if (provider === "claude") {
    const language = TRANSLATION_LANGUAGES.find((l) => l.code === to);
    if (!language) throw new TranslationError("That language is not available.");
    try {
      return await translateWithClaude(texts, language.english);
    } catch (error) {
      throw new TranslationError(
        error instanceof Error ? error.message : "We could not translate this document.",
      );
    }
  }

  const results = [...texts];
  const pending = texts
    .map((text, index) => ({ text, index }))
    .filter((entry) => entry.text.trim().length > 0);

  let batch: { text: string; index: number }[] = [];
  let batchChars = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    const translated = await translateBatch(
      batch.map((entry) => entry.text),
      to,
    );
    batch.forEach((entry, i) => {
      results[entry.index] = translated[i];
    });
    batch = [];
    batchChars = 0;
  };

  for (const entry of pending) {
    if (batch.length >= MAX_ITEMS_PER_REQUEST || batchChars + entry.text.length > MAX_CHARS_PER_REQUEST) {
      await flush();
    }
    batch.push(entry);
    batchChars += entry.text.length;
  }
  await flush();

  return results;
}

/* ------------------------------------------------------- document translation */

/**
 * Translate the human-readable parts of an analysis.
 *
 * Deliberately NOT translated:
 *   - `facts` — the verified extraction the app reasons over. It has to stay
 *     comparable to the source document, and nothing renders it as prose.
 *   - `scripts` — communication scripts are already generated per language and
 *     carry their own `language` tag. Running a Punjabi script through an
 *     English-source translation would produce nonsense.
 */
export async function translateSimplification(
  result: SimplificationResult,
  to: string,
): Promise<SimplificationResult> {
  if (to === "en") return result;

  // Flatten every translatable string into one ordered list so the whole
  // document costs one round trip rather than one per section.
  const source: string[] = [
    result.title,
    result.summary,
    result.interpretation,
    ...result.checklist.map((item) => item.text),
    ...result.timeline.map((item) => item.label),
    ...result.timeline.map((item) => item.detail),
    ...result.warnings.map((warning) => warning.symptom),
    ...result.warnings.map((warning) => warning.action),
  ];

  const translated = await translateTexts(source, to);

  let cursor = 0;
  const next = (): string => translated[cursor++];

  const title = next();
  const summary = next();
  const interpretation = next();
  const checklist = result.checklist.map((item) => ({ ...item, text: next() }));
  const timelineLabels = result.timeline.map(() => next());
  const timelineDetails = result.timeline.map(() => next());
  const warningSymptoms = result.warnings.map(() => next());
  const warningActions = result.warnings.map(() => next());

  return {
    ...result,
    title,
    summary,
    interpretation,
    checklist,
    timeline: result.timeline.map((item, i) => ({
      ...item,
      label: timelineLabels[i],
      detail: timelineDetails[i],
    })),
    warnings: result.warnings.map((warning, i) => ({
      ...warning,
      symptom: warningSymptoms[i],
      action: warningActions[i],
    })),
  };
}
