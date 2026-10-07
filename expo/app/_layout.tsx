// Elucra root layout — wraps app in QueryClient + ClairityProvider
import { Nunito_600SemiBold, Nunito_700Bold } from "@expo-google-fonts/nunito";
import { NunitoSans_400Regular, NunitoSans_600SemiBold } from "@expo-google-fonts/nunito-sans";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ClairityProvider } from "@/lib/store";
import { AnimatedSplash } from "@/components/animated-splash";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    /*
      Every screen draws its own <ScreenHeader/>, so the native stack header is
      off everywhere. Previously it was on for six screens that ALSO rendered a
      custom header, which stacked two back buttons and doubled the safe-area
      inset. Screen titles now live in the screen itself.
    */
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      {/*
        The swipe-back gesture stays enabled on onboarding: the screen is
        reachable from Settings, and disabling the gesture stranded users on a
        screen with no way out. Onboarding hides its own back control when
        there is genuinely no history to pop.
      */}
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="simplify" />
      <Stack.Screen name="document-detail" />
      <Stack.Screen name="vaccine-detail" />
      <Stack.Screen name="add-medication" options={{ presentation: "modal" }} />
      <Stack.Screen name="health-card-setup" />
      <Stack.Screen name="healthcard" />
      <Stack.Screen name="reports" />
      <Stack.Screen name="visit-summary" />
      <Stack.Screen name="vitals" />
      <Stack.Screen name="preventive-care" />
      <Stack.Screen name="travel" />
      <Stack.Screen name="identity" />
      <Stack.Screen name="add-appointment" options={{ presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Every Type level names a bundled family, so rendering before these load
  // would flash the whole app in the system font and then reflow. Hold the
  // splash until they are ready.
  const [splashDone, setSplashDone] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    Nunito_600SemiBold,
    Nunito_700Bold,
    NunitoSans_400Regular,
    NunitoSans_600SemiBold,
  });

  useEffect(() => {
    // Hide on error too — a missing font should degrade to the system face,
    // not leave the user staring at a splash screen forever.
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ClairityProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <RootLayoutNav />
          {/*
            Over the app rather than before it, so the app is fully laid out by
            the time the overlay fades — nothing has to animate in behind it.
          */}
          {splashDone ? null : <AnimatedSplash onFinish={() => setSplashDone(true)} />}
        </GestureHandlerRootView>
      </ClairityProvider>
    </QueryClientProvider>
  );
}
