import { Text, View } from "react-native";
import { color, font } from "./theme";

export const BRAND = "Sous";

/** The mark: a plate with a garnish. */
export function Mark({ size = 26, inverse }: { size?: number; inverse?: boolean }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: inverse ? color.white : color.ink, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: size * 0.62, height: size * 0.62, borderRadius: size, borderWidth: Math.max(1, size * 0.06), borderColor: inverse ? "rgba(23,22,20,0.18)" : "rgba(255,255,255,0.22)" }} />
      <View style={{ position: "absolute", top: size * 0.24, right: size * 0.24, width: size * 0.22, height: size * 0.22, borderRadius: size, backgroundColor: color.accent }} />
    </View>
  );
}

export function Logo({ size = 26, inverse }: { size?: number; inverse?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.36 }}>
      <Mark size={size} inverse={inverse} />
      <Text style={{ fontFamily: font.displayItalic, fontSize: size * 1.12, lineHeight: size * 1.3, color: inverse ? color.white : color.ink, letterSpacing: -0.4 }}>sous</Text>
    </View>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#DCD5C8", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: font.semibold, fontSize: size * 0.4, color: color.ink2 }}>{(name || "?").slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}
