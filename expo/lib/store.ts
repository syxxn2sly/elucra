/**
 * CLAIRITY — App-wide context provider using @nkzw/create-context-hook.
 *
 * Consolidates all persistent state: health profile, documents, vaccines,
 * medications, and health card. Uses AsyncStorage for persistence.
 */

import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import type {
  HealthProfile,
  SavedDocument,
  VaccineRecord,
  Medication,
  HealthCardData,
  FamilyDoctor,
  Appointment,
  VitalReading,
  ScreeningRecord,
} from "./types";
import { generateId, computeNextDue } from "./utils";
import { VACCINE_CATALOG } from "./vaccine-data";
import { cancelReminder, scheduleAppointmentReminder, scheduleMedicationReminder } from "./reminders";

const STORAGE_KEYS = {
  profile: "@clairity/profile",
  documents: "@clairity/documents",
  vaccines: "@clairity/vaccines",
  medications: "@clairity/medications",
  healthCard: "@clairity/healthcard",
  familyDoctor: "@clairity/family-doctor",
  appointments: "@clairity/appointments",
  vitals: "@clairity/vitals",
  screenings: "@clairity/screenings",
  favouriteLocation: "@clairity/favourite-location",
  preferredLanguage: "@clairity/preferred-language",
} as const;

/** Enough for a GP, a specialist and a lab without becoming a list to scroll. */
export const MAX_FAVOURITE_LOCATIONS = 3;

const DEFAULT_FAMILY_DOCTOR: FamilyDoctor = {
  doctorName: "",
  clinicName: "",
  phone: "",
  fax: "",
  address: "",
  afterHoursInstructions: "",
};

const DEFAULT_PROFILE: HealthProfile = {
  name: "",
  age: "",
  gender: "",
  province: "",
  sexuallyActive: "",
  conditions: "",
  surgeries: "",
  medications: "",
  allergies: "",
  familyHistory: "",
  smokingStatus: "",
  alcoholStatus: "",
  occupation: "",
  vaccineStatus: "",
  onboarded: false,
};

/** Split one of the profile's comma-separated free-text lists. */
function profileList(value: string): string[] {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function useClairityState() {
  const [profile, setProfile] = useState<HealthProfile>(DEFAULT_PROFILE);
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [vaccines, setVaccines] = useState<VaccineRecord[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [vitals, setVitals] = useState<VitalReading[]>([]);
  const [screenings, setScreenings] = useState<ScreeningRecord[]>([]);
  const [healthCard, setHealthCard] = useState<HealthCardData | null>(null);
  const [familyDoctor, setFamilyDoctor] = useState<FamilyDoctor>(DEFAULT_FAMILY_DOCTOR);
  /** Places pinned for one-tap reuse when booking an appointment. */
  const [favouriteLocations, setFavouriteLocations] = useState<string[]>([]);
  /** Language new documents are translated into. "en" leaves them as written. */
  const [preferredLanguage, setPreferredLanguage] = useState<string>("en");
  const [loaded, setLoaded] = useState(false);

  // Load all persisted state on mount
  useEffect(() => {
    (async () => {
      try {
        const [
          profileStr,
          docsStr,
          vaccinesStr,
          medsStr,
          cardStr,
          doctorStr,
          appointmentsStr,
          vitalsStr,
          screeningsStr,
          favouriteLocationStr,
          preferredLanguageStr,
        ] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.profile),
          AsyncStorage.getItem(STORAGE_KEYS.documents),
          AsyncStorage.getItem(STORAGE_KEYS.vaccines),
          AsyncStorage.getItem(STORAGE_KEYS.medications),
          AsyncStorage.getItem(STORAGE_KEYS.healthCard),
          AsyncStorage.getItem(STORAGE_KEYS.familyDoctor),
          AsyncStorage.getItem(STORAGE_KEYS.appointments),
          AsyncStorage.getItem(STORAGE_KEYS.vitals),
          AsyncStorage.getItem(STORAGE_KEYS.screenings),
          AsyncStorage.getItem(STORAGE_KEYS.favouriteLocation),
          AsyncStorage.getItem(STORAGE_KEYS.preferredLanguage),
        ]);

        if (profileStr) setProfile(JSON.parse(profileStr) as HealthProfile);
        if (docsStr) setDocuments(JSON.parse(docsStr) as SavedDocument[]);
        if (vaccinesStr) {
          // Records written before dose tracking have no `doses`. Their single
          // received date is dose 1, so synthesise that rather than showing an
          // existing vaccine as having no doses at all.
          setVaccines(
            (JSON.parse(vaccinesStr) as VaccineRecord[]).map((record) => ({
              ...record,
              doses: record.doses?.length
                ? record.doses
                : record.hasDate
                  ? [{ doseNumber: 1, monthReceived: record.monthReceived, yearReceived: record.yearReceived }]
                  : [],
            })),
          );
        }
        if (medsStr) setMedications((JSON.parse(medsStr) as Medication[]).map((medication) => ({ ...medication, reminderEnabled: medication.reminderEnabled ?? false, reminderTime: medication.reminderTime ?? "", notificationId: medication.notificationId ?? null })));
        if (appointmentsStr) setAppointments(JSON.parse(appointmentsStr) as Appointment[]);
        if (vitalsStr) setVitals(JSON.parse(vitalsStr) as VitalReading[]);
        if (screeningsStr) setScreenings(JSON.parse(screeningsStr) as ScreeningRecord[]);
        if (cardStr) setHealthCard(JSON.parse(cardStr) as HealthCardData);
        if (doctorStr) setFamilyDoctor({ ...DEFAULT_FAMILY_DOCTOR, ...(JSON.parse(doctorStr) as FamilyDoctor) });
        // Stored as a bare string when there was only one favourite; the array
        // form is JSON. Read both so an existing favourite survives the upgrade.
        if (favouriteLocationStr) {
          try {
            const parsed: unknown = JSON.parse(favouriteLocationStr);
            setFavouriteLocations(
              Array.isArray(parsed)
                ? (parsed as string[]).filter((entry) => typeof entry === "string" && entry.trim()).slice(0, MAX_FAVOURITE_LOCATIONS)
                : [favouriteLocationStr],
            );
          } catch {
            setFavouriteLocations([favouriteLocationStr]);
          }
        }
        if (preferredLanguageStr) setPreferredLanguage(preferredLanguageStr);
      } catch (error) {
        console.error("[ELUCRA] Failed to load state:", error);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Persist on change
  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
  }, [profile, loaded]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEYS.documents, JSON.stringify(documents));
  }, [documents, loaded]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEYS.vaccines, JSON.stringify(vaccines));
  }, [vaccines, loaded]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEYS.medications, JSON.stringify(medications));
  }, [medications, loaded]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEYS.appointments, JSON.stringify(appointments));
  }, [appointments, loaded]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEYS.vitals, JSON.stringify(vitals));
  }, [vitals, loaded]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEYS.screenings, JSON.stringify(screenings));
  }, [screenings, loaded]);

  useEffect(() => {
    if (loaded) {
      if (healthCard) {
        AsyncStorage.setItem(STORAGE_KEYS.healthCard, JSON.stringify(healthCard));
      } else {
        AsyncStorage.removeItem(STORAGE_KEYS.healthCard);
      }
    }
  }, [healthCard, loaded]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEYS.familyDoctor, JSON.stringify(familyDoctor));
  }, [familyDoctor, loaded]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEYS.favouriteLocation, JSON.stringify(favouriteLocations));
  }, [favouriteLocations, loaded]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEYS.preferredLanguage, preferredLanguage);
  }, [preferredLanguage, loaded]);

  // --- Profile actions ---
  /**
   * Finish onboarding, turning the answers into records the rest of the app can
   * see.
   *
   * The questionnaire stores medications and vaccines on the profile as plain
   * comma-separated text, but every surface that counts them — the dashboard
   * tiles, the Meds tab, the Vaccines tab — reads the `medications` and
   * `vaccines` collections. Writing only the profile meant a user could answer
   * the questions, watch their answers appear in Settings, and still be told
   * they had nothing tracked. The strings stay on the profile as the record of
   * what was said; these are the entries built from them.
   *
   * Medications arrive as a bare name, so they are created without dose or
   * frequency and surface as "needs details" until the user fills them in.
   * Vaccines are matched to the catalogue by name and recorded without a date,
   * which is what the onboarding copy promises ("you can add dates later").
   */
  const syncProfileDerivedRecords = useCallback((fields: { medications?: string; vaccineStatus?: string }) => {

    const names = (value: string): string[] =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

    const now = new Date().toISOString();

    if (typeof fields.medications === "string") setMedications((prev) => {
      const existing = new Set(prev.map((med) => med.name.trim().toLowerCase()));
      const additions: Medication[] = [];
      for (const name of names(fields.medications ?? "")) {
        if (existing.has(name.toLowerCase())) continue;
        existing.add(name.toLowerCase());
        additions.push({
          id: generateId(),
          name,
          dose: "",
          frequency: "",
          notes: "",
          // No reminder: we have no dose or schedule yet, and scheduling a
          // notification the user never asked for would be worse than none.
          reminderEnabled: false,
          reminderTime: "09:00",
          notificationId: null,
          createdAt: now,
        });
      }
      return additions.length ? [...prev, ...additions] : prev;
    });

    if (typeof fields.vaccineStatus === "string") setVaccines((prev) => {
      const existing = new Set(prev.map((record) => record.vaccineId));
      const additions: VaccineRecord[] = [];

      // The chip input joins selections with ", " and several catalogue names
      // contain commas of their own — "Tetanus, Diphtheria, Pertussis (Tdap)"
      // being the obvious one. Splitting on commas therefore shreds exactly the
      // vaccines most people select. Match catalogue names against the whole
      // string instead, longest first so a long name is never mistaken for a
      // shorter one nested inside it, consuming each match so it cannot be
      // counted twice.
      let remaining = (fields.vaccineStatus ?? "").toLowerCase();
      const byLongestName = [...VACCINE_CATALOG].sort((a, b) => b.name.length - a.name.length);

      for (const info of byLongestName) {
        const needle = info.name.toLowerCase();
        if (!needle || !remaining.includes(needle)) continue;
        remaining = remaining.split(needle).join(" ");

        // Anything typed in by hand that is not in the catalogue is left on the
        // profile text only — a record needs a catalogue id to drive its
        // schedule, and inventing one would break the next-due calculation.
        if (existing.has(info.id)) continue;
        existing.add(info.id);
        additions.push({
          id: generateId(),
          vaccineId: info.id,
          name: info.name,
          category: info.category,
          monthReceived: null,
          yearReceived: null,
          hasDate: false,
          doses: [],
          proofImageUri: null,
          verified: false,
          nextDueDate: null,
          isTravel: false,
          travelDestination: null,
          createdAt: now,
        });
      }
      return additions.length ? [...prev, ...additions] : prev;
    });
  }, []);

  const completeOnboarding = useCallback(
    (finalProfile: HealthProfile) => {
      setProfile({ ...finalProfile, onboarded: true });
      syncProfileDerivedRecords({
        medications: finalProfile.medications,
        vaccineStatus: finalProfile.vaccineStatus,
      });
    },
    [syncProfileDerivedRecords],
  );

  /**
   * Update profile fields, keeping the records they imply in step.
   *
   * Medications and vaccines live in two places: as free text on the profile,
   * which is what the questionnaire and Settings edit, and as records, which is
   * what the dashboard tiles and the Meds and Vaccines tabs count. Editing the
   * text alone left the two disagreeing — a medication added in Settings showed
   * up in the profile and nowhere else, exactly as it did after onboarding
   * before that path was fixed. Any writer of these fields now goes through the
   * same sync.
   */
  const updateProfile = useCallback((updates: Partial<HealthProfile>) => {
    setProfile((prev) => ({ ...prev, ...updates }));
    if (typeof updates.medications === "string" || typeof updates.vaccineStatus === "string") {
      syncProfileDerivedRecords({
        medications: updates.medications,
        vaccineStatus: updates.vaccineStatus,
      });
    }
  }, [syncProfileDerivedRecords]);


  const resetProfile = useCallback(() => {
    setProfile(DEFAULT_PROFILE);
    setDocuments([]);
    setVaccines([]);
    setMedications([]);
    setAppointments([]);
    setHealthCard(null);
    setFamilyDoctor(DEFAULT_FAMILY_DOCTOR);
  }, []);

  // --- Document actions ---
  const addDocument = useCallback((doc: SavedDocument) => {
    setDocuments((prev) => [doc, ...prev]);
  }, []);

  const removeDocument = useCallback((id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const toggleChecklistItem = useCallback(
    (docId: string, itemId: string) => {
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === docId
            ? {
                ...doc,
                result: {
                  ...doc.result,
                  checklist: doc.result.checklist.map((item) =>
                    item.id === itemId ? { ...item, done: !item.done } : item,
                  ),
                },
              }
            : doc,
        ),
      );
    },
    [],
  );

  // --- Vitals ---
  /**
   * Newest first on write, so every reader gets chronological order without
   * having to sort. Readings are entered out of order more often than you would
   * think — someone logs this morning's blood pressure at lunchtime.
   */
  const addVital = useCallback((reading: Omit<VitalReading, "id" | "createdAt">) => {
    const record: VitalReading = { ...reading, id: generateId(), createdAt: new Date().toISOString() };
    setVitals((prev) => [record, ...prev].sort((a, b) => b.takenAt.localeCompare(a.takenAt)));
  }, []);

  /** One record per screening: recording it again replaces the date. */
  const recordScreening = useCallback((screeningId: string, month: number, year: number) => {
    setScreenings((prev) => {
      const existing = prev.find((entry) => entry.screeningId === screeningId);
      if (existing) {
        return prev.map((entry) =>
          entry.screeningId === screeningId ? { ...entry, monthDone: month, yearDone: year } : entry,
        );
      }
      return [
        ...prev,
        {
          id: generateId(),
          screeningId,
          monthDone: month,
          yearDone: year,
          createdAt: new Date().toISOString(),
        },
      ];
    });
  }, []);

  const removeScreening = useCallback((screeningId: string) => {
    setScreenings((prev) => prev.filter((entry) => entry.screeningId !== screeningId));
  }, []);

  const removeVital = useCallback((id: string) => {
    setVitals((prev) => prev.filter((reading) => reading.id !== id));
  }, []);

  // --- Vaccine actions ---
  const addVaccine = useCallback(
    (vaccineId: string, month: number | null, year: number | null, hasDate: boolean) => {
      const info = VACCINE_CATALOG.find((v) => v.id === vaccineId);
      if (!info) return;

      const nextDue = computeNextDue(month, year, info.cadenceMonths);

      const record: VaccineRecord = {
        id: generateId(),
        vaccineId,
        name: info.name,
        category: info.category,
        monthReceived: month,
        yearReceived: year,
        hasDate,
        // A vaccine added with a date has had its first dose. Without a date it
        // is recorded as "had it, don't know when" and the series starts empty.
        doses: hasDate ? [{ doseNumber: 1, monthReceived: month, yearReceived: year }] : [],
        proofImageUri: null,
        verified: false,
        nextDueDate: nextDue,
        isTravel: false,
        travelDestination: null,
        createdAt: new Date().toISOString(),
      };
      setVaccines((prev) => [...prev, record]);
    },
    [],
  );

  const addTravelVaccine = useCallback(
    (vaccineId: string, destination: string) => {
      const info = VACCINE_CATALOG.find((v) => v.id === vaccineId);
      if (!info) return;

      // Don't duplicate if already tracked
      if (vaccines.some((v) => v.vaccineId === vaccineId && v.isTravel)) return;

      const record: VaccineRecord = {
        id: generateId(),
        vaccineId,
        name: info.name,
        category: info.category,
        monthReceived: null,
        yearReceived: null,
        hasDate: false,
        doses: [],
        proofImageUri: null,
        verified: false,
        nextDueDate: null,
        isTravel: true,
        travelDestination: destination,
        createdAt: new Date().toISOString(),
      };
      setVaccines((prev) => [...prev, record]);
    },
    [vaccines],
  );

  const updateVaccineDate = useCallback(
    (id: string, month: number | null, year: number | null, hasDate: boolean) => {
      setVaccines((prev) =>
        prev.map((v) => {
          if (v.id !== id) return v;
          const info = VACCINE_CATALOG.find((vi) => vi.id === v.vaccineId);
          const nextDue = computeNextDue(month, year, info?.cadenceMonths ?? null);
          // Editing "the" date edits dose 1, so the series and the summary
          // fields cannot drift apart.
          const doses = hasDate
            ? [
                { doseNumber: 1, monthReceived: month, yearReceived: year },
                ...v.doses.filter((dose) => dose.doseNumber !== 1),
              ].sort((a, b) => a.doseNumber - b.doseNumber)
            : v.doses.filter((dose) => dose.doseNumber !== 1);
          return { ...v, monthReceived: month, yearReceived: year, hasDate, doses, nextDueDate: nextDue };
        }),
      );
    },
    [],
  );

  /**
   * Record or change one dose of a course.
   *
   * Several vaccines are only complete after two or three shots — Shingrix,
   * hepatitis B, HPV — and a single received date could not express "dose 1 in
   * March, dose 2 still outstanding". Dose 1 stays mirrored onto the record's
   * own month/year so every existing screen keeps working unchanged.
   */
  const recordVaccineDose = useCallback(
    (id: string, doseNumber: number, month: number | null, year: number | null) => {
      setVaccines((prev) =>
        prev.map((v) => {
          if (v.id !== id) return v;
          const info = VACCINE_CATALOG.find((vi) => vi.id === v.vaccineId);
          const doses = [
            ...v.doses.filter((dose) => dose.doseNumber !== doseNumber),
            { doseNumber, monthReceived: month, yearReceived: year },
          ].sort((a, b) => a.doseNumber - b.doseNumber);

          const first = doses.find((dose) => dose.doseNumber === 1);
          // The next reminder runs from the most recent dose, not the first.
          const latest = doses[doses.length - 1];
          const complete = info ? doses.length >= info.doseCount : true;
          const nextDue = complete
            ? computeNextDue(latest?.monthReceived ?? null, latest?.yearReceived ?? null, info?.cadenceMonths ?? null)
            : computeNextDue(latest?.monthReceived ?? null, latest?.yearReceived ?? null, info?.doseIntervalMonths ?? null);

          return {
            ...v,
            doses,
            monthReceived: first?.monthReceived ?? v.monthReceived,
            yearReceived: first?.yearReceived ?? v.yearReceived,
            hasDate: Boolean(first?.monthReceived && first?.yearReceived) || v.hasDate,
            nextDueDate: nextDue,
          };
        }),
      );
    },
    [],
  );

  const removeVaccineDose = useCallback((id: string, doseNumber: number) => {
    setVaccines((prev) =>
      prev.map((v) =>
        v.id === id ? { ...v, doses: v.doses.filter((dose) => dose.doseNumber !== doseNumber) } : v,
      ),
    );
  }, []);

  /** Attach or clear the proof photo for one dose of a course. */
  const setVaccineDoseProof = useCallback(
    (id: string, doseNumber: number, proofUri: string | null) => {
      setVaccines((prev) =>
        prev.map((v) =>
          v.id === id
            ? {
                ...v,
                doses: v.doses.map((dose) =>
                  dose.doseNumber === doseNumber ? { ...dose, proofImageUri: proofUri } : dose,
                ),
              }
            : v,
        ),
      );
    },
    [],
  );

  const setVaccineProof = useCallback((id: string, proofUri: string | null) => {
    setVaccines((prev) =>
      prev.map((v) =>
        v.id === id ? { ...v, proofImageUri: proofUri, verified: proofUri !== null } : v,
      ),
    );
  }, []);

  const removeVaccine = useCallback((id: string) => {
    setVaccines((prev) => prev.filter((v) => v.id !== id));
  }, []);

  // --- Medication actions ---
  const addMedication = useCallback(async (med: Omit<Medication, "id" | "createdAt" | "notificationId">) => {
    const record: Medication = { ...med, id: generateId(), notificationId: null, createdAt: new Date().toISOString() };
    const notificationId = await scheduleMedicationReminder(record).catch(() => null);
    const savedRecord = { ...record, notificationId };
    setMedications((prev) => [...prev, savedRecord]);
    // Keep the profile's own list in step, so Settings does not show a stale
    // answer to "what medications do you take". setProfile directly rather than
    // updateProfile: the latter derives records from this text, which would
    // send us straight back round.
    setProfile((prev) => {
      const listed = profileList(prev.medications);
      if (listed.some((name) => name.toLowerCase() === record.name.toLowerCase())) return prev;
      return { ...prev, medications: [...listed, record.name].join(", ") };
    });
  }, []);

  /**
   * Edit an existing medication.
   *
   * The reminder is rebuilt rather than patched: it encodes the name, dose and
   * time, so leaving the old notification in place would keep announcing the
   * old dose. Cancelling first also covers the case where the user has just
   * turned the reminder off — otherwise a switched-off reminder would keep
   * firing. A medication added during onboarding has no dose or schedule yet,
   * so this is the path that gives it one.
   */
  const updateMedication = useCallback(
    async (id: string, changes: Partial<Omit<Medication, "id" | "createdAt">>) => {
      // Read the current record out of the setter rather than closing over
      // `medications`, which would go stale between edits.
      let current: Medication | undefined;
      setMedications((prev) => {
        current = prev.find((item) => item.id === id);
        return prev;
      });
      if (!current) return;

      const updated: Medication = { ...current, ...changes, id: current.id, createdAt: current.createdAt };

      await cancelReminder(current.notificationId).catch(() => {});
      const notificationId = updated.reminderEnabled
        ? await scheduleMedicationReminder(updated).catch(() => null)
        : null;

      setMedications((prev) =>
        prev.map((item) => (item.id === id ? { ...updated, notificationId } : item)),
      );
    },
    [],
  );

  const removeMedication = useCallback((id: string) => {
    setMedications((prev) => {
      const medication = prev.find((item) => item.id === id);
      void cancelReminder(medication?.notificationId ?? null);
      if (medication) {
        setProfile((profile) => ({
          ...profile,
          medications: profileList(profile.medications)
            .filter((name) => name.toLowerCase() !== medication.name.toLowerCase())
            .join(", "),
        }));
      }
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const addAppointment = useCallback(async (appointment: Omit<Appointment, "id" | "createdAt" | "notificationId">) => {
    const record: Appointment = { ...appointment, id: generateId(), notificationId: null, createdAt: new Date().toISOString() };
    const notificationId = await scheduleAppointmentReminder(record).catch(() => null);
    setAppointments((prev) => [...prev, { ...record, notificationId }]);
  }, []);

  const removeAppointment = useCallback((id: string) => {
    setAppointments((prev) => {
      const appointment = prev.find((item) => item.id === id);
      void cancelReminder(appointment?.notificationId ?? null);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  // --- Family doctor / care team actions ---
  const updateFamilyDoctor = useCallback((updates: Partial<FamilyDoctor>) => {
    setFamilyDoctor((prev) => ({ ...prev, ...updates }));
  }, []);

  // --- Health Card actions ---
  const saveHealthCard = useCallback((card: HealthCardData) => {
    setHealthCard(card);
  }, []);

  const removeHealthCard = useCallback(() => {
    setHealthCard(null);
  }, []);

  /**
   * Pin a place for one-tap reuse. Most people alternate between a GP, a
   * specialist and a lab, so three covers the pattern without the list becoming
   * something to scroll. Adding a fourth replaces the oldest rather than
   * failing, which is what "favourite" implies — a rolling shortlist, not a
   * quota to manage.
   */
  const addFavouriteLocation = useCallback((value: string) => {
    const cleaned = value.trim();
    if (!cleaned) return;
    setFavouriteLocations((prev) => {
      const withoutDuplicate = prev.filter((entry) => entry.toLowerCase() !== cleaned.toLowerCase());
      return [cleaned, ...withoutDuplicate].slice(0, MAX_FAVOURITE_LOCATIONS);
    });
  }, []);

  const removeFavouriteLocation = useCallback((value: string) => {
    setFavouriteLocations((prev) => prev.filter((entry) => entry !== value));
  }, []);

  const savePreferredLanguage = useCallback((code: string) => {
    setPreferredLanguage(code);
  }, []);

  return {
    // State
    profile,
    documents,
    vaccines,
    medications,
    appointments,
    vitals,
    screenings,
    recordScreening,
    removeScreening,
    addVital,
    removeVital,
    healthCard,
    familyDoctor,
    favouriteLocations,
    addFavouriteLocation,
    removeFavouriteLocation,
    preferredLanguage,
    loaded,
    // Profile
    updateProfile,
    completeOnboarding,
    resetProfile,
    updateFamilyDoctor,
    savePreferredLanguage,
    // Documents
    addDocument,
    removeDocument,
    toggleChecklistItem,
    // Vaccines
    addVaccine,
    addTravelVaccine,
    updateVaccineDate,
    recordVaccineDose,
    removeVaccineDose,
    setVaccineProof,
    setVaccineDoseProof,
    removeVaccine,
    // Medications
    addMedication,
    updateMedication,
    removeMedication,
    // Appointments
    addAppointment,
    removeAppointment,
    // Health Card
    saveHealthCard,
    removeHealthCard,
  };
}

export const [ClairityProvider, useClairity] = createContextHook(useClairityState);
