import { Redirect, Slot } from "expo-router";
import { View } from "react-native";
import { AppShell } from "../../components/shell/AppShell";
import { color } from "../../components/ui/theme";
import { useStore } from "../../lib/store/StoreProvider";

export default function MainLayout() {
  const { state, ready } = useStore();
  if (!ready) return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  if (!state.onboarded) return <Redirect href="/onboarding" />;
  return (
    <AppShell>
      <Slot />
    </AppShell>
  );
}
