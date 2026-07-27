// CLAIRITY — Tab navigation
import { Tabs } from "expo-router";
import {
  FileHeart,
  Shield,
  Pill,
  Settings as SettingsIcon,
  CalendarDays,
} from "lucide-react-native";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Space } from "@/constants/theme";

const C = Colors.light;

/** Bar height above the home indicator. The indicator's inset is added on top. */
const TAB_BAR_CONTENT_HEIGHT = 56;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // On devices with a home indicator this is the inset (~34pt). On web and
  // older devices the inset is 0, so we keep a minimum gap to avoid clipping
  // the tab labels against the very bottom edge.
  const bottomGap = Math.max(insets.bottom, Space.sm);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.tabIconSelected,
        tabBarInactiveTintColor: C.tabIconDefault,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.border,
          borderTopWidth: 1,
          paddingTop: Space.sm,
          // A hardcoded height here overrides the navigator's own safe-area
          // math, which squashed the bar into the home indicator on every
          // device that has one. The gap has to be added explicitly, and must
          // never be zero or the labels clip on web.
          height: TAB_BAR_CONTENT_HEIGHT + bottomGap,
          paddingBottom: bottomGap,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <FileHeart color={color} size={25} strokeWidth={2.5} />,
        }}
      />
      <Tabs.Screen
        name="vaccines"
        options={{
          title: "Vaccines",
          tabBarIcon: ({ color }) => <Shield color={color} size={25} strokeWidth={2.5} />,
        }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: "Meds",
          tabBarIcon: ({ color }) => <Pill color={color} size={25} strokeWidth={2.5} />,
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color }) => <CalendarDays color={color} size={25} strokeWidth={2.5} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <SettingsIcon color={color} size={25} strokeWidth={2.5} />,
        }}
      />
    </Tabs>
  );
}
