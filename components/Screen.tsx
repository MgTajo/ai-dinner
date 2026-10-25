import type { ReactNode } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

// Small building blocks in the Agent Studio "Schematic" look: ink-bordered modules with a
// labelled header strip, square status lights and hard shadows. Purple marks the main action;
// green means done or healthy. Change the colours below to make it yours.

export const colors = {
  canvas: "#E9E9E4",
  surface: "#FFFFFF",
  strip: "#F5F5F1",
  diagram: "#FAFAF8",
  ink: "#161616",
  ink2: "#3D3D3A",
  muted: "#6A6A64",
  hairline: "#E2E2DC",
  rest: "#CFCFC8",
  soft: "#D9D9D2",
  signal: "#5A3CF0",
  signalPress: "#2E1A9E",
  signalInk: "#4528D6",
  signalTint: "#F0ECFF",
  ok: "#10A36D",
  okText: "#0B7A51",
  okTint: "#EAF7F0",
  okBorder: "#B5E4CF",
  fault: "#C2361F",
  faultTint: "#FDEDEA",
  warnText: "#6E4700",
  warnTint: "#FFF6E2",
  warnBorder: "#EBD3A0",
  paper: "#EDEDE8",
};

export const mono = Platform.select({ ios: "Menlo", default: "monospace" });

/** A scrolling page on the canvas background. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={styles.screen}>
      {children}
    </ScrollView>
  );
}

/** Small mono label, big heavy title and an optional intro. */
export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
      <Text style={styles.display}>{title}</Text>
      {children ? <Text style={styles.lead}>{children}</Text> : null}
    </View>
  );
}

/** A bordered panel with a labelled header strip. */
export function Module({ label, right, children }: { label: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.module}>
      <View style={styles.strip}>
        <Text style={styles.stripText}>{label.toUpperCase()}</Text>
        {right !== undefined ? <View style={styles.stripRight}>{right}</View> : null}
      </View>
      <View style={styles.moduleBody}>{children}</View>
    </View>
  );
}

/** Text for the right-hand side of a module strip, optionally with a status light. */
export function StripStatus({ tone, children }: { tone?: LedTone; children: string }) {
  return (
    <>
      {tone !== undefined ? <Led tone={tone} /> : null}
      <Text style={[styles.stripText, { color: colors.muted }]}>{children.toUpperCase()}</Text>
    </>
  );
}

type LedTone = "signal" | "ok" | "fault" | "off";

/** A square status light. Decorative: always pair it with text. */
export function Led({ tone = "off", size = 8 }: { tone?: LedTone; size?: number }) {
  const background = { signal: colors.signal, ok: colors.ok, fault: colors.fault, off: colors.soft }[tone];
  return <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: size, height: size, borderRadius: 1, backgroundColor: background }} />;
}

/** Big button with a hard shadow. Pressing moves it down onto its shadow, like a physical key. */
export function Button({
  title,
  onPress,
  disabled,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const primary = variant === "primary";
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} onPress={onPress} disabled={disabled}>
      {({ pressed }) => {
        const down = pressed && !disabled;
        return (
          <View
            style={{
              borderRadius: 4,
              marginTop: down ? 3 : 0,
              paddingBottom: down || disabled ? 0 : 3,
              backgroundColor: disabled ? "transparent" : primary ? colors.signalPress : colors.ink,
            }}
          >
            <View
              style={[
                styles.button,
                primary ? styles.buttonPrimary : styles.buttonSecondary,
                disabled && { backgroundColor: colors.hairline, borderColor: colors.hairline },
              ]}
            >
              <Text style={[styles.buttonText, { color: disabled ? colors.muted : primary ? "#FFFFFF" : colors.ink }]}>
                {title.toUpperCase()}
              </Text>
            </View>
          </View>
        );
      }}
    </Pressable>
  );
}

/** A coloured message box: amber for notices, red for errors, green for success. */
export function Notice({ tone = "warn", children }: { tone?: "warn" | "fault" | "ok"; children: ReactNode }) {
  const palette = {
    warn: [colors.warnBorder, colors.warnTint, colors.warnText],
    fault: [colors.fault, colors.faultTint, colors.fault],
    ok: [colors.okBorder, colors.okTint, colors.okText],
  }[tone];
  return (
    <View style={[styles.notice, { borderColor: palette[0], backgroundColor: palette[1] }]}>
      <Text style={{ color: palette[2], fontSize: 13, lineHeight: 19 }}>{children}</Text>
    </View>
  );
}

/** Label / value rows, e.g. a price, an address or a network id. */
export function KeyValue({ rows }: { rows: [string, string][] }) {
  return (
    <View style={{ gap: 8 }}>
      {rows.map(([k, v]) => (
        <View key={k} style={{ gap: 2 }}>
          <Text style={styles.label}>{k.toUpperCase()}</Text>
          <Text style={{ fontFamily: mono, fontSize: 12, color: colors.ink }} selectable>
            {v}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A 20-cell meter: purple = spent, green = still available. */
export function Meter({ spent, total }: { spent: number; total: number }) {
  const spentCells = total > 0 ? Math.min(20, Math.round((spent / total) * 20)) : 0;
  return (
    <View style={styles.meter} accessibilityLabel={`Spent ${spent} of ${total}`}>
      {Array.from({ length: 20 }, (_, i) => (
        <View key={i} style={[styles.cell, { backgroundColor: i < spentCells ? colors.signal : colors.ok }]} />
      ))}
    </View>
  );
}

/** Shows any value as pretty-printed JSON on an ink panel. */
export function Output({ value }: { value: unknown }) {
  return (
    <Text style={styles.output} selectable>
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </Text>
  );
}

/** Opens a Solana devnet transaction in the public explorer. */
export function ExplorerLink({ signature }: { signature: string }) {
  return (
    <Text
      accessibilityRole="link"
      style={{ color: colors.signal, fontFamily: mono, fontSize: 12 }}
      onPress={() => Linking.openURL(`https://explorer.solana.com/tx/${signature}?cluster=devnet`)}
    >
      {signature.slice(0, 8)}…{signature.slice(-8)} ↗
    </Text>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export const styles = StyleSheet.create({
  screen: { padding: 16, paddingBottom: 40, gap: 14 },
  header: { gap: 10, marginBottom: 4, marginTop: 8 },
  eyebrow: { fontFamily: mono, fontSize: 10.5, letterSpacing: 0.6, color: colors.muted },
  display: { fontSize: 38, lineHeight: 38, fontWeight: "900", letterSpacing: -1.4, color: colors.ink },
  lead: { fontSize: 15, lineHeight: 22, color: colors.ink2 },
  module: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink, borderRadius: 4, overflow: "hidden" },
  strip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    backgroundColor: colors.strip,
  },
  stripText: { fontFamily: mono, fontSize: 10.5, letterSpacing: 0.4, color: colors.ink },
  stripRight: { flexDirection: "row", alignItems: "center", gap: 7 },
  moduleBody: { padding: 14, gap: 12 },
  label: { fontFamily: mono, fontSize: 10, letterSpacing: 0.4, color: colors.muted },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  button: { height: 50, paddingHorizontal: 18, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  buttonPrimary: { backgroundColor: colors.signal },
  buttonSecondary: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: colors.ink },
  buttonText: { fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },
  notice: { borderWidth: 1, borderRadius: 3, paddingVertical: 10, paddingHorizontal: 12 },
  meter: { flexDirection: "row", gap: 3, height: 14 },
  cell: { flex: 1, borderRadius: 1 },
  output: {
    fontFamily: mono,
    fontSize: 11.5,
    lineHeight: 18,
    color: "#D4D4CE",
    backgroundColor: colors.ink,
    padding: 12,
    borderRadius: 4,
    overflow: "hidden",
  },
});
