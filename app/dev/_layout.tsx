import { Stack } from "expo-router";
import { colors } from "../../components/Screen";

// The Agent Studio developer screens keep their original "Schematic" look.
export default function DevLayout() {
  return (
    <Stack
      screenOptions={{
        title: "DEVELOPER",
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.paper,
        headerTitleStyle: { fontWeight: "900", fontSize: 15 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    />
  );
}
