import { router, Stack } from "expo-router";
import { Compass } from "lucide-react-native";
import React from "react";
import { View, StyleSheet } from "react-native";

import { type Palette } from "@/constants/colors";
import { useTheme } from "@/lib/theme";
import { EmptyState, PrimaryButton } from "@/components/ui";
import { Space } from "@/constants/theme";


export default function NotFoundScreen() {
  const { C, styles } = useTheme(makeStyles);
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={styles.screen}>
        <EmptyState
          icon={<Compass color={C.primary} size={40} strokeWidth={2.5} />}
          title="This screen doesn't exist"
          message="The page you're looking for isn't here."
        />
        <PrimaryButton label="Go to home" onPress={() => router.replace("/(tabs)")} style={styles.button} />
      </View>
    </>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
    padding: Space.xl,
  },
  button: { marginTop: Space.lg, width: "100%" },
});
