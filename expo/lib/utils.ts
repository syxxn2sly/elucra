/**
 * What the user picks to say "I have none of these", as opposed to leaving a
 * step blank — which means "I'll fill this in later".
 *
 * It is stored in the profile so the answer survives, and so the document
 * pipeline can tell the model "no known allergies" rather than sending nothing.
 * Anywhere that turns a profile field into a list of real entries has to filter
 * it out, or it becomes a medication called None.
 */
export const NONE_ANSWER = "None";

export function isNoneAnswer(value: string): boolean {
  return value.trim().toLowerCase() === NONE_ANSWER.toLowerCase();
}

import { Alert, Platform } from "react-native";

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatMonthYear(month: number | null, year: number | null): string {
  if (!month || !year) return "Date not recorded";
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const monthName = months[month - 1] ?? "Unknown";
  return `${monthName} ${year}`;
}

export function computeNextDue(
  monthReceived: number | null,
  yearReceived: number | null,
  cadenceMonths: number | null,
): string | null {
  if (!monthReceived || !yearReceived || !cadenceMonths) return null;
  const date = new Date(yearReceived, monthReceived - 1, 15);
  date.setMonth(date.getMonth() + cadenceMonths);
  return date.toISOString();
}

export function formatDueCountdown(dueDate: string | null): string {
  if (!dueDate) return "";
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays <= 30) return `Due in ${diffDays} days`;
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths <= 12) return `Due in ${diffMonths} month${diffMonths > 1 ? "s" : ""}`;
  const diffYears = Math.floor(diffDays / 365);
  return `Due in ${diffYears} year${diffYears > 1 ? "s" : ""}`;
}

/**
 * True once a due date is close enough to act on: overdue, or within the
 * month. Distinct from formatDueCountdown's day-count math being duplicated
 * inline wherever a screen needs to decide whether to surface a renewal
 * action rather than just display the countdown text.
 */
export function isDueSoon(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const diffDays = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diffDays <= 30;
}

/**
 * Sort vaccine records by next-due date (soonest first).
 * Undated vaccines go to the end.
 */
export function sortByDueDate<T extends { nextDueDate: string | null; hasDate: boolean }>(
  records: T[],
): T[] {
  return [...records].sort((a, b) => {
    if (!a.nextDueDate && !b.nextDueDate) return 0;
    if (!a.nextDueDate) return 1;
    if (!b.nextDueDate) return -1;
    return new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime();
  });
}

/**
 * Simple XOR-based obfuscation for health card data stored on device.
 * This is NOT real encryption — it adds a light layer on top of SecureStore's
 * own encryption. The real security boundary is biometric auth + SecureStore.
 */
export function obfuscate(text: string, key: string): string {
  if (!text) return text;
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(
      text.charCodeAt(i) ^ key.charCodeAt(i % key.length),
    );
  }
  return btoa(unescape(encodeURIComponent(result)));
}

export function deobfuscate(encoded: string, key: string): string {
  if (!encoded) return encoded;
  try {
    const decoded = decodeURIComponent(escape(atob(encoded)));
    let result = "";
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(
        decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length),
      );
    }
    return result;
  } catch {
    return "";
  }
}

export function formatDateDisplay(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Medication names captured during onboarding that still have no proper record.
 *
 * Onboarding stores medications on the profile as one comma-joined string, while
 * the Medications tab tracks structured records carrying dose, frequency and
 * reminders. Someone who listed their medications during setup has therefore
 * "entered" them without the app being able to remind them of anything — and the
 * Home count reads zero, which looks like the app lost them. This returns the
 * names still waiting on those details so the UI can ask for them.
 */
/**
 * Medications that exist but are not yet usable.
 *
 * Onboarding records what the user typed — a bare drug name, with no dose or
 * schedule. That is enough to count and to show, but not enough to remind
 * anyone to take anything, so these need finishing. This is what drives the
 * "needs details" prompt on the dashboard and the badge on the Meds tab.
 *
 * Deliberately not a check for "no reminder": choosing not to be reminded about
 * a medication you have fully described is a valid, finished state.
 */
export function incompleteMedications<T extends { dose: string; frequency: string }>(
  records: T[],
): T[] {
  return records.filter((record) => !record.dose.trim() || !record.frequency.trim());
}

export function pendingProfileMedications(
  profileMedications: string,
  records: { name: string }[],
): string[] {
  const recorded = new Set(records.map((record) => record.name.trim().toLowerCase()));
  return profileMedications
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name) => !recorded.has(name.toLowerCase()));
}

/**
 * Ask before doing something destructive, on every platform.
 *
 * `Alert.alert` is literally `static alert() {}` in react-native-web — an empty
 * function. Every confirm-then-delete in the app therefore did nothing at all in
 * the browser: the button appeared dead, nothing was removed, and no error was
 * raised to explain it. Native keeps the real dialog; web falls back to the
 * browser's own confirm rather than silently dropping the action.
 */
export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
): void {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

/**
 * Tell the user something, on every platform.
 *
 * Companion to confirmDestructive, and needed for the same reason: react-native-web
 * implements Alert as an empty function, so every "permission needed", "check this
 * field" and "saved" message in the app was invisible in a browser. A validation
 * failure that says nothing is worse than one that says the wrong thing — the form
 * simply appears not to respond.
 */
export function notify(title: string, message?: string): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
