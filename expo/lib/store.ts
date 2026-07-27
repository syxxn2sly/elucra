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
} as const;

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

function useClairityState() {
  const [profile, setProfile] = useState<HealthProfile>(DEFAULT_PROFILE);
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [vaccines, setVaccines] = useState<VaccineRecord[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [healthCard, setHealthCard] = useState<HealthCardData | null>(null);
  const [familyDoctor, setFamilyDoctor] = useState<FamilyDoctor>(DEFAULT_FAMILY_DOCTOR);
  const [loaded, setLoaded] = useState(false);

  // Load all persisted state on mount
  useEffect(() => {
    (async () => {
      try {
        const [profileStr, docsStr, vaccinesStr, medsStr, cardStr, doctorStr, appointmentsStr] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_KEYS.profile),
            AsyncStorage.getItem(STORAGE_KEYS.documents),
            AsyncStorage.getItem(STORAGE_KEYS.vaccines),
            AsyncStorage.getItem(STORAGE_KEYS.medications),
            AsyncStorage.getItem(STORAGE_KEYS.healthCard),
            AsyncStorage.getItem(STORAGE_KEYS.familyDoctor),
            AsyncStorage.getItem(STORAGE_KEYS.appointments),
          ]);

        if (profileStr) setProfile(JSON.parse(profileStr) as HealthProfile);
        if (docsStr) setDocuments(JSON.parse(docsStr) as SavedDocument[]);
        if (vaccinesStr) setVaccines(JSON.parse(vaccinesStr) as VaccineRecord[]);
        if (medsStr) setMedications((JSON.parse(medsStr) as Medication[]).map((medication) => ({ ...medication, reminderEnabled: medication.reminderEnabled ?? false, reminderTime: medication.reminderTime ?? "", notificationId: medication.notificationId ?? null })));
        if (appointmentsStr) setAppointments(JSON.parse(appointmentsStr) as Appointment[]);
        if (cardStr) setHealthCard(JSON.parse(cardStr) as HealthCardData);
        if (doctorStr) setFamilyDoctor({ ...DEFAULT_FAMILY_DOCTOR, ...(JSON.parse(doctorStr) as FamilyDoctor) });
      } catch (error) {
        console.error("[CLAIRITY] Failed to load state:", error);
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

  // --- Profile actions ---
  const updateProfile = useCallback((updates: Partial<HealthProfile>) => {
    setProfile((prev) => ({ ...prev, ...updates }));
  }, []);

  const completeOnboarding = useCallback((finalProfile: HealthProfile) => {
    setProfile({ ...finalProfile, onboarded: true });
  }, []);

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
          return { ...v, monthReceived: month, yearReceived: year, hasDate, nextDueDate: nextDue };
        }),
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
  }, []);

  const removeMedication = useCallback((id: string) => {
    setMedications((prev) => {
      const medication = prev.find((item) => item.id === id);
      void cancelReminder(medication?.notificationId ?? null);
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

  return {
    // State
    profile,
    documents,
    vaccines,
    medications,
    appointments,
    healthCard,
    familyDoctor,
    loaded,
    // Profile
    updateProfile,
    completeOnboarding,
    resetProfile,
    updateFamilyDoctor,
    // Documents
    addDocument,
    removeDocument,
    toggleChecklistItem,
    // Vaccines
    addVaccine,
    addTravelVaccine,
    updateVaccineDate,
    setVaccineProof,
    removeVaccine,
    // Medications
    addMedication,
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
