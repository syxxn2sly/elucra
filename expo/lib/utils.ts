/** CLAIRITY — Utility helpers. */

/**
 * Generate a unique ID.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Format a month/year pair into a human-readable string.
 */
export function formatMonthYear(month: number | null, year: number | null): string {
  if (!month || !year) return "Date not recorded";
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const monthName = months[month - 1] ?? "Unknown";
  return `${monthName} ${year}`;
}

/**
 * Compute the next-due date from a received date and a cadence in months.
 */
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

/**
 * Format a next-due ISO date into a friendly countdown string.
 */
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

/**
 * Format a date string for display.
 */
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
