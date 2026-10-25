import { Redirect } from "expo-router";
import { View } from "react-native";
import { color } from "../components/ui/theme";
import { useStore } from "../lib/store/StoreProvider";

export default function Index() {
  const { state, ready } = useStore();
  if (!ready) return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  return <Redirect href={state.onboarded ? "/agent" : "/onboarding"} />;
}
