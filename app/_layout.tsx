import { InstrumentSans_400Regular } from "@expo-google-fonts/instrument-sans/400Regular";
import { InstrumentSans_500Medium } from "@expo-google-fonts/instrument-sans/500Medium";
import { InstrumentSans_600SemiBold } from "@expo-google-fonts/instrument-sans/600SemiBold";
import { InstrumentSans_700Bold } from "@expo-google-fonts/instrument-sans/700Bold";
import { InstrumentSerif_400Regular } from "@expo-google-fonts/instrument-serif/400Regular";
import { InstrumentSerif_400Regular_Italic } from "@expo-google-fonts/instrument-serif/400Regular_Italic";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono/400Regular";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import { color } from "../components/ui/theme";
import { foodStatus } from "../lib/agent/companion";
import { autopilotTick, refreshPlans } from "../lib/agent/runner";
import { StoreProvider, useStore } from "../lib/store/StoreProvider";

export default function RootLayout() {
  const [loaded] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") document.title = "Sous · your food agent";
  }, []);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  return (
    <StoreProvider>
      <StatusBar style="dark" />
      <Runtime />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: "fade" }} />
    </StoreProvider>
  );
}

/** Finds out what the companion server offers (Gemini, devnet payments) and runs the autopilot. */
function Runtime() {
  const store = useStore();
  const { update, ready } = store;

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      foodStatus()
        .then((status) => {
          if (cancelled) return;
          update((s) => ({
            ...s,
            runtime: {
              companion: "online",
              ai: status.ai ? "model" : "on-device",
              aiLabel: status.model ?? undefined,
              payments: status.payments.live ? "live" : "simulated",
              agentAddress: status.payments.agent,
              liveBalanceUsdc: status.payments.balanceUsdc,
              paymentsReason: status.payments.reason,
            },
          }));
        })
        .catch(() => !cancelled && update((s) => ({ ...s, runtime: { companion: "offline", ai: "on-device", payments: "simulated" } })));
    check();
    const t = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [update]);

  useEffect(() => {
    if (!ready) return;
    refreshPlans(store);
    const tick = setInterval(() => void autopilotTick(store), 2000);
    const replan = setInterval(() => refreshPlans(store), 20_000);
    return () => {
      clearInterval(tick);
      clearInterval(replan);
    };
    // store identity changes on every state change; the api functions read the latest state themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return null;
}
