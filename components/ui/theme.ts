// Sous design tokens. Warm paper background, near-black ink, one accent (paprika) used sparingly
// for the agent's live activity, green for things that are done, and a serif for headlines.

export const color = {
  bg: "#F5F3EE",
  surface: "#FFFFFF",
  sunken: "#EEEBE4",
  ink: "#171614",
  ink2: "#3A3732",
  muted: "#74706A",
  faint: "#A29D95",
  line: "#E5E0D7",
  lineStrong: "#D3CCBF",
  accent: "#D0472A",
  accentSoft: "#FBEAE4",
  accentInk: "#A23517",
  green: "#2C6A4E",
  greenSoft: "#E4EFE8",
  amber: "#9A6210",
  amberSoft: "#FAF0DB",
  blue: "#3D5DAE",
  blueSoft: "#E8EDF8",
  white: "#FFFFFF",
  overlay: "rgba(23,22,20,0.4)",
};

export const font = {
  display: "InstrumentSerif_400Regular",
  displayItalic: "InstrumentSerif_400Regular_Italic",
  regular: "InstrumentSans_400Regular",
  medium: "InstrumentSans_500Medium",
  semibold: "InstrumentSans_600SemiBold",
  bold: "InstrumentSans_700Bold",
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
};

export const radius = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };

export const shadow = {
  card: { boxShadow: "0 1px 2px rgba(23,22,20,0.04), 0 2px 10px rgba(23,22,20,0.035)" },
  raised: { boxShadow: "0 2px 4px rgba(23,22,20,0.05), 0 12px 32px rgba(23,22,20,0.08)" },
} as const;

export const layout = {
  /** Width at which the sidebar replaces the bottom tab bar. */
  wide: 900,
  /** Width at which the agent screen shows the context panel. */
  xwide: 1240,
  content: 760,
};
