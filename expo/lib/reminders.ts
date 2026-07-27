import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import type { Appointment, Medication } from "./types";

const MEDICATION_CHANNEL = "medication-reminders";
const APPOINTMENT_CHANNEL = "appointment-reminders";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function prepareNotifications(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(MEDICATION_CHANNEL, {
      name: "Medication reminders",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync(APPOINTMENT_CHANNEL, {
      name: "Appointment reminders",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    });
  }
  const settings = await Notifications.getPermissionsAsync();
  const finalSettings = settings.granted ? settings : await Notifications.requestPermissionsAsync();
  return finalSettings.granted;
}

function parseReminderTime(value: string): { hour: number; minute: number } | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60 ? { hour, minute } : null;
}

/** Schedule a daily reminder that the person explicitly enabled for a medication. */
export async function scheduleMedicationReminder(medication: Medication): Promise<string | null> {
  const time = parseReminderTime(medication.reminderTime);
  if (!medication.reminderEnabled || !time || !(await prepareNotifications())) return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Medication reminder",
      body: medication.dose ? `Time for ${medication.name} — ${medication.dose}` : `Time for ${medication.name}`,
      sound: "default",
      data: { type: "medication", medicationId: medication.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: time.hour,
      minute: time.minute,
      channelId: MEDICATION_CHANNEL,
    },
  });
}

/** Schedule one local reminder 24 hours before a confirmed appointment, or immediately if it is closer. */
export async function scheduleAppointmentReminder(appointment: Appointment): Promise<string | null> {
  const appointmentDate = new Date(appointment.dateTime);
  if (Number.isNaN(appointmentDate.getTime()) || appointmentDate.getTime() <= Date.now() || !(await prepareNotifications())) return null;
  const reminderDate = new Date(Math.max(Date.now() + 60_000, appointmentDate.getTime() - 24 * 60 * 60 * 1000));
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Appointment tomorrow",
      body: appointment.location ? `${appointment.title} · ${appointment.location}` : appointment.title,
      sound: "default",
      data: { type: "appointment", appointmentId: appointment.id },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate, channelId: APPOINTMENT_CHANNEL },
  });
}

export async function cancelReminder(notificationId: string | null): Promise<void> {
  if (!notificationId || Platform.OS === "web") return;
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}
