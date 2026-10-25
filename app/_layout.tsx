import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "../components/Screen";

// Every file in app/ is a screen: app/index.tsx is "/", app/chat.tsx is "/chat", and so on.
// The header is the ink bar from the Agent Studio look; change it in screenOptions.
export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          title: "AGENT APP",
          headerStyle: { backgroundColor: colors.ink },
          headerTintColor: colors.paper,
          headerTitleStyle: { fontWeight: "900", fontSize: 15 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      />
    </>
  );
}
